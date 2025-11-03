import { NextRequest, NextResponse } from "next/server"
import { verifyUserToken, type Currencies } from "@whop/api"
import { db } from "~/db"
import { experienceSettings, parlayPurchases, parlaySaleListings, parlays, userParlayAccess } from "~/db/schema"
import { and, eq } from "drizzle-orm"
import { whop, getOrStoreSellerCompanyId, createSellerWhopSdk } from "~/lib/whop"
import { env } from "~/env"
import { userHasAccessToAnyProducts } from "~/lib/whop"

function planIdForPrice(priceCents: number): string | null {
  const key = `BET_PRICE_${priceCents}_PLAN_ID` as const
  // @ts-ignore
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
    const rows = await db.select().from(parlays).where(eq(parlays.id, id)).limit(1)
    const parlay = rows[0]
    if (!parlay) return NextResponse.json({ error: 'Parlay not found' }, { status: 404 })

    const listingRows = await db.select().from(parlaySaleListings).where(eq(parlaySaleListings.parlayId, id)).limit(1)
    const listing = listingRows[0]
    if (!listing || !listing.active) return NextResponse.json({ error: 'Not for sale' }, { status: 400 })

    const forceBuyer = req.headers.get('x-force-buyer') === 'true'
    if (!forceBuyer) {
      const access = await whop.access.checkIfUserHasAccessToExperience({ experienceId: parlay.experienceId, userId })
      if (access?.accessLevel === 'admin') {
        return NextResponse.json({ error: 'Already eligible' }, { status: 409 })
      }
      try {
        const s = await db
          .select({ paywallConfig: experienceSettings.paywallConfig })
          .from(experienceSettings)
          .where(eq(experienceSettings.experienceId, parlay.experienceId))
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
      const existingAccess = await db
        .select({ id: userParlayAccess.id })
        .from(userParlayAccess)
        .where(and(eq(userParlayAccess.parlayId, parlay.id), eq(userParlayAccess.userId, userId)))
        .limit(1)
      if (existingAccess[0]) return NextResponse.json({ error: 'Already purchased' }, { status: 409 })
    }

    // Get seller's company ID from experience (store if not cached)
    const sellerCompanyId = await getOrStoreSellerCompanyId(listing.sellerUserId, parlay.experienceId)
    if (!sellerCompanyId) {
      return NextResponse.json({ error: 'Seller company not found' }, { status: 400 })
    }

    // Verify seller is admin of the company/experience
    const sellerAccess = await whop.access.checkIfUserHasAccessToExperience({
      experienceId: parlay.experienceId,
      userId: listing.sellerUserId,
    })
    
    if (sellerAccess?.accessLevel !== 'admin') {
      console.error('[parlay-checkout] Seller is not admin', {
        sellerUserId: listing.sellerUserId,
        accessLevel: sellerAccess?.accessLevel,
        experienceId: parlay.experienceId,
      })
      return NextResponse.json({ 
        error: 'Seller must be an admin to create products' 
      }, { status: 403 })
    }

    // Create seller SDK instance
    const sellerWhop = createSellerWhopSdk(sellerCompanyId, listing.sellerUserId)

    const priceInDollars = Number((listing.priceCents / 100).toFixed(2))
    const baseCurrency = listing.currency?.toLowerCase() as Currencies | undefined

    const routeSlugBase = `parlay-${parlay.id}`.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()
    const uniqueSuffix = Math.random().toString(36).slice(2, 8)
    const accessPassRoute = `${routeSlugBase}-${uniqueSuffix}`.slice(0, 60).replace(/^-+|-+$/g, '')

    const accessPass = await sellerWhop.accessPasses.createAccessPass({
      title: `Parlay Access: ${parlay.name}`,
      description: `Access to parlay: ${parlay.name}`,
      companyId: sellerCompanyId,
      experienceIds: [parlay.experienceId],
      route: accessPassRoute,
      visibility: 'hidden',
      planOptions: {
        planType: 'one_time',
        initialPrice: priceInDollars,
        baseCurrency,
        releaseMethod: 'buy_now',
        visibility: 'hidden',
      },
    }) as any

    if (accessPass?._error) {
      console.error('[parlay-checkout] accessPass creation failed', accessPass._error)
      throw new Error('Failed to create access pass for seller')
    }

    if (!accessPass?.id) {
      console.error('[parlay-checkout] Missing accessPass id', accessPass)
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
      console.error('[parlay-checkout] listPlans failed', plansData._error)
      throw new Error('Failed to load seller plan')
    }

    const plan = plansData?.plans?.nodes?.[0]

    if (!plan?.id) {
      console.error('[parlay-checkout] Plan not found after creation', plansData)
      return NextResponse.json({ error: 'Failed to retrieve plan' }, { status: 500 })
    }

    const metadata = {
      type: 'parlay_purchase',
      parlayId: parlay.id,
      listingId: listing.id,
      priceCents: String(listing.priceCents),
      experienceId: parlay.experienceId,
      sellerCompanyId,
      sellerAccessPassId: accessPass.id,
      sellerPlanId: plan.id,
    } as any

    // Create checkout session using seller's company
    // SDK instance already has sellerCompanyId, so we don't need to pass it
    const checkoutSession = await sellerWhop.payments.createCheckoutSession({
      planId: plan.id,
      metadata,
    })

    if (!checkoutSession) return NextResponse.json({ error: 'Failed to create checkout' }, { status: 500 })

    await db.insert(parlayPurchases).values({
      listingId: listing.id,
      buyerUserId: userId,
      checkoutId: checkoutSession.id,
      amountCents: listing.priceCents,
      currency: listing.currency,
      sellerCompanyId,
      sellerAccessPassId: accessPass.id,
      sellerPlanId: plan.id,
      status: 'pending',
    })

    return NextResponse.json({ checkoutId: checkoutSession.id, planId: plan.id })
  } catch (e) {
    console.error('Parlay checkout failed', e)
    const errorMessage = e instanceof Error ? e.message : 'Failed to start checkout'
    return NextResponse.json({ error: errorMessage }, { status: 500 })
  }
}


