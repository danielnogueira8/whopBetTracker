import { NextRequest, NextResponse } from "next/server"
import { db } from "~/db"
import { appFeesLedger, betPurchases, betSaleListings, userBetAccess, parlayFeesLedger, parlayPurchases, parlaySaleListings, userParlayAccess } from "~/db/schema"
import { eq } from "drizzle-orm"
import { whop } from "~/lib/whop"
import { makeWebhookValidator, type PaymentWebhookData } from "@whop/api"

type BetPurchaseMetadata = {
  type?: string
  betId?: string
  listingId?: string
  priceCents?: string
}

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.WHOP_WEBHOOK_SECRET
    if (!secret) {
      return NextResponse.json({ ok: false, error: 'missing webhook secret' }, { status: 400 })
    }
    const signatureHeaderName =
      (req.headers.get('webhook-signature') && 'webhook-signature') ||
      (req.headers.get('Webhook-Signature') && 'Webhook-Signature') ||
      (req.headers.get('whop-signature') && 'whop-signature') ||
      (req.headers.get('Whop-Signature') && 'Whop-Signature') ||
      (req.headers.get('x-whop-signature') && 'x-whop-signature') ||
      (req.headers.get('X-Whop-Signature') && 'X-Whop-Signature') ||
      (req.headers.get('x-whop-webhook-signature') && 'x-whop-webhook-signature') ||
      (req.headers.get('X-Whop-Webhook-Signature') && 'X-Whop-Webhook-Signature') ||
      null

    const validator = makeWebhookValidator({
      webhookSecret: secret,
      signatureHeaderName,
    })
    // Debug missing signature once
    if (!(
      req.headers.get('whop-signature') ||
      req.headers.get('Whop-Signature') ||
      req.headers.get('x-whop-signature') ||
      req.headers.get('X-Whop-Signature') ||
      req.headers.get('x-whop-webhook-signature') ||
      req.headers.get('X-Whop-Webhook-Signature')
    )) {
      console.error('[webhook] no signature header; header keys:', Array.from(req.headers.keys()))
    }

    const webhook = await validator(req as any)
    const evtType = webhook?.action
    const data = webhook?.data as unknown as PaymentWebhookData | any
    const metadata: BetPurchaseMetadata | undefined = (data?.metadata as any) || undefined

    // Only handle our purchase events
    if (!metadata || (metadata.type !== 'bet_purchase' && metadata.type !== 'parlay_purchase')) {
      return NextResponse.json({ ok: true })
    }

    const checkoutId: string | undefined = data?.id || data?.checkoutId || data?.checkout?.id
    const betId = metadata.betId
    const listingId = metadata.listingId!

    // Determine success or refund (broadened)
    const status = (data as any)?.status?.toString()?.toLowerCase?.() || ''
    const typeStr = (evtType || '').toString().toLowerCase()
    const isSucceeded = evtType === 'payment.succeeded' || typeStr.includes('succeeded') || typeStr.includes('completed')
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

      // Prefer sellerCompanyId from metadata; fallback to experience.company.id
      let destinationCompanyId: string | undefined = (metadata as any)?.sellerCompanyId
      if (!destinationCompanyId) {
        const experienceId = (metadata as any)?.experienceId || (data as any)?.experienceId || (data as any)?.experience?.id
        if (experienceId) {
          try {
            const exp = await whop.experiences.getExperience({ experienceId })
            destinationCompanyId = exp?.company?.id
          } catch (e) {
            console.warn('[whop] failed to fetch experience for payout', e)
          }
        }
      }

      let payoutTransferId: string | undefined
      try {
        // Retrieve our app company's ledger account
        const appCompanyId = process.env.NEXT_PUBLIC_WHOP_COMPANY_ID as string | undefined
        const ledgerResp = appCompanyId
          ? await (whop as any).companies?.getCompanyLedgerAccount?.({ companyId: appCompanyId })
          : undefined
        const ledgerAccountId = ledgerResp?.company?.ledgerAccount?.id

        const destinationId = listing?.sellerUserId
        const currency = (data as any)?.currency || purchase.currency || 'usd'

        if (ledgerAccountId && destinationId && net > 0) {
          // Pay the seller user from our ledger (90% net)
          // @ts-ignore - SDK surface
          const payout = await (whop as any).payments?.payUser?.({
            amount: net,
            currency,
            destinationId,
            ledgerAccountId,
            idempotenceKey: purchase.id,
            notes: isParlay ? `Parlay sale payout (${listingId})` : `Bet sale payout (${betId})`,
          })
          payoutTransferId = payout?.id
          console.log('[payout] payUser created', { payoutTransferId, net, destinationId, ledgerAccountId })
        } else {
          console.warn('[payout] missing ledgerAccountId or destinationId; skipping', { ledgerAccountId, destinationId, net })
        }
      } catch (e) {
        console.error('[payout] payUser failed', { err: String(e) })
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

export async function GET() {
  try {
    console.log('[whop-webhook] GET ping')
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}


