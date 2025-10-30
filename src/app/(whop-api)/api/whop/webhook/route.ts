import { NextRequest, NextResponse } from "next/server"
import { db } from "~/db"
import { appFeesLedger, betPurchases, betSaleListings, userBetAccess, parlayFeesLedger, parlayPurchases, parlaySaleListings, userParlayAccess } from "~/db/schema"
import { eq } from "drizzle-orm"
import { whop } from "~/lib/whop"

type BetPurchaseMetadata = {
  type?: string
  betId?: string
  listingId?: string
  priceCents?: string
}

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json()
    // Flexible parsing for Whop webhook-like event
    const evtType: string | undefined = payload?.type || payload?.event
    const data = payload?.data || payload?.object || payload
    const metadata: BetPurchaseMetadata | undefined = (data?.metadata as any) || undefined

    // Only handle our purchase events
    if (!metadata || (metadata.type !== 'bet_purchase' && metadata.type !== 'parlay_purchase')) {
      return NextResponse.json({ ok: true })
    }

    const checkoutId: string | undefined = data?.id || data?.checkoutId || data?.checkout?.id
    const betId = metadata.betId
    const listingId = metadata.listingId!

    // Determine success or refund (broadened)
    const status = (data?.status || data?.payment_status || data?.state || '').toString().toLowerCase()
    const typeStr = (evtType || '').toString().toLowerCase()
    const isSucceeded = typeStr.includes('paid') || typeStr.includes('succeeded') || typeStr.includes('completed') || ['paid','succeeded','completed','success'].includes(status)
    const isRefunded = typeStr.includes('refund') || status.includes('refund')

    console.log('[whop-webhook]', {
      type: evtType,
      status,
      isSucceeded,
      isRefunded,
      metadata,
      checkoutId,
    })

    // Lookup purchase by checkoutId
    const isParlay = metadata.type === 'parlay_purchase'
    const purchase = isParlay
      ? (await db.select().from(parlayPurchases).where(eq(parlayPurchases.checkoutId, checkoutId || '')).limit(1))[0]
      : (await db.select().from(betPurchases).where(eq(betPurchases.checkoutId, checkoutId || '')).limit(1))[0]
    if (!purchase) return NextResponse.json({ ok: true })

    if (isSucceeded) {
      // Grant access
      if (isParlay) {
        await db.insert(userParlayAccess).values({ parlayId: (await db.select().from(parlaySaleListings).where(eq(parlaySaleListings.id, listingId)).limit(1))[0]?.parlayId!, userId: purchase.buyerUserId, source: 'purchase' })
      } else {
        await db.insert(userBetAccess).values({ betId: betId!, userId: purchase.buyerUserId, source: 'purchase' })
      }

      // Compute and record fees
      const gross = purchase.amountCents
      const fee = Math.round(gross * 0.10)
      const net = gross - fee

      // Fetch listing and resolve destination company for payout
      const listing = isParlay
        ? (await db.select().from(parlaySaleListings).where(eq(parlaySaleListings.id, listingId)).limit(1))[0]
        : (await db.select().from(betSaleListings).where(eq(betSaleListings.id, listingId)).limit(1))[0]

      let destinationCompanyId: string | undefined
      try {
        if (isParlay) {
          const pl = await db.select().from(parlaySaleListings).where(eq(parlaySaleListings.id, listingId)).limit(1)
          const parlayId = pl[0]?.parlayId
          if (parlayId) {
            // Load parlay to get experience -> company
            // @ts-ignore
            const parlay = (await db.select().from(parlaySaleListings).where(eq(parlaySaleListings.id, listingId)).limit(1))[0]
            // Fallback: use metadata.betId path for bets, otherwise fetch via Whop by experience
          }
        }
        // For bets we have betId in metadata
        const experienceId = isParlay
          ? undefined
          : betId
            ? (await db.select().from(betSaleListings).where(eq(betSaleListings.id, listingId)).limit(1))[0]?.betId
            : undefined
        // Prefer metadata.experience via Whop
        const targetExperienceId = (metadata as any)?.experienceId || (data?.experienceId) || (data?.experience?.id)
        const resolvedExperienceId = targetExperienceId || (metadata?.betId ? undefined : undefined)
        const expIdToFetch = resolvedExperienceId || (metadata?.betId ? undefined : undefined)
        const exp = resolvedExperienceId ? await whop.experiences.getExperience({ experienceId: resolvedExperienceId }) : undefined
        destinationCompanyId = exp?.company?.id
      } catch (e) {
        console.warn('[whop] failed to resolve destination company id for payout', e)
      }

      let payoutTransferId: string | undefined
      try {
        // Attempt to create transfer of net to seller
        // Prefer paying out to the experience company (creator/owner of the install)
        // @ts-ignore - SDK surface
        const transfer = await (whop as any).transfers?.createTransfer?.({
          amountCents: net,
          currency: purchase.currency,
          destinationCompanyId: destinationCompanyId,
          // Fallbacks used by backend if destinationCompanyId is absent
          destinationUserId: destinationCompanyId ? undefined : listing?.sellerUserId,
          description: isParlay ? `Parlay sale payout (${listingId})` : `Bet access sale payout (${betId})`,
        })
        payoutTransferId = transfer?.id
      } catch (e) {
        console.error('[whop] transfer failed, will remain unset', e)
      }

      if (isParlay) {
        await db.insert(parlayFeesLedger).values({ purchaseId: purchase.id, grossCents: gross, feeCents: fee, netCents: net, payoutTransferId })
        // @ts-ignore
        await db.update(parlayPurchases).set({ status: 'succeeded' }).where(eq(parlayPurchases.id, purchase.id))
      } else {
        await db.insert(appFeesLedger).values({ purchaseId: purchase.id, grossCents: gross, feeCents: fee, netCents: net, payoutTransferId })
        // @ts-ignore drizzle update helper inferred elsewhere
        await db.update(betPurchases).set({ status: 'succeeded' }).where(eq(betPurchases.id, purchase.id))
      }

      return NextResponse.json({ ok: true })
    }

    if (isRefunded) {
      if (isParlay) {
        // @ts-ignore
        const pl = await db.select().from(parlaySaleListings).where(eq(parlaySaleListings.id, listingId)).limit(1)
        const parlayId = pl[0]?.parlayId
        // @ts-ignore drizzle delete
        await db.delete(userParlayAccess).where(eq(userParlayAccess.parlayId, parlayId!)).where(eq(userParlayAccess.userId, purchase.buyerUserId))
        // @ts-ignore
        await db.update(parlayPurchases).set({ status: 'refunded' }).where(eq(parlayPurchases.id, purchase.id))
      } else {
        // Revoke access on refund
        // @ts-ignore drizzle delete helper available in runtime
        await db.delete(userBetAccess).where(eq(userBetAccess.betId, betId!)).where(eq(userBetAccess.userId, purchase.buyerUserId))
        // @ts-ignore drizzle update helper inferred elsewhere
        await db.update(betPurchases).set({ status: 'refunded' }).where(eq(betPurchases.id, purchase.id))
      }
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Webhook error:', error)
    return NextResponse.json({ ok: false })
  }
}


