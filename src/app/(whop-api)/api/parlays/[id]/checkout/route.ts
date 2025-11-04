import { NextRequest, NextResponse } from "next/server"
import { verifyUserToken, type Currencies } from "@whop/api"
import { db } from "~/db"
import { experienceSettings, parlayPurchases, parlaySaleListings, parlays, userParlayAccess } from "~/db/schema"
import { and, eq } from "drizzle-orm"
import { whop, getOrStoreSellerCompanyId, createSellerWhopSdk, verifyAppInstallation } from "~/lib/whop"
import { env } from "~/env"
import { userHasAccessToAnyProducts } from "~/lib/whop"

function planIdForPrice(priceCents: number): string | null {
  const key = `BET_PRICE_${priceCents}_PLAN_ID` as const
  // @ts-ignore
  return process.env[key] || null
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { userId } = await verifyUserToken(req.headers)
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let sellerCompanyId: string | null = null
  let sellerUserId: string | null = null
  try {
    const { id } = await params
    const rows = await db.select().from(parlays).where(eq(parlays.id, id)).limit(1)
    const parlay = rows[0]
    if (!parlay) return NextResponse.json({ error: 'Parlay not found' }, { status: 404 })

    const listingRows = await db.select().from(parlaySaleListings).where(eq(parlaySaleListings.parlayId, id)).limit(1)
    const listing = listingRows[0]
    sellerUserId = listing?.sellerUserId ?? null
    if (!listing || !listing.active) return NextResponse.json({ error: 'Not for sale' }, { status: 400 })

    const forceBuyer = req.headers.get('x-force-buyer') === 'true'
    if (!forceBuyer) {
      const access = await whop.access.checkIfUserHasAccessToExperience({ experienceId: parlay.experienceId, userId })
      if (access?.accessLevel === 'admin') {
        return NextResponse.json({ error: 'Already eligible' }, { status: 409 })
      }
      try {
        const s = await db
          .select({ paywallConfig: experienceSettings.paywallConfig })
          .from(experienceSettings)
          .where(eq(experienceSettings.experienceId, parlay.experienceId))
          .limit(1)
        const cfg = (s[0]?.paywallConfig as any) || { enabled: false, productIds: [], rule: 'any' }
        if (cfg?.enabled) {
          const productIds: string[] = Array.isArray(cfg.productIds) ? cfg.productIds : []
          if (productIds.length > 0) {
            const eligible = await userHasAccessToAnyProducts({ userId, productIds })
            if (eligible) return NextResponse.json({ error: 'Already eligible' }, { status: 409 })
          }
        }
      } catch {}
    }

    if (!forceBuyer) {
      const existingAccess = await db
        .select({ id: userParlayAccess.id })
        .from(userParlayAccess)
        .where(and(eq(userParlayAccess.parlayId, parlay.id), eq(userParlayAccess.userId, userId)))
        .limit(1)
      if (existingAccess[0]) return NextResponse.json({ error: 'Already purchased' }, { status: 409 })
    }

    // Get seller's company ID from experience (store if not cached)
    sellerCompanyId = await getOrStoreSellerCompanyId(listing.sellerUserId, parlay.experienceId)
    if (!sellerCompanyId) {
      return NextResponse.json({ error: 'Seller company not found' }, { status: 400 })
    }

    // Verify seller is admin of the company/experience
    const sellerAccess = await whop.access.checkIfUserHasAccessToExperience({
      experienceId: parlay.experienceId,
      userId: listing.sellerUserId,
    })
    
    if (sellerAccess?.accessLevel !== 'admin') {
      console.error('[parlay-checkout] Seller is not admin', {
        sellerUserId: listing.sellerUserId,
        accessLevel: sellerAccess?.accessLevel,
        experienceId: parlay.experienceId,
      })
      return NextResponse.json({ 
        error: 'Seller must be an admin to create products' 
      }, { status: 403 })
    }

    // Verify app is installed on seller's company
    const installationCheck = await verifyAppInstallation(sellerCompanyId)
    console.log('[parlay-checkout] App installation check:', {
      sellerCompanyId,
      isInstalled: installationCheck.isInstalled,
      hasCreatePermission: installationCheck.hasCreatePermission,
      error: installationCheck.error,
    })

    if (!installationCheck.isInstalled) {
      return NextResponse.json({
        error: 'App not installed. Please install the Whop Bet Tracker app on your company before selling parlays.',
        code: 'APP_NOT_INSTALLED',
        sellerCompanyId,
        installUrl: `https://whop.com/apps/${env.NEXT_PUBLIC_WHOP_APP_ID}`,
        instructions: 'Install the app and make sure to grant the "access_pass:create" permission.',
      }, { status: 403 })
    }

    const priceInDollars = Number((listing.priceCents / 100).toFixed(2))
    const baseCurrency = listing.currency?.toLowerCase() as Currencies | undefined

    const routeSlugBase = `parlay-${parlay.id}`.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()
    const uniqueSuffix = Math.random().toString(36).slice(2, 8)
    const accessPassRoute = `${routeSlugBase}-${uniqueSuffix}`.slice(0, 60).replace(/^-+|-+$/g, '')

    let accessPass: any
    try {
      // Use main SDK instance - the companyId parameter directs where to create the access pass
      // The SDK uses the app's credentials to create on behalf of the seller's company
      console.log('[parlay-checkout] Creating access pass with params:', {
        sellerCompanyId,
        experienceId: parlay.experienceId,
        priceInDollars,
        baseCurrency,
      })
      
      accessPass = await whop.accessPasses.createAccessPass({
        title: `Parlay Access: ${parlay.name}`,
        description: `Access to parlay: ${parlay.name}`,
        companyId: sellerCompanyId, // Seller's company
        experienceIds: [parlay.experienceId],
        route: accessPassRoute,
        visibility: 'hidden',
        planOptions: {
          planType: 'one_time',
          initialPrice: priceInDollars,
          baseCurrency,
          releaseMethod: 'buy_now',
          visibility: 'hidden',
        },
      }) as any

      if (accessPass?._error) {
        console.error('[parlay-checkout] accessPass creation failed - full response:', JSON.stringify(accessPass, null, 2))
        const errorMsg = String(accessPass._error)
        const errorLower = errorMsg.toLowerCase()
        if (errorLower.includes('permission') || errorLower.includes('access_pass:create') || errorLower.includes('required permission')) {
          return NextResponse.json({
            error: 'Permission denied. The app must be installed on your company with "access_pass:create" permission. Please install the app on your company and grant the required permissions.',
            code: 'PERMISSION_DENIED',
            requiredPermission: 'access_pass:create',
            instructions: `Go to your Whop company dashboard (company ID: ${sellerCompanyId}) > Apps > Find "Whop Bet Tracker" > Click "Manage" or "Settings" > Ensure "access_pass:create" permission is enabled. If not, you may need to reinstall the app with the permission granted.`,
            sellerCompanyId,
            rawError: accessPass._error,
          }, { status: 403 })
        }
        throw new Error(`Failed to create access pass: ${errorMsg}`)
      }

      if (!accessPass?.id) {
        console.error('[parlay-checkout] Missing accessPass id', accessPass)
        return NextResponse.json({ error: 'Failed to create access pass' }, { status: 500 })
      }
    } catch (error: any) {
      const errorMessage = error?.message || String(error)
      if (errorMessage.includes('permission') || errorMessage.includes('access_pass:create')) {
        console.error('[parlay-checkout] Permission error creating access pass', {
          error: errorMessage,
          sellerCompanyId,
          sellerUserId: listing.sellerUserId,
        })
        return NextResponse.json({
          error: 'Permission denied. The app must be installed on your company with "access_pass:create" permission. Please install the app on your company and grant the required permissions.',
          code: 'PERMISSION_DENIED',
          requiredPermission: 'access_pass:create',
          instructions: 'Go to your Whop company dashboard > Apps > Install this app > Grant "access_pass:create" permission',
        }, { status: 403 })
      }
      throw error
    }

    const plansData = (await sellerWhop.companies.listPlans({
      companyId: sellerCompanyId,
      filter: {
        accessPassId: accessPass.id,
      },
      first: 1,
    })) as any

    if (plansData?._error) {
      console.error('[parlay-checkout] listPlans failed', plansData._error)
      throw new Error('Failed to load seller plan')
    }

    const plan = plansData?.plans?.nodes?.[0]

    if (!plan?.id) {
      console.error('[parlay-checkout] Plan not found after creation', plansData)
      return NextResponse.json({ error: 'Failed to retrieve plan' }, { status: 500 })
    }

    const metadata = {
      type: 'parlay_purchase',
      parlayId: parlay.id,
      listingId: listing.id,
      priceCents: String(listing.priceCents),
      experienceId: parlay.experienceId,
      sellerCompanyId,
      sellerAccessPassId: accessPass.id,
      sellerPlanId: plan.id,
    } as any

    // Create checkout session using seller's company
    // SDK instance already has sellerCompanyId, so we don't need to pass it
    const checkoutSession = await sellerWhop.payments.createCheckoutSession({
      planId: plan.id,
      metadata,
    })

    if (!checkoutSession) return NextResponse.json({ error: 'Failed to create checkout' }, { status: 500 })

    await db.insert(parlayPurchases).values({
      listingId: listing.id,
      buyerUserId: userId,
      checkoutId: checkoutSession.id,
      amountCents: listing.priceCents,
      currency: listing.currency,
      sellerCompanyId,
      sellerAccessPassId: accessPass.id,
      sellerPlanId: plan.id,
      status: 'pending',
    })

    return NextResponse.json({ checkoutId: checkoutSession.id, planId: plan.id })
  } catch (e: any) {
      console.error('[parlay-checkout] Exception caught during checkout:', {
        error: e,
        errorMessage: e?.message,
        errorString: String(e),
        errorJson: JSON.stringify(e, null, 2),
        sellerCompanyId,
        sellerUserId,
      })
      const errorMessage = e?.message || String(e)
      const errorLower = errorMessage.toLowerCase()
      
      // Check if it's a permission error that wasn't caught earlier
      if (errorLower.includes('permission') || errorLower.includes('access_pass:create') || errorLower.includes('required permission')) {
        return NextResponse.json({
          error: 'Permission denied. The app must be installed on your company with "access_pass:create" permission. Please install the app on your company and grant the required permissions.',
          code: 'PERMISSION_DENIED',
          requiredPermission: 'access_pass:create',
          instructions: `Go to your Whop company dashboard (company ID: ${sellerCompanyId}) > Apps > Find "Whop Bet Tracker" > Click "Manage" or "Settings" > Ensure "access_pass:create" permission is enabled. If not, you may need to reinstall the app with the permission granted.`,
          sellerCompanyId,
          rawError: errorMessage,
        }, { status: 403 })
      }
      
      return NextResponse.json({ error: errorMessage || 'Failed to start checkout' }, { status: 500 })
    }
}


