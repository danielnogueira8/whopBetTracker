import { NextRequest, NextResponse } from "next/server"
import { verifyUserToken } from "@whop/api"
import { db } from "~/db"
import { betPurchases, betSaleListings, experienceSettings, upcomingBets, userBetAccess } from "~/db/schema"
import { and, eq } from "drizzle-orm"
import { whop, getOrStoreSellerCompanyId, createSellerWhopSdk } from "~/lib/whop"
import { env } from "~/env"
import { userHasAccessToAnyProducts } from "~/lib/whop"

function planIdForPrice(priceCents: number): string | null {
  const key = `BET_PRICE_${priceCents}_PLAN_ID` as const
  // @ts-ignore - dynamic access of runtime env
  return process.env[key] || null
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await verifyUserToken(req.headers)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { id } = await params

    // Load bet and listing
    const betRows = await db.select().from(upcomingBets).where(eq(upcomingBets.id, id)).limit(1)
    const bet = betRows[0]
    if (!bet) return NextResponse.json({ error: 'Bet not found' }, { status: 404 })

    const listingRows = await db.select().from(betSaleListings).where(eq(betSaleListings.betId, id)).limit(1)
    const listing = listingRows[0]
    if (!listing || !listing.active) return NextResponse.json({ error: 'Not for sale' }, { status: 400 })

    const forceBuyer = req.headers.get('x-force-buyer') === 'true'
    // Check if buyer already has access via membership or admin (respect paywall-configured products)
    if (!forceBuyer) {
      const access = await whop.access.checkIfUserHasAccessToExperience({ experienceId: bet.experienceId, userId })
      if (access?.accessLevel === 'admin') {
        return NextResponse.json({ error: 'Already eligible' }, { status: 409 })
      }

      try {
        const s = await db
          .select({ paywallConfig: experienceSettings.paywallConfig })
          .from(experienceSettings)
          .where(eq(experienceSettings.experienceId, bet.experienceId))
          .limit(1)
        const cfg = (s[0]?.paywallConfig as any) || { enabled: false, productIds: [], rule: 'any' }
        if (cfg?.enabled) {
          const productIds: string[] = Array.isArray(cfg.productIds) ? cfg.productIds : []
          if (productIds.length > 0) {
            const eligible = await userHasAccessToAnyProducts({ userId, productIds })
            if (eligible) return NextResponse.json({ error: 'Already eligible' }, { status: 409 })
          }
        }
      } catch {}
    }

    if (!forceBuyer) {
      // Check per-bet prior purchase
      const existingAccess = await db
        .select({ id: userBetAccess.id })
        .from(userBetAccess)
        .where(and(eq(userBetAccess.betId, bet.id), eq(userBetAccess.userId, userId)))
        .limit(1)
      if (existingAccess[0]) {
        return NextResponse.json({ error: 'Already purchased' }, { status: 409 })
      }
    }

    // Get seller's company ID from experience (store if not cached)
    const sellerCompanyId = await getOrStoreSellerCompanyId(listing.sellerUserId, bet.experienceId)
    if (!sellerCompanyId) {
      return NextResponse.json({ error: 'Seller company not found' }, { status: 400 })
    }

    // Verify seller is admin of the company/experience
    const sellerAccess = await whop.access.checkIfUserHasAccessToExperience({
      experienceId: bet.experienceId,
      userId: listing.sellerUserId,
    })
    
    if (sellerAccess?.accessLevel !== 'admin') {
      console.error('[checkout] Seller is not admin', {
        sellerUserId: listing.sellerUserId,
        accessLevel: sellerAccess?.accessLevel,
        experienceId: bet.experienceId,
      })
      return NextResponse.json({ 
        error: 'Seller must be an admin to create products' 
      }, { status: 403 })
    }

    // Create seller SDK instance
    const sellerWhop = createSellerWhopSdk(sellerCompanyId)

    const priceInDollars = Number((listing.priceCents / 100).toFixed(2))
    const baseCurrency = listing.currency?.toLowerCase() as (typeof listing.currency)

    const routeSlugBase = `bet-${bet.id}`.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()
    const uniqueSuffix = Math.random().toString(36).slice(2, 8)
    const accessPassRoute = `${routeSlugBase}-${uniqueSuffix}`.slice(0, 60).replace(/^-+|-+$/g, '')

    const accessPass = await sellerWhop.accessPasses.createAccessPass({
      title: `Bet Access: ${bet.game}`,
      description: `Access to bet: ${bet.outcome}`,
      shortenedDescription: `Bet: ${bet.outcome}`.slice(0, 150),
      companyId: sellerCompanyId,
      experienceIds: [bet.experienceId],
      route: accessPassRoute,
      visibility: 'hidden',
      planOptions: {
        planType: 'one_time',
        initialPrice: priceInDollars,
        baseCurrency: baseCurrency,
        releaseMethod: 'buy_now',
        visibility: 'hidden',
      },
    }) as any

    if (accessPass?._error) {
      console.error('[checkout] accessPass creation failed', accessPass._error)
      throw new Error('Failed to create access pass for seller')
    }

    if (!accessPass?.id) {
      console.error('[checkout] Missing accessPass id', accessPass)
      return NextResponse.json({ error: 'Failed to create access pass' }, { status: 500 })
    }

    const plansData = (await sellerWhop.companies.listPlans({
      companyId: sellerCompanyId,
      filter: {
        accessPassId: accessPass.id,
      },
      first: 1,
    })) as any

    if (plansData?._error) {
      console.error('[checkout] listPlans failed', plansData._error)
      throw new Error('Failed to load seller plan')
    }

    const plan = plansData?.plans?.nodes?.[0]

    if (!plan?.id) {
      console.error('[checkout] Plan not found after creation', plansData)
      return NextResponse.json({ error: 'Failed to retrieve plan' }, { status: 500 })
    }

    const metadata = {
      type: 'bet_purchase',
      betId: bet.id,
      listingId: listing.id,
      priceCents: String(listing.priceCents),
      experienceId: bet.experienceId,
      sellerCompanyId,
      sellerAccessPassId: accessPass.id,
      sellerPlanId: plan.id,
    } as any

    // Create checkout session using seller's company SDK instance
    // This should route payments to the seller's company
    const checkoutSession = await sellerWhop.payments.createCheckoutSession({
      planId: plan.id,
      metadata,
    })

    if (!checkoutSession) return NextResponse.json({ error: 'Failed to create checkout' }, { status: 500 })

    // Record pending purchase
    await db
      .insert(betPurchases)
      .values({
        listingId: listing.id,
        buyerUserId: userId,
        checkoutId: checkoutSession.id,
        amountCents: listing.priceCents,
        currency: listing.currency,
        status: 'pending',
      })

    return NextResponse.json({ checkoutId: checkoutSession.id, planId: plan.id })
  } catch (error) {
    console.error('Failed to start checkout:', error)
    const errorMessage = error instanceof Error ? error.message : 'Failed to start checkout'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}


