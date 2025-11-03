import { NextRequest } from "next/server"
import { verifyUserToken } from "@whop/api"
import { db } from "~/db"
import { betPurchases, betSaleListings, upcomingBets } from "~/db/schema"
import { eq, sql } from "drizzle-orm"
import { whop } from "~/lib/whop"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const rows = await db
      .select()
      .from(betSaleListings)
      .where(eq(betSaleListings.betId, id))
      .limit(1)

    const listing = rows[0] || null

    let salesCount = 0
    if (listing) {
      const countRows = await db
        .select({ count: sql<number>`count(*)` })
        .from(betPurchases)
        .where(eq(betPurchases.listingId, listing.id))
      salesCount = countRows[0]?.count ?? 0
    }

    return Response.json({ listing: listing ? { ...listing, salesCount } : null })
  } catch (error) {
    console.error("Error fetching bet listing:", error)
    return Response.json({ listing: null })
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await verifyUserToken(req.headers)
    if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 })

    const { id } = await params
    const body = await req.json()
    const {
      priceCents,
      currency = 'usd',
      active = true,
      allowZero = false,
    } = body || {}

    const normalizedPriceCents = typeof priceCents === 'string' ? Number.parseInt(priceCents, 10) : Number(priceCents)

    if (Number.isNaN(normalizedPriceCents)) {
      return Response.json({ error: 'priceCents must be a number' }, { status: 400 })
    }

    if (normalizedPriceCents < 0) {
      return Response.json({ error: 'priceCents must be >= 0' }, { status: 400 })
    }

    if (normalizedPriceCents === 0 && !allowZero) {
      return Response.json({ error: 'priceCents must be > 0 unless allowZero is true' }, { status: 400 })
    }

    // Load bet to get experienceId
    const betRows = await db.select().from(upcomingBets).where(eq(upcomingBets.id, id)).limit(1)
    const bet = betRows[0]
    if (!bet) return Response.json({ error: "Bet not found" }, { status: 404 })

    // Only admins can list
    const access = await whop.access.checkIfUserHasAccessToExperience({
      experienceId: bet.experienceId,
      userId,
    })
    if (access?.accessLevel !== 'admin') {
      return Response.json({ error: "Forbidden" }, { status: 403 })
    }

    // Upsert listing
    const existing = await db
      .select()
      .from(betSaleListings)
      .where(eq(betSaleListings.betId, id))
      .limit(1)

    if (existing[0]) {
      const updated = await db
        // @ts-ignore drizzle update helper inferred elsewhere
        .update(betSaleListings)
        .set({ priceCents: normalizedPriceCents, currency, active, updatedAt: new Date() })
        .where(eq(betSaleListings.id, existing[0].id))
        .returning()
      return Response.json({ listing: updated[0] })
    }

    const created = await db
      .insert(betSaleListings)
      .values({ betId: id, sellerUserId: userId, priceCents: normalizedPriceCents, currency, active })
      .returning()

    return Response.json({ listing: created[0] })
  } catch (error) {
    console.error("Error creating/updating listing:", error)
    return Response.json({ error: "Failed" }, { status: 500 })
  }
}


