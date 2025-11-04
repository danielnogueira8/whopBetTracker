import { NextRequest } from "next/server"
import { verifyUserToken } from "@whop/api"
import { db } from "~/db"
import { experienceSettings, upcomingBets, userBetAccess } from "~/db/schema"
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

    // Load bet to get experienceId
    const rows = await db.select().from(upcomingBets).where(eq(upcomingBets.id, id)).limit(1)
    const bet = rows[0]
    if (!bet) return Response.json({ hasAccess: false })

    // Admins of the experience always have access; non-admin "customer" must pass paywall config
    const access = await whop.access.checkIfUserHasAccessToExperience({ experienceId: bet.experienceId, userId })
    if (access?.accessLevel === "admin") {
      return Response.json({ hasAccess: true })
    }

    // Check paywall-configured products for membership eligibility
    try {
      const s = await db
        .select({ paywallConfig: experienceSettings.paywallConfig })
        .from(experienceSettings)
        .where(eq(experienceSettings.experienceId, bet.experienceId))
        .limit(1)

      const cfg = (s[0]?.paywallConfig as any) || { enabled: false, productIds: [], rule: 'any' }
      if (cfg?.enabled) {
        const productIds: string[] = Array.isArray(cfg.productIds) ? cfg.productIds : []
        if (productIds.length > 0) {
          // Products configured - check if user has access to any of them
          const eligible = await userHasAccessToAnyProducts({ userId, productIds })
          if (eligible) {
            return Response.json({ hasAccess: true })
          }
        } else {
          // Paywall enabled but no products configured - user must purchase per-bet access
          // Don't return early, continue to check per-bet purchased access below
        }
      }
    } catch (e) {
      console.warn('[bet-access] failed to evaluate paywall membership', e)
    }

    // Check per-bet purchased access
    const existing = await db
      .select({ id: userBetAccess.id })
      .from(userBetAccess)
      .where(and(eq(userBetAccess.betId, bet.id), eq(userBetAccess.userId, userId)))
      .limit(1)

    return Response.json({ hasAccess: Boolean(existing[0]) })
  } catch (error) {
    console.error("Error checking per-bet access:", error)
    return Response.json({ hasAccess: false })
  }
}


