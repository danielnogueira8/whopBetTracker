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
    // Do not read or mutate the body/headers before validation
    const headersView = req.headers

    // Robust timestamp normalization to seconds
    function normalizeToSeconds(input: string | null | undefined): string | null {
      if (!input) return null
      const raw = String(input).trim()

      // 1) seconds
      if (/^\d{10}$/.test(raw)) return raw
      // 2) milliseconds
      if (/^\d{13}$/.test(raw)) return String(Math.floor(Number(raw) / 1000))
      // 3) ISO
      const msIso = Date.parse(raw)
      if (!Number.isNaN(msIso)) return String(Math.floor(msIso / 1000))

      // 4) key=value
      const mKv = raw.match(/(?:^|[?&#;,\s])(ts|timestamp|time|t)\s*=\s*([0-9T:.Z/+-]+)/i)
      if (mKv?.[2]) {
        const n = normalizeToSeconds(mKv[2])
        if (n) return n
      }

      // 5) base64 decode and recurse
      try {
        const b64 = raw.replace(/[-_]/g, (c) => (c === '-' ? '+' : '/')).padEnd(Math.ceil(raw.length / 4) * 4, '=')
        const decoded = Buffer.from(b64, 'base64').toString('utf8')
        const n = normalizeToSeconds(decoded)
        if (n) return n
      } catch {}

      // 6) JSON with ts fields
      try {
        const obj = JSON.parse(raw)
        const cand = [obj?.ts, obj?.timestamp, obj?.time, obj?.t, obj?.data?.ts, obj?.data?.timestamp]
          .filter((v) => v != null)
          .map((v) => String(v))
        for (const c of cand) {
          const n = normalizeToSeconds(c)
          if (n) return n
        }
      } catch {}

      // 7) delimited string "ts:..."
      const mTs = raw.match(/(?:^|[ ,;|])(ts|timestamp|time|t)\s*[:=]\s*([0-9T:.Z/+-]+)/i)
      if (mTs?.[2]) {
        const n = normalizeToSeconds(mTs[2])
        if (n) return n
      }

      return null
    }

    const tsHeaderOriginal = headersView.get('whop-timestamp') || headersView.get('Whop-Timestamp') || headersView.get('webhook-timestamp')
    const tsRaw = tsHeaderOriginal
    const tsNorm = normalizeToSeconds(tsRaw)
    // Server-side logs to identify correct format
    console.log('[webhook] ts normalization', { raw: tsRaw, normalized: tsNorm })
    // Debug which relevant headers are present (names only) and basic value lengths without mutation
    try {
      const summary: Record<string, number> = {}
      for (const [k, v] of headersView.entries()) {
        if (k.includes('signature') || k.includes('whop') || k.includes('webhook') || k.includes('svix') || k.startsWith('x-vercel-proxy')) {
          summary[k] = (v || '').length
        }
      }
      console.log('[webhook] present headers (subset):', Object.keys(summary))
      console.log('[webhook] header value lengths:', summary)
    } catch {}

    // If provider/host renames headers (e.g., Vercel proxy), mirror into all expected names (svix/whop/webhook)
    // Choose the most authoritative set: whop-* > svix-* > webhook-* > x-vercel-proxy-*
    const pick = (keys: string[]): string | null => {
      for (const k of keys) {
        const v = headersView.get(k)
        if (v) return v
      }
      return null
    }

    const chosenSig = pick(['whop-signature', 'svix-signature', 'webhook-signature', 'x-vercel-proxy-signature'])
    const chosenId = pick(['whop-id', 'svix-id', 'webhook-id'])
    
    // Determine which header set we're using first
    const usedSet = chosenSig ? (headersView.get('whop-signature') ? 'whop' : headersView.get('svix-signature') ? 'svix' : headersView.get('webhook-signature') ? 'webhook' : headersView.get('x-vercel-proxy-signature') ? 'vercel-proxy' : 'unknown') : 'none'
    
    // Pick timestamp from the same header set as the signature to ensure format matches
    const chosenTsRaw = usedSet === 'webhook' 
      ? (headersView.get('webhook-timestamp') || pick(['webhook-timestamp', 'x-vercel-proxy-signature-ts']))
      : usedSet === 'whop'
        ? (headersView.get('whop-timestamp') || pick(['whop-timestamp', 'svix-timestamp', 'webhook-timestamp']))
        : usedSet === 'svix'
          ? (headersView.get('svix-timestamp') || pick(['svix-timestamp', 'webhook-timestamp']))
          : pick(['whop-timestamp', 'svix-timestamp', 'webhook-timestamp', 'x-vercel-proxy-signature-ts'])

    const normalizedTs = normalizeToSeconds(chosenTsRaw || tsRaw || undefined) || undefined

    // Extra diagnostics about selected header set (redacted preview)
    try {
      const redact = (s?: string | null) => (s ? `${s.slice(0, 8)}…${s.slice(-4)}` : undefined)
      console.log('[webhook] header selection', {
        usedSet,
        hasId: !!chosenId,
        hasSig: !!chosenSig,
        hasTs: !!normalizedTs,
        idPreview: redact(chosenId),
        sigPreview: redact(chosenSig),
        ts: normalizedTs,
        chosenTsRaw: chosenTsRaw,
      })
    } catch {}

    // Custom HMAC verification (auto-detect format)
    if (!chosenSig || !normalizedTs) {
      const keys = Array.from(headersView.keys())
      return NextResponse.json({ ok: false, error: 'missing signature headers' }, { status: 400 })
    }
    const nowSec = Math.floor(Date.now() / 1000)
    if (Math.abs(nowSec - Number(normalizedTs)) > 5 * 60) {
      return NextResponse.json({ ok: false, error: 'timestamp out of range' }, { status: 400 })
    }
    
    // Use headerOverrides to tell validator which header names to use
    // Whop sends webhook-* headers, so we need to specify that
    const headerOverrides = usedSet === 'webhook'
      ? {
          signatureHeaderName: 'webhook-signature',
          timestampHeaderName: 'webhook-timestamp',
          idHeaderName: 'webhook-id',
        }
      : usedSet === 'whop'
        ? {
            signatureHeaderName: 'whop-signature',
            timestampHeaderName: 'whop-timestamp',
            idHeaderName: 'whop-id',
          }
        : undefined

    const validator = makeWebhookValidator({
      webhookSecret: secret,
      ...(headerOverrides ?? {}),
    })

    // Pass the original request directly - don't create a new Request object
    // The validator needs the original headers and body as-is
    let webhook: any
    try {
      webhook = await validator(req)
    } catch (err) {
      console.error('[webhook] invalid signature', {
        usedSet,
        hasId: !!chosenId,
        hasSig: !!chosenSig,
        hasTs: !!normalizedTs,
        error: err instanceof Error ? err.message : String(err),
      })
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


