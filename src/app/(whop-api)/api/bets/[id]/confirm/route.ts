import { NextRequest, NextResponse } from "next/server"
import { verifyUserToken } from "@whop/api"
import { db } from "~/db"
import { betPurchases, betSaleListings, upcomingBets, userBetAccess } from "~/db/schema"
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
    let sellerCompanyId: string | undefined = (purchase as any)?.sellerCompanyId ?? undefined
    const sellerPlanId: string | undefined = (purchase as any)?.sellerPlanId ?? undefined
    const sellerAccessPassId: string | undefined = (purchase as any)?.sellerAccessPassId ?? undefined

    console.log('[confirm] purchase status check', {
      purchaseId: purchase.id,
      checkoutId: purchase.checkoutId,
      status: (purchase as any)?.status,
      amountCents: purchase.amountCents,
      sellerCompanyId,
      sellerPlanId,
      sellerAccessPassId,
    })

    // Auto-approve $0 purchases (free packages don't trigger webhooks)
    if (purchase.amountCents === 0 && (purchase as any)?.status !== 'succeeded') {
      console.log('[confirm] auto-approving $0 purchase (no webhook for free packages)')
      await db.update(betPurchases).set({
        status: 'succeeded',
        sellerCompanyId: sellerCompanyId ?? undefined,
        sellerAccessPassId: sellerAccessPassId ?? undefined,
        sellerPlanId: sellerPlanId ?? undefined,
      }).where(eq(betPurchases.id, purchase.id))
      
      await db.insert(userBetAccess).values({ betId: bet.id, userId }).onConflictDoNothing?.()
      return NextResponse.json({ ok: true, autoApproved: true })
    }

    if ((purchase as any)?.status !== 'succeeded') {
      if (!sellerCompanyId) {
        sellerCompanyId = await getOrStoreSellerCompanyId(listing.sellerUserId, bet.experienceId) ?? undefined
        if (sellerCompanyId) {
          // @ts-ignore drizzle update helper inferred elsewhere
          await db.update(betPurchases).set({ sellerCompanyId }).where(eq(betPurchases.id, purchase.id))
        }
      }

      if (sellerCompanyId && sellerPlanId) {
        console.log('[confirm] attempting reconciliation', {
          sellerCompanyId,
          sellerPlanId,
          buyerUserId: purchase.buyerUserId,
        })
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
          console.log('[confirm] reconciliation results', {
            receiptCount: receipts.length,
            receiptIds: receipts.map((r: any) => r?.id),
            buyerUserIds: receipts.map((r: any) => r?.member?.user?.id),
          })
          
          const matchingReceipt = receipts.find((r: any) => r?.member?.user?.id === purchase.buyerUserId)

          if (matchingReceipt) {
            console.log('[confirm] found matching receipt, updating purchase', {
              receiptId: matchingReceipt.id,
              purchaseId: purchase.id,
            })
            await db.update(betPurchases).set({
              status: 'succeeded',
              sellerCompanyId,
              sellerAccessPassId,
              sellerPlanId,
            }).where(eq(betPurchases.id, purchase.id))

            await db.insert(userBetAccess).values({ betId: bet.id, userId }).onConflictDoNothing?.()
            return NextResponse.json({ ok: true, reconciled: true })
          } else {
            console.log('[confirm] no matching receipt found', {
              buyerUserId: purchase.buyerUserId,
              receiptBuyerIds: receipts.map((r: any) => r?.member?.user?.id),
            })
          }
        } catch (err) {
          console.error('[confirm] reconciliation failed', err)
        }
      } else {
        console.log('[confirm] cannot reconcile - missing seller info', {
          hasSellerCompanyId: !!sellerCompanyId,
          hasSellerPlanId: !!sellerPlanId,
        })
      }

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


