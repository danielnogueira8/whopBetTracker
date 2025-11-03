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

    // Create product dynamically on seller's company using REST API
    // Use x-on-behalf-of and x-company-id headers to act on behalf of seller's company
    console.log('[checkout] Creating product', {
      sellerUserId: listing.sellerUserId,
      sellerCompanyId,
      headers: {
        'x-on-behalf-of': listing.sellerUserId,
        'x-company-id': sellerCompanyId,
      },
    })

    // Try without company_id in body since it's in headers
    const productResponse = await fetch('https://api.whop.com/api/v2/products', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.WHOP_API_KEY}`,
        'Content-Type': 'application/json',
        'X-On-Behalf-Of': listing.sellerUserId, // Seller's user ID - try capitalized headers
        'X-Company-Id': sellerCompanyId,        // Seller's company ID
      },
      body: JSON.stringify({
        title: `Bet Access: ${bet.game}`,
        description: `Access to bet: ${bet.outcome}`,
        type: 'api_only',
      }),
    })

    if (!productResponse.ok) {
      const errorText = await productResponse.text()
      console.error('[checkout] Product creation failed', {
        status: productResponse.status,
        error: errorText,
        sellerCompanyId,
        sellerUserId: listing.sellerUserId,
        betId: bet.id,
        requestHeaders: {
          'x-on-behalf-of': listing.sellerUserId,
          'x-company-id': sellerCompanyId,
        },
      })
      throw new Error(`Product creation failed: ${productResponse.status} ${errorText}`)
    }

    const productData = await productResponse.json()
    const product = productData.data || productData || productData.product

    if (!product?.id) {
      console.error('[checkout] Invalid product response', productData)
      return NextResponse.json({ error: 'Failed to create product' }, { status: 500 })
    }

    // Create plan dynamically using REST API on seller's company
    // Use x-on-behalf-of and x-company-id headers to act on behalf of seller's company
    const priceInDollars = listing.priceCents / 100
    const planResponse = await fetch('https://api.whop.com/api/v2/plans', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.WHOP_API_KEY}`,
        'Content-Type': 'application/json',
        'X-On-Behalf-Of': listing.sellerUserId, // Seller's user ID - try capitalized headers
        'X-Company-Id': sellerCompanyId,        // Seller's company ID
      },
      body: JSON.stringify({
        product_id: product.id,
        initial_price: priceInDollars,
        currency: listing.currency,
        plan_type: 'one_time',
      }),
    })

    if (!planResponse.ok) {
      const errorText = await planResponse.text()
      console.error('[checkout] Plan creation failed', {
        status: planResponse.status,
        error: errorText,
        sellerCompanyId,
        productId: product.id,
        priceInDollars,
      })
      throw new Error(`Plan creation failed: ${planResponse.status} ${errorText}`)
    }

    const planData = await planResponse.json()
    const plan = planData.data || planData || planData.plan

    if (!plan?.id) {
      console.error('[checkout] Invalid plan response', planData)
      return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 })
    }

    const metadata = {
      type: 'bet_purchase',
      betId: bet.id,
      listingId: listing.id,
      priceCents: String(listing.priceCents),
      experienceId: bet.experienceId,
      sellerCompanyId,
      sellerProductId: product.id,
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


