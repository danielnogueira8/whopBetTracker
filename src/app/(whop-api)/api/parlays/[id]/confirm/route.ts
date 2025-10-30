import { NextRequest, NextResponse } from "next/server"
import { verifyUserToken } from "@whop/api"
import { db } from "~/db"
import { parlayPurchases, parlaySaleListings, parlays, userParlayAccess } from "~/db/schema"
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

    const parlay = (await db.select().from(parlays).where(eq(parlays.id, id)).limit(1))[0]
    if (!parlay) return NextResponse.json({ error: 'Parlay not found' }, { status: 404 })

    const listing = (await db.select().from(parlaySaleListings).where(eq(parlaySaleListings.parlayId, id)).limit(1))[0]
    if (!listing) return NextResponse.json({ error: 'Listing not found' }, { status: 404 })

    const purchase = (await db
      .select()
      .from(parlayPurchases)
      .where(and(eq(parlayPurchases.checkoutId, checkoutId), eq(parlayPurchases.listingId, listing.id)))
      .limit(1))[0]
    if (!purchase) return NextResponse.json({ error: 'Purchase not found' }, { status: 404 })

    if (purchase.buyerUserId !== userId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    await db.insert(userParlayAccess).values({ parlayId: parlay.id, userId }).onConflictDoNothing?.()
    // @ts-ignore drizzle update helper inferred elsewhere
    await db.update(parlayPurchases).set({ status: 'succeeded' }).where(eq(parlayPurchases.id, purchase.id))

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[parlay-confirm] error', e)
    return NextResponse.json({ error: 'Failed to confirm' }, { status: 500 })
  }
}


