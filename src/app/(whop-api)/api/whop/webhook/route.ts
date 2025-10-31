import { NextRequest, NextResponse } from "next/server"
import { db } from "~/db"
import { appFeesLedger, betPurchases, betSaleListings, userBetAccess, parlayFeesLedger, parlayPurchases, parlaySaleListings, userParlayAccess } from "~/db/schema"
import { eq } from "drizzle-orm"
import { whop } from "~/lib/whop"
import { type PaymentWebhookData } from "@whop/api"
import crypto from "node:crypto"

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

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
    const chosenTsRaw = pick(['whop-timestamp', 'svix-timestamp', 'webhook-timestamp', 'x-vercel-proxy-signature-ts'])

    const normalizedTs = normalizeToSeconds(chosenTsRaw || tsRaw || undefined) || undefined

    const usedSet = chosenSig ? (headersView.get('whop-signature') ? 'whop' : headersView.get('svix-signature') ? 'svix' : headersView.get('webhook-signature') ? 'webhook' : headersView.get('x-vercel-proxy-signature') ? 'vercel-proxy' : 'unknown') : 'none'

    // Always construct a cloned request with augmented headers so any downstream consumer sees expected variants
    const hdrs = new Headers(headersView)
    const setAllCased = (name: string, value: string) => {
      hdrs.set(name.toLowerCase(), value)
      const title = name.replace(/(^|[-_])(\w)/g, (_, p, c) => (p ? p : '') + c.toUpperCase())
      hdrs.set(title, value)
      hdrs.set(name.toUpperCase(), value)
    }
    if (chosenSig) {
      setAllCased('svix-signature', chosenSig)
      setAllCased('whop-signature', chosenSig)
      setAllCased('webhook-signature', chosenSig)
    }
    if (chosenId) {
      setAllCased('svix-id', chosenId)
      setAllCased('whop-id', chosenId)
      setAllCased('webhook-id', chosenId)
    }
    if (normalizedTs) {
      setAllCased('svix-timestamp', normalizedTs)
      setAllCased('whop-timestamp', normalizedTs)
      setAllCased('webhook-timestamp', normalizedTs)
    }
    // Read raw body once to avoid disturbing the original Request body stream
    const bodyBuffer = await req.arrayBuffer()
    const reqForValidation: Request = new Request(req.url, { method: 'POST', headers: hdrs, body: bodyBuffer })

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
      })
    } catch {}

    // Custom HMAC verification (auto-detect format)
    let webhook: any
    if (!chosenSig || !normalizedTs) {
      const keys = Array.from(headersView.keys())
      return NextResponse.json({ ok: false, error: 'missing signature headers' }, { status: 400 })
    }
    const nowSec = Math.floor(Date.now() / 1000)
    if (Math.abs(nowSec - Number(normalizedTs)) > 5 * 60) {
      return NextResponse.json({ ok: false, error: 'timestamp out of range' }, { status: 400 })
    }
    const payload = new TextDecoder().decode(bodyBuffer)

    function timingSafeEq(a: Buffer, b: Buffer): boolean {
      if (a.length !== b.length) return false
      return crypto.timingSafeEqual(a, b)
    }

    function getSecretCandidates(): Buffer[] {
      const s = (secret || '').trim()
      const out: Buffer[] = []
      if (!s) return out
      // utf8
      out.push(Buffer.from(s, 'utf8'))
      // base64
      try {
        const b64 = Buffer.from(s, 'base64')
        if (b64.length > 0) out.push(b64)
      } catch {}
      // hex
      try {
        if (/^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0) {
          const hx = Buffer.from(s, 'hex')
          if (hx.length > 0) out.push(hx)
        }
      } catch {}
      // dedupe by hex
      const seen = new Set<string>()
      return out.filter((b) => (seen.has(b.toString('hex')) ? false : (seen.add(b.toString('hex')), true)))
    }

    function parseSignatureToBuffers(sig: string): Buffer[] {
      const variants: string[] = [sig]
      // If v1,<sig>
      if (sig.startsWith('v1,')) variants.push(sig.slice(3))
      const out: Buffer[] = []
      for (const v of variants) {
        const s = v.trim()
        // hex
        if (/^[0-9a-fA-F]+$/.test(s) && s.length % 2 === 0) {
          try { out.push(Buffer.from(s, 'hex')) } catch {}
        }
        // base64
        try {
          const b = Buffer.from(s, 'base64')
          if (b.length > 0) out.push(b)
        } catch {}
        // base64url
        try {
          const b64 = s.replace(/-/g, '+').replace(/_/g, '/')
          const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4))
          const b = Buffer.from(b64 + pad, 'base64')
          if (b.length > 0) out.push(b)
        } catch {}
      }
      const seen = new Set<string>()
      return out.filter((b) => (seen.has(b.toString('hex')) ? false : (seen.add(b.toString('hex')), true)))
    }

    function computeHmacDigests(input: string, keys: Buffer[]): Buffer[] {
      const out: Buffer[] = []
      for (const k of keys) {
        try {
          const d = crypto.createHmac('sha256', k).update(input).digest()
          out.push(d)
        } catch {}
      }
      const seen = new Set<string>()
      return out.filter((b) => (seen.has(b.toString('hex')) ? false : (seen.add(b.toString('hex')), true)))
    }

    const sigRaw = chosenSig.trim()
    let verified = false
    const sigBuffers = parseSignatureToBuffers(sigRaw)
    const keyCandidates = getSecretCandidates()

    // Case A: Stripe-style: signature header like "t=TIMESTAMP,v1=SIGNATURE"
    if (/t=\d+/.test(sigRaw) && /v1=/.test(sigRaw)) {
      const parts = Object.fromEntries(sigRaw.split(',').map((p) => p.split('='))) as Record<string, string>
      const t = parts['t']
      const v1 = parts['v1']
      if (v1) sigBuffers.push(...parseSignatureToBuffers(v1))
      const signedPayload = `${t}.${payload}`
      const digests = computeHmacDigests(signedPayload, keyCandidates)
      verified = sigBuffers.some((sb) => digests.some((dg) => sb.length === dg.length && timingSafeEq(sb, dg)))
    } else {
      // Case B: Raw HMAC with optional v1 prefix
      const digestsA = computeHmacDigests(payload, keyCandidates)
      const digestsB = computeHmacDigests(`${normalizedTs}.${payload}`, keyCandidates)
      verified = sigBuffers.some((sb) => digestsA.concat(digestsB).some((dg) => sb.length === dg.length && timingSafeEq(sb, dg)))
    }

    if (!verified) {
      console.error('[webhook] invalid signature', { usedSet, hasId: !!chosenId, hasSig: !!chosenSig, hasTs: !!normalizedTs })
      return NextResponse.json({ ok: false, error: 'invalid signature' }, { status: 401 })
    }
    try {
      webhook = JSON.parse(payload)
    } catch {
      webhook = undefined
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
            console.warn('[whop] failed to fetch experience for transfer', e)
          }
        }
      }

      // Transfer 90% net to seller's company (app keeps 10% as application fee)
      // Payment goes to app company first, then we transfer seller's portion
      // Note: SDK doesn't have transfers API, so we use REST API directly
      let payoutTransferId: string | undefined
      try {
        if (destinationCompanyId && net > 0) {
          const appCompanyId = process.env.NEXT_PUBLIC_WHOP_COMPANY_ID as string | undefined
          const whopApiKey = process.env.WHOP_API_KEY as string | undefined
          
          if (!appCompanyId || !whopApiKey) {
            console.warn('[transfer] missing NEXT_PUBLIC_WHOP_COMPANY_ID or WHOP_API_KEY')
          } else {
            // Use REST API directly since SDK doesn't support transfers
            // Note: API requires exactly one of: originId OR ledgerAccountId
            // Documentation: https://docs.whop.com/api-reference/transfers/create-transfer
            const transferResponse = await fetch('https://api.whop.com/api/v1/transfers', {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${whopApiKey}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                amount: net, // Amount in cents
                currency: purchase.currency || 'usd',
                destinationId: destinationCompanyId, // Destination company ID
                originId: appCompanyId, // Source company ID (not sourceId)
                notes: isParlay 
                  ? `Parlay sale transfer (90% of ${gross} cents, listing ${listingId})` 
                  : `Bet sale transfer (90% of ${gross} cents, bet ${betId})`,
              }),
            })

            if (!transferResponse.ok) {
              const errorText = await transferResponse.text()
              throw new Error(`Transfer API failed: ${transferResponse.status} ${errorText}`)
            }

            const transfer = await transferResponse.json()
            payoutTransferId = transfer?.id || transfer?.data?.id
            console.log('[transfer] created via REST API', { 
              payoutTransferId, 
              net, 
              destinationCompanyId, 
              appCompanyId,
              gross,
              fee,
              response: transfer
            })
          }
        } else {
          console.warn('[transfer] missing destinationCompanyId or net <= 0', { destinationCompanyId, net })
        }
      } catch (e) {
        console.error('[transfer] createTransfer failed', { err: String(e), destinationCompanyId, net })
        // Continue even if transfer fails - access is already granted
        // Transfer can be retried manually if needed
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


