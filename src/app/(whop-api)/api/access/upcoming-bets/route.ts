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

    const productIds: string[] = Array.isArray(cfg.productIds) ? cfg.productIds : []
    console.log('[paywall] checking access', { userId, productIds, enabled: cfg.enabled, companyId })
    
    const hasAccess = await userHasAccessToAnyProducts({ userId, productIds, companyId })
    console.log('[paywall] access result', { hasAccess, userId, productIds })
    
    return Response.json({ hasAccess })
  } catch (error) {
    console.error("Error checking access for upcoming bets:", error)
    return Response.json({ hasAccess: true }) // fail-open
  }
}


