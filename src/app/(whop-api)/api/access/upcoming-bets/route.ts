import { NextRequest } from "next/server"
import { verifyUserToken } from "@whop/api"
import { db } from "~/db"
import { experienceSettings } from "~/db/schema"
import { eq } from "drizzle-orm"
import { userHasAccessToAnyProducts, whop } from "~/lib/whop"

export async function GET(req: NextRequest) {
  try {
    const { userId } = await verifyUserToken(req.headers)
    if (!userId) return Response.json({ hasAccess: true }) // fail-open

    const { searchParams } = new URL(req.url)
    const experienceId = searchParams.get("experienceId")
    if (!experienceId) return Response.json({ hasAccess: true })

    // Get the company ID from the experience
    let companyId: string | undefined
    try {
      const exp = await whop.experiences.getExperience({ experienceId })
      companyId = exp?.company?.id
    } catch (err) {
      console.error('[paywall] failed to get experience', err)
    }

    const s = await db
      .select({ paywallConfig: experienceSettings.paywallConfig })
      .from(experienceSettings)
      .where(eq(experienceSettings.experienceId, experienceId))
      .limit(1)

    const cfg = (s[0]?.paywallConfig as any) || { enabled: false, productIds: [], rule: 'any' }
    if (!cfg.enabled) {
      console.log('[paywall] not enabled')
      return Response.json({ hasAccess: true })
    }

    let productIds: string[] = Array.isArray(cfg.productIds) ? cfg.productIds : []

    // Fallback: if paywall is enabled but no productIds were configured, try to derive from experience
    if (productIds.length === 0) {
      try {
        const exp = await whop.experiences.getExperience({ experienceId })
        const expAny = exp as any
        // Try multiple sources in order: payments.listProductsForCompany -> companies.listAccessPasses -> products.listProducts -> experience.products
        let expProducts: string[] = []
        if (expAny?.company?.id) {
          const companyIdForProducts = expAny.company.id as string
          // 1) Payments API
          try {
            const list = await (whop as any)?.payments?.listProductsForCompany?.({ companyId: companyIdForProducts })
            const nodes: any[] = list?.products?.nodes ?? []
            expProducts = nodes.map((p: any) => p?.id).filter(Boolean)
          } catch {}
          // 2) Company access passes
          if (expProducts.length === 0) {
            try {
              const passes = await (whop as any)?.companies?.listAccessPasses?.({ companyId: companyIdForProducts })
              const nodes: any[] = passes?.accessPasses?.nodes ?? []
              expProducts = nodes.map((p: any) => p?.id).filter(Boolean)
            } catch {}
          }
          // 3) Products API
          if (expProducts.length === 0) {
            try {
              const listed = await (whop as any)?.products?.listProducts?.({ companyId: companyIdForProducts })
              const nodes: any[] = listed?.products?.nodes ?? []
              expProducts = nodes.map((p: any) => p?.id).filter(Boolean)
            } catch {}
          }
        }
        // 4) Experience products as last resort
        if (expProducts.length === 0) {
          expProducts = (expAny?.products ?? []).map((p: any) => p?.id).filter(Boolean)
        }

        if (expProducts.length > 0) {
          productIds = expProducts as string[]
        }
      } catch (err) {
        console.warn('[paywall] could not derive productIds from experience', err)
      }
    }

    // If we still have no products, treat as locked to avoid fail-open when paywall is on
    if (productIds.length === 0) {
      console.warn('[paywall] enabled but no products found; treating as no access')
      return Response.json({ hasAccess: false })
    }

    console.log('[paywall] checking access', { userId, productIds, enabled: cfg.enabled, companyId })
    
    const hasAccess = await userHasAccessToAnyProducts({ userId, productIds, companyId })
    console.log('[paywall] access result', { hasAccess, userId, productIds })
    
    return Response.json({ hasAccess })
  } catch (error) {
    console.error("Error checking access for upcoming bets:", error)
    return Response.json({ hasAccess: true }) // fail-open
  }
}


