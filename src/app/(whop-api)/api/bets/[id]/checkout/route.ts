import { NextRequest, NextResponse } from "next/server"
import { verifyUserToken } from "@whop/api"
import { db } from "~/db"
import { betPurchases, betSaleListings, upcomingBets, userBetAccess } from "~/db/schema"
import { eq } from "drizzle-orm"
import { whop } from "~/lib/whop"
import { env } from "~/env"

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
    // Check if buyer already has access via paywall membership (unless forced buyer mode for testing)
    if (!forceBuyer) {
      const access = await whop.access.checkIfUserHasAccessToExperience({
        experienceId: bet.experienceId,
        userId,
      })
      if (access?.accessLevel === 'admin' || access?.accessLevel === 'customer') {
        return NextResponse.json({ error: 'Already eligible' }, { status: 409 })
      }
    }

    if (!forceBuyer) {
      // Check per-bet prior purchase
      const existingAccess = await db
        .select({ id: userBetAccess.id })
        .from(userBetAccess)
        .where(eq(userBetAccess.betId, bet.id))
        .where(eq(userBetAccess.userId, userId))
        .limit(1)
      if (existingAccess[0]) {
        return NextResponse.json({ error: 'Already purchased' }, { status: 409 })
      }
    }

    const planId = planIdForPrice(listing.priceCents) || env.ONE_TIME_PURCHASE_ACCESS_PASS_PLAN_ID

    // Create checkout with metadata for webhook reconciliation
    const metadata = {
      type: 'bet_purchase',
      betId: bet.id,
      listingId: listing.id,
      priceCents: String(listing.priceCents),
    } as any

    const checkoutSession = await whop.payments.createCheckoutSession({
      planId,
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

    return NextResponse.json({ checkoutId: checkoutSession.id, planId })
  } catch (error) {
    console.error('Failed to start checkout:', error)
    return NextResponse.json({ error: 'Failed to start checkout' }, { status: 500 })
  }
}


