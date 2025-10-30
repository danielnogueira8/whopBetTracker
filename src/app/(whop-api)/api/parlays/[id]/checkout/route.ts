import { NextRequest, NextResponse } from "next/server"
import { verifyUserToken } from "@whop/api"
import { db } from "~/db"
import { parlayPurchases, parlaySaleListings, parlays, userParlayAccess } from "~/db/schema"
import { and, eq } from "drizzle-orm"
import { whop } from "~/lib/whop"
import { env } from "~/env"

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
      if (access?.accessLevel === 'admin' || access?.accessLevel === 'customer') {
        return NextResponse.json({ error: 'Already eligible' }, { status: 409 })
      }
    }

    if (!forceBuyer) {
      const existingAccess = await db
        .select({ id: userParlayAccess.id })
        .from(userParlayAccess)
        .where(and(eq(userParlayAccess.parlayId, parlay.id), eq(userParlayAccess.userId, userId)))
        .limit(1)
      if (existingAccess[0]) return NextResponse.json({ error: 'Already purchased' }, { status: 409 })
    }

    const planId = planIdForPrice(listing.priceCents) || env.ONE_TIME_PURCHASE_ACCESS_PASS_PLAN_ID
    const metadata = { type: 'parlay_purchase', parlayId: parlay.id, listingId: listing.id, priceCents: String(listing.priceCents) } as any

    const checkoutSession = await whop.payments.createCheckoutSession({ planId, metadata })
    if (!checkoutSession) return NextResponse.json({ error: 'Failed to create checkout' }, { status: 500 })

    await db.insert(parlayPurchases).values({
      listingId: listing.id,
      buyerUserId: userId,
      checkoutId: checkoutSession.id,
      amountCents: listing.priceCents,
      currency: listing.currency,
      status: 'pending',
    })

    return NextResponse.json({ checkoutId: checkoutSession.id, planId })
  } catch (e) {
    console.error('Parlay checkout failed', e)
    return NextResponse.json({ error: 'Failed to start checkout' }, { status: 500 })
  }
}


