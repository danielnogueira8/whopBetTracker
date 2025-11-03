import { NextRequest, NextResponse } from "next/server"
import { verifyUserToken } from "@whop/api"
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

    // Create seller SDK instance
    const sellerWhop = createSellerWhopSdk(sellerCompanyId)

    // Create product dynamically on seller's company
    let product
    try {
      product = await sellerWhop.products.create({
        title: `Parlay Access: ${parlay.name}`,
        description: `Access to parlay: ${parlay.name}`,
        type: 'api_only',
      } as any)
    } catch (error) {
      console.error('[parlay-checkout] Failed to create product', error)
      // Fallback: use REST API directly if SDK doesn't support
      const productResponse = await fetch('https://api.whop.com/api/v2/products', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.WHOP_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          company_id: sellerCompanyId,
          title: `Parlay Access: ${parlay.name}`,
          description: `Access to parlay: ${parlay.name}`,
          type: 'api_only',
        }),
      })
      if (!productResponse.ok) {
        const errorText = await productResponse.text()
        throw new Error(`Product creation failed: ${productResponse.status} ${errorText}`)
      }
      const productData = await productResponse.json()
      product = productData.data || productData
    }

    if (!product?.id) {
      return NextResponse.json({ error: 'Failed to create product' }, { status: 500 })
    }

    // Create plan dynamically
    const priceInDollars = listing.priceCents / 100
    let plan
    try {
      plan = await sellerWhop.plans.create({
        productId: product.id,
        price: priceInDollars,
        currency: listing.currency,
        planType: 'one_time',
      })
    } catch (error) {
      console.error('[parlay-checkout] Failed to create plan', error)
      // Fallback: use REST API directly if SDK doesn't support
      const planResponse = await fetch('https://api.whop.com/api/v2/plans', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${env.WHOP_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          company_id: sellerCompanyId,
          product_id: product.id,
          initial_price: priceInDollars,
          currency: listing.currency,
          plan_type: 'one_time',
        }),
      })
      if (!planResponse.ok) {
        const errorText = await planResponse.text()
        throw new Error(`Plan creation failed: ${planResponse.status} ${errorText}`)
      }
      const planData = await planResponse.json()
      plan = planData.data || planData
    }

    if (!plan?.id) {
      return NextResponse.json({ error: 'Failed to create plan' }, { status: 500 })
    }

    const metadata = {
      type: 'parlay_purchase',
      parlayId: parlay.id,
      listingId: listing.id,
      priceCents: String(listing.priceCents),
      experienceId: parlay.experienceId,
      sellerCompanyId,
      sellerProductId: product.id,
      sellerPlanId: plan.id,
    } as any

    // Create checkout session using seller's company
    const checkoutSession = await sellerWhop.payments.createCheckoutSession({
      companyId: sellerCompanyId,
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
      status: 'pending',
    })

    return NextResponse.json({ checkoutId: checkoutSession.id, planId: plan.id })
  } catch (e) {
    console.error('Parlay checkout failed', e)
    return NextResponse.json({ error: 'Failed to start checkout' }, { status: 500 })
  }
}


