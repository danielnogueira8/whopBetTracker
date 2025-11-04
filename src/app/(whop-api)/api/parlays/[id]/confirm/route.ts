import { NextRequest, NextResponse } from "next/server"
import { verifyUserToken } from "@whop/api"
import { db } from "~/db"
import { parlayPurchases, parlaySaleListings, parlays, userParlayAccess } from "~/db/schema"
import { and, eq } from "drizzle-orm"
import { whop, getOrStoreSellerCompanyId } from "~/lib/whop"

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

    let sellerCompanyId: string | undefined = (purchase as any)?.sellerCompanyId ?? undefined
    const sellerPlanId: string | undefined = (purchase as any)?.sellerPlanId ?? undefined
    const sellerAccessPassId: string | undefined = (purchase as any)?.sellerAccessPassId ?? undefined

    if ((purchase as any)?.status !== 'succeeded') {
      if (!sellerCompanyId) {
        sellerCompanyId = await getOrStoreSellerCompanyId(listing.sellerUserId, parlay.experienceId) ?? undefined
        if (sellerCompanyId) {
          // @ts-ignore
          await db.update(parlayPurchases).set({ sellerCompanyId }).where(eq(parlayPurchases.id, purchase.id))
        }
      }

      if (sellerCompanyId && sellerPlanId) {
        try {
          const receiptsRes = await whop.payments.listReceiptsForCompany({
            companyId: sellerCompanyId,
            first: 25,
            filter: {
              planIds: [sellerPlanId],
              statuses: ['succeeded'],
            },
          }) as any

          const receipts = receiptsRes?.company?.receipts?.nodes ?? receiptsRes?.receipts?.nodes ?? []
          const matchingReceipt = receipts.find((r: any) => r?.member?.user?.id === purchase.buyerUserId)

          if (matchingReceipt) {
            await db.update(parlayPurchases).set({
              status: 'succeeded',
              sellerCompanyId,
              sellerAccessPassId,
              sellerPlanId,
            }).where(eq(parlayPurchases.id, purchase.id))

            await db.insert(userParlayAccess).values({ parlayId: parlay.id, userId }).onConflictDoNothing?.()
            return NextResponse.json({ ok: true, reconciled: true })
          }
        } catch (err) {
          console.error('[parlay-confirm] reconciliation failed', err)
        }
      }

      return NextResponse.json({ error: 'Payment not completed' }, { status: 409 })
    }

    await db.insert(userParlayAccess).values({ parlayId: parlay.id, userId }).onConflictDoNothing?.()

    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[parlay-confirm] error', e)
    return NextResponse.json({ error: 'Failed to confirm' }, { status: 500 })
  }
}


