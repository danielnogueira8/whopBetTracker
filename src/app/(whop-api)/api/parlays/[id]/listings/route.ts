import { NextRequest } from "next/server"
import { verifyUserToken } from "@whop/api"
import { db } from "~/db"
import { parlaySaleListings, parlays } from "~/db/schema"
import { eq } from "drizzle-orm"
import { whop } from "~/lib/whop"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const rows = await db.select().from(parlaySaleListings).where(eq(parlaySaleListings.parlayId, id)).limit(1)
    const listing = rows[0] || null
    return Response.json({ listing })
  } catch (e) {
    console.error('Error fetching parlay listing', e)
    return Response.json({ listing: null })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await verifyUserToken(req.headers)
    if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

    const { id } = await params
    const { priceCents, currency = 'usd', active = true } = await req.json()
    if (!priceCents || priceCents <= 0) return Response.json({ error: 'priceCents must be > 0' }, { status: 400 })

    const rows = await db.select().from(parlays).where(eq(parlays.id, id)).limit(1)
    const parlay = rows[0]
    if (!parlay) return Response.json({ error: 'Parlay not found' }, { status: 404 })

    const access = await whop.access.checkIfUserHasAccessToExperience({ experienceId: parlay.experienceId, userId })
    if (access?.accessLevel !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403 })

    const existing = await db.select().from(parlaySaleListings).where(eq(parlaySaleListings.parlayId, id)).limit(1)
    if (existing[0]) {
      const updated = await db
        // @ts-ignore
        .update(parlaySaleListings)
        .set({ priceCents, currency, active, updatedAt: new Date() })
        .where(eq(parlaySaleListings.id, existing[0].id))
        .returning()
      return Response.json({ listing: updated[0] })
    }

    const created = await db
      .insert(parlaySaleListings)
      .values({ parlayId: id, sellerUserId: userId, priceCents, currency, active })
      .returning()

    return Response.json({ listing: created[0] })
  } catch (e) {
    console.error('Error creating parlay listing', e)
    return Response.json({ error: 'Failed' }, { status: 500 })
  }
}


