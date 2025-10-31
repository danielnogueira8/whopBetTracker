import { NextRequest, NextResponse } from "next/server"
import { verifyUserToken } from "@whop/api"
import { db } from "~/db"
import { betPurchases, betSaleListings, upcomingBets, userBetAccess } from "~/db/schema"
import { and, eq } from "drizzle-orm"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await verifyUserToken(req.headers)
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const body = await req.json().catch(() => null) as { checkoutId?: string } | null
    const checkoutId = body?.checkoutId || ''
    if (!checkoutId) return NextResponse.json({ error: 'checkoutId required' }, { status: 400 })

    // Ensure bet exists
    const bet = (await db.select().from(upcomingBets).where(eq(upcomingBets.id, id)).limit(1))[0]
    if (!bet) return NextResponse.json({ error: 'Bet not found' }, { status: 404 })

    // Find listing for this bet
    const listing = (await db.select().from(betSaleListings).where(eq(betSaleListings.betId, id)).limit(1))[0]
    if (!listing) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })

    // Find purchase by checkoutId scoped to this listing
    const purchase = (await db
      .select()
      .from(betPurchases)
      .where(and(eq(betPurchases.checkoutId, checkoutId), eq(betPurchases.listingId, listing.id)))
      .limit(1))[0]
    if (!purchase) return NextResponse.json({ error: 'Purchase not found' }, { status: 404 })

    if (purchase.buyerUserId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Only allow when payment has completed via webhook
    if ((purchase as any)?.status !== 'succeeded') {
      return NextResponse.json({ error: 'Payment not completed' }, { status: 409 })
    }

    // Grant access idempotently (now that status is succeeded)
    await db.insert(userBetAccess).values({ betId: bet.id, userId }).onConflictDoNothing?.()

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[confirm] error', e)
    return NextResponse.json({ error: 'Failed to confirm' }, { status: 500 })
  }
}


