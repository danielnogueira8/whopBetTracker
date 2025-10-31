import { NextRequest, NextResponse } from "next/server"
import { db } from "~/db"
import { appFeesLedger, betPurchases, betSaleListings, userBetAccess, parlayFeesLedger, parlayPurchases, parlaySaleListings, userParlayAccess } from "~/db/schema"
import { eq } from "drizzle-orm"
import { whop } from "~/lib/whop"
import { makeWebhookValidator, type PaymentWebhookData } from "@whop/api"

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

    // Always construct a cloned request with augmented headers so the validator sees all expected variants
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

    const validator = makeWebhookValidator({ webhookSecret: secret })
    let webhook
    try {
      if (!chosenSig || !chosenId || !normalizedTs) {
        // Missing required headers: fail fast with actionable info
        const keys = Array.from(headersView.keys())
        console.warn('[webhook] missing required signature headers', { hasId: !!chosenId, hasSig: !!chosenSig, hasTs: !!normalizedTs, keys })
        return NextResponse.json({ ok: false, error: 'missing signature headers' }, { status: 400 })
      }
      webhook = await validator(reqForValidation as any)
    } catch (firstErr) {
      const missingSig = String(firstErr || '').toLowerCase().includes('missing header')
      if (!chosenSig || !chosenId || !normalizedTs || missingSig) {
        // Retry 1: whop-only headers
        try {
          const whopOnly = new Headers()
          if (chosenSig) whopOnly.set('whop-signature', chosenSig)
          if (chosenId) whopOnly.set('whop-id', chosenId)
          if (normalizedTs) whopOnly.set('whop-timestamp', normalizedTs)
          const whopReq = new Request(req.url, { method: 'POST', headers: whopOnly, body: bodyBuffer })
          webhook = await validator(whopReq as any)
          console.log('[webhook] validator succeeded on retry with whop-only headers')
        } catch (retryWhopErr) {
          // Retry 2: svix-only headers
          try {
            const svixOnly = new Headers()
            if (chosenSig) svixOnly.set('svix-signature', chosenSig)
            if (chosenId) svixOnly.set('svix-id', chosenId)
            if (normalizedTs) svixOnly.set('svix-timestamp', normalizedTs)
            const svixReq = new Request(req.url, { method: 'POST', headers: svixOnly, body: bodyBuffer })
            webhook = await validator(svixReq as any)
            console.log('[webhook] validator succeeded on retry with svix-only headers')
          } catch (retrySvixErr) {
            console.error('[webhook] validator failed after whop-only and svix-only retries', {
              first: String(firstErr), whop: String(retryWhopErr), svix: String(retrySvixErr),
            })
            throw retrySvixErr
          }
        }
      } else {
        throw firstErr
      }
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


