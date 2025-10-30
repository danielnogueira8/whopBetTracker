import { NextRequest } from "next/server"
import { verifyUserToken } from "@whop/api"
import { db } from "~/db"
import { experienceSettings, parlays, userParlayAccess } from "~/db/schema"
import { and, eq } from "drizzle-orm"
import { userHasAccessToAnyProducts, whop } from "~/lib/whop"

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await verifyUserToken(req.headers)
    if (!userId) return Response.json({ hasAccess: false })

    const { id } = await params
    const rows = await db.select().from(parlays).where(eq(parlays.id, id)).limit(1)
    const parlay = rows[0]
    if (!parlay) return Response.json({ hasAccess: false })

    const access = await whop.access.checkIfUserHasAccessToExperience({ experienceId: parlay.experienceId, userId })
    if (access?.accessLevel === 'admin') {
      return Response.json({ hasAccess: true })
    }

    // Evaluate paywall-configured products for membership eligibility
    try {
      const s = await db
        .select({ paywallConfig: experienceSettings.paywallConfig })
        .from(experienceSettings)
        .where(eq(experienceSettings.experienceId, parlay.experienceId))
        .limit(1)

      const cfg = (s[0]?.paywallConfig as any) || { enabled: false, productIds: [], rule: 'any' }
      if (cfg?.enabled) {
        const productIds: string[] = Array.isArray(cfg.productIds) ? cfg.productIds : []
        let eligible = false
        if (productIds.length > 0) {
          eligible = await userHasAccessToAnyProducts({ userId, productIds })
        } else {
          eligible = false
        }
        if (eligible) {
          return Response.json({ hasAccess: true })
        }
      }
    } catch (e) {
      console.warn('[parlay-access] failed to evaluate paywall membership', e)
    }

    const existing = await db
      .select({ id: userParlayAccess.id })
      .from(userParlayAccess)
      .where(and(eq(userParlayAccess.parlayId, parlay.id), eq(userParlayAccess.userId, userId)))
      .limit(1)

    return Response.json({ hasAccess: Boolean(existing[0]) })
  } catch (e) {
    console.error('Error checking parlay access', e)
    return Response.json({ hasAccess: false })
  }
}


