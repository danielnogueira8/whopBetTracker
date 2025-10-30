import { NextRequest } from "next/server"
import { verifyUserToken } from "@whop/api"
import { db } from "~/db"
import { upcomingBets, userBetAccess } from "~/db/schema"
import { eq } from "drizzle-orm"
import { whop } from "~/lib/whop"

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

    // Admins of the experience always have access
    const access = await whop.access.checkIfUserHasAccessToExperience({
      experienceId: bet.experienceId,
      userId,
    })
    if (access?.accessLevel === "admin" || access?.accessLevel === "member") {
      // Members eligible via paywall see for free
      return Response.json({ hasAccess: true })
    }

    // Check per-bet purchased access
    const existing = await db
      .select({ id: userBetAccess.id })
      .from(userBetAccess)
      .where(eq(userBetAccess.betId, bet.id))
      .where(eq(userBetAccess.userId, userId))
      .limit(1)

    return Response.json({ hasAccess: Boolean(existing[0]) })
  } catch (error) {
    console.error("Error checking per-bet access:", error)
    return Response.json({ hasAccess: false })
  }
}


