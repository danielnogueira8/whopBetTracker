import { NextRequest, NextResponse } from "next/server"
import { db } from "~/db"
import { betPurchases, betSaleListings, userBetAccess, parlayPurchases, parlaySaleListings, userParlayAccess } from "~/db/schema"
import { eq } from "drizzle-orm"
import { whop } from "~/lib/whop"
import { type PaymentWebhookData, makeWebhookValidator } from "@whop/api"

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type BetPurchaseMetadata = {
  type?: string
  betId?: string
  parlayId?: string
  listingId?: string
  priceCents?: string
  experienceId?: string
  sellerCompanyId?: string
  sellerAccessPassId?: string
  sellerPlanId?: string
}

export async function POST(req: NextRequest) {
  try {
    const secret = process.env.WHOP_WEBHOOK_SECRET
    if (!secret) {
      return NextResponse.json({ ok: false, error: 'missing webhook secret' }, { status: 400 })
    }

    const originalHeaders = req.headers
    const bridgedHeaders = new Headers()
    for (const [key, value] of originalHeaders.entries()) {
      bridgedHeaders.set(key, value)
    }

    const pickHeader = (names: string[]) => {
      for (const name of names) {
        const value = originalHeaders.get(name)
        if (value) {
          return { name, value }
        }
      }
      return { name: null as string | null, value: null as string | null }
    }

    const signaturePick = pickHeader(['webhook-signature', 'whop-signature', 'svix-signature', 'x-vercel-proxy-signature'])
    if (signaturePick.value) {
      bridgedHeaders.set('svix-signature', signaturePick.value)
    }

    const timestampPick = pickHeader(['webhook-timestamp', 'whop-timestamp', 'svix-timestamp', 'x-vercel-proxy-signature-ts'])
    if (timestampPick.value) {
      bridgedHeaders.set('svix-timestamp', timestampPick.value)
    }

    const idPick = pickHeader(['webhook-id', 'whop-id', 'svix-id'])
    if (idPick.value) {
      bridgedHeaders.set('svix-id', idPick.value)
    }

    console.log('[webhook] header bridge', {
      signatureSource: signaturePick.name,
      timestampSource: timestampPick.name,
      idSource: idPick.name,
      signatureMirrored: Boolean(signaturePick.value),
      timestampMirrored: Boolean(timestampPick.value),
      idMirrored: Boolean(idPick.value),
    })

    const bodyBuffer = await req.arrayBuffer()
    const requestForValidation = new Request(req.url, {
      method: req.method,
      headers: bridgedHeaders,
      body: bodyBuffer,
    })

    // Validate webhook - only signatureHeaderName is configurable
    const validator = makeWebhookValidator({
      webhookSecret: secret,
      signatureHeaderName: 'webhook-signature',
    })

    let webhook: any
    try {
      webhook = await validator(requestForValidation)
    } catch (err) {
      console.error('[webhook] validation failed:', err instanceof Error ? err.message : String(err))
      return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 401 })
    }
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

      const sellerCompanyId = metadata.sellerCompanyId ?? (purchase as any)?.sellerCompanyId ?? undefined
      const sellerAccessPassId = metadata.sellerAccessPassId ?? (purchase as any)?.sellerAccessPassId ?? undefined
      const sellerPlanId = metadata.sellerPlanId ?? (purchase as any)?.sellerPlanId ?? undefined

      // Payment goes directly to seller's company - no transfer needed
      // Update purchase status to succeeded and persist seller metadata
      if (isParlay) {
        // @ts-ignore
        await db.update(parlayPurchases).set({
          status: 'succeeded',
          sellerCompanyId,
          sellerAccessPassId,
          sellerPlanId,
        }).where(eq(parlayPurchases.id, purchase.id))
      } else {
        // @ts-ignore drizzle update helper inferred elsewhere
        await db.update(betPurchases).set({
          status: 'succeeded',
          sellerCompanyId,
          sellerAccessPassId,
          sellerPlanId,
        }).where(eq(betPurchases.id, purchase.id))
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


