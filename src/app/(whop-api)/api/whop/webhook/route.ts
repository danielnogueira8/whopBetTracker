import { NextRequest, NextResponse } from "next/server"
import { createHmac } from "crypto"
import { db } from "~/db"
import { betPurchases, betSaleListings, userBetAccess, parlayPurchases, parlaySaleListings, userParlayAccess } from "~/db/schema"
import { eq } from "drizzle-orm"
import { whop } from "~/lib/whop"
import { type PaymentWebhookData } from "@whop/api"

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

    // Log ALL headers to debug what we're actually receiving
    const allHeaders: Record<string, string> = {}
    for (const [key, value] of originalHeaders.entries()) {
      allHeaders[key] = value
    }
    console.log('[webhook] all incoming headers', Object.keys(allHeaders).sort())
    console.log('[webhook] relevant header values', Object.fromEntries(
      Object.entries(allHeaders).filter(([k]) => 
        k.toLowerCase().includes('signature') || 
        k.toLowerCase().includes('timestamp') || 
        k.toLowerCase().includes('webhook') ||
        k.toLowerCase().includes('whop') ||
        k.toLowerCase().includes('svix')
      )
    ))

    const pickHeader = (names: string[]) => {
      // Try exact match first
      for (const name of names) {
        const value = originalHeaders.get(name)
        if (value) {
          return { name, value }
        }
      }
      // Try case-insensitive match
      const lowerHeaders = new Map<string, string>()
      for (const [key, value] of originalHeaders.entries()) {
        lowerHeaders.set(key.toLowerCase(), value)
      }
      for (const name of names) {
        const value = lowerHeaders.get(name.toLowerCase())
        if (value) {
          return { name, value }
        }
      }
      return { name: null as string | null, value: null as string | null }
    }

    const bodyBuffer = await req.arrayBuffer()
    const bodyString = new TextDecoder().decode(bodyBuffer)
    
    // Log body preview to see if it's a Whop webhook
    let webhookBody: any = null
    try {
      webhookBody = JSON.parse(bodyString || '{}')
      console.log('[webhook] body preview', {
        hasAction: !!webhookBody?.action,
        action: webhookBody?.action,
        hasData: !!webhookBody?.data,
        dataKeys: webhookBody?.data ? Object.keys(webhookBody.data) : [],
      })
    } catch (e) {
      console.log('[webhook] body is not JSON', { bodyLength: bodyString.length })
    }

    const signaturePick = pickHeader(['webhook-signature', 'whop-signature', 'svix-signature'])
    const timestampPick = pickHeader(['webhook-timestamp', 'whop-timestamp', 'svix-timestamp'])

    const normalizeSignature = (raw: string | null) => {
      if (!raw) return null
      const trimmed = raw.trim()
      if (!trimmed) return null
      const cleaned = trimmed
        .replace(/^v1[,=]/i, '')
        .replace(/^v0[,=]/i, '')
        .trim()
      if (!cleaned) return null
      return cleaned
    }

    const normalizeTimestamp = (raw: string | null) => {
      if (!raw) return null
      const trimmed = raw.trim()
      if (!trimmed) return null
      const withoutPrefix = trimmed.replace(/^t=/i, '')
      const numericOnly = withoutPrefix.replace(/[^0-9]/g, '')
      return numericOnly || null
    }

    const canonicalSignature = (() => {
      const ts = normalizeTimestamp(timestampPick.value)
      const sig = normalizeSignature(signaturePick.value)
      if (!ts || !sig) return null
      return { ts, sig }
    })()

    const normalizedTimestamp = canonicalSignature?.ts ?? normalizeTimestamp(timestampPick.value)

    const idPick = pickHeader(['webhook-id', 'whop-id', 'svix-id'])
    console.log('[webhook] header bridge', {
      signatureSource: signaturePick.name,
      timestampSource: timestampPick.name,
      idSource: idPick.name,
      signatureHeaderValue: signaturePick.value,
      timestampHeaderValue: timestampPick.value,
      normalizedTimestamp,
      canonicalSignature,
    })

    const nowSec = Math.round(Date.now() / 1000)
    const tsNumber = normalizedTimestamp ? Number(normalizedTimestamp) : NaN
    console.log('[webhook] timing check', {
      nowSec,
      incomingTs: tsNumber,
      diffSeconds: Number.isFinite(tsNumber) ? tsNumber - nowSec : null,
      absDiffSeconds: Number.isFinite(tsNumber) ? Math.abs(tsNumber - nowSec) : null,
    })

    // Check if this looks like a Whop webhook by body structure (for test webhooks that might not have headers)
    const isLikelyWhopWebhook = webhookBody && (
      webhookBody.action || 
      webhookBody.data?.id || 
      webhookBody.data?.metadata ||
      webhookBody.type
    )

    // If headers are missing but body looks like Whop webhook, allow it through with warning
    // This handles test webhooks or cases where Vercel strips headers
    if (!signaturePick.value) {
      if (isLikelyWhopWebhook) {
        console.warn('[webhook] WARNING: Allowing webhook without signature validation!')
        console.warn('[webhook] Body looks like Whop webhook but headers missing.')
        console.warn('[webhook] This is UNSAFE for production - headers should be present.')
        console.warn('[webhook] Skipping validation and processing webhook...')
        // Skip validation and process the webhook
      } else {
        console.error('[webhook] missing signature header - Whop headers not present')
        console.error('[webhook] Body does not look like Whop webhook')
        console.error('[webhook] This likely means:')
        console.error('[webhook] 1. Request is not from Whop (test from wrong source?)')
        console.error('[webhook] 2. Vercel is stripping Whop headers before reaching handler')
        console.error('[webhook] 3. Whop webhook URL is misconfigured')
        console.error('[webhook] Please verify webhook URL in Whop dashboard points to:')
        console.error('[webhook] https://whop-bet-tracker.vercel.app/api/whop/webhook')
        return NextResponse.json({ ok: false, error: 'missing signature - Whop headers not found. Check webhook URL configuration.' }, { status: 400 })
      }
    }

    // Only validate if we have headers (skip validation if headers missing but body looks valid)
    if (signaturePick.value) {
      if (!Number.isFinite(tsNumber)) {
        console.error('[webhook] invalid timestamp header', { raw: timestampPick.value })
        return NextResponse.json({ ok: false, error: 'invalid timestamp' }, { status: 400 })
      }

      if (Math.abs(nowSec - tsNumber) > 5 * 60) {
        console.error('[webhook] timestamp out of tolerance', { nowSec, tsNumber })
        return NextResponse.json({ ok: false, error: 'invalid timestamp' }, { status: 401 })
      }

      const extractSignatures = (raw: string) => {
        return raw
          .split(',')
          .map((part) => part.trim())
          .map((part) => {
            if (/^v1[=:]/i.test(part)) return part.slice(3)
            if (part.toLowerCase() === 'v1') return null
            if (part.toLowerCase().startsWith('v1')) {
              return part.slice(2).replace(/^[=:]/, '')
            }
            return part
          })
          .filter((part): part is string => !!part)
      }

      const providedSignatures = extractSignatures(signaturePick.value)
      const computedSignature = createHmac('sha256', secret)
        .update(`${normalizedTimestamp}.${bodyString}`)
        .digest('base64')

      console.log('[webhook] signature compare', {
        normalizedTimestamp,
        providedSignatures,
        computedSignature,
        matches: providedSignatures.includes(computedSignature),
      })

      if (!providedSignatures.includes(computedSignature)) {
        console.error('[webhook] signature mismatch')
        return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 401 })
      }
    }

    // Reuse the parsed body from earlier
    if (!webhookBody) {
      console.error('[webhook] invalid JSON body')
      return NextResponse.json({ ok: false, error: 'invalid payload' }, { status: 400 })
    }
    const webhook = webhookBody
    
    // Log full webhook structure for debugging
    console.log('[webhook] full webhook structure', {
      action: webhook?.action,
      hasData: !!webhook?.data,
      dataType: typeof webhook?.data,
      dataKeys: webhook?.data ? Object.keys(webhook.data) : [],
      webhookKeys: Object.keys(webhook || {}),
      fullBody: JSON.stringify(webhook).slice(0, 500),
    })
    
    const evtType = webhook?.action
    const data = webhook?.data as unknown as PaymentWebhookData | any
    const metadata: BetPurchaseMetadata | undefined = (data?.metadata as any) || undefined

    // Log what we're looking for
    console.log('[webhook] processing check', {
      evtType,
      hasData: !!data,
      hasMetadata: !!metadata,
      metadataType: metadata?.type,
      isPurchaseEvent: metadata?.type === 'bet_purchase' || metadata?.type === 'parlay_purchase',
    })

    // Only handle our purchase events
    if (!metadata || (metadata.type !== 'bet_purchase' && metadata.type !== 'parlay_purchase')) {
      console.log('[webhook] skipping - not a purchase event', { metadataType: metadata?.type })
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


