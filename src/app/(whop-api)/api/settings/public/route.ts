import { NextRequest } from "next/server"
import { db } from "~/db"
import { experienceSettings } from "~/db/schema"
import { eq } from "drizzle-orm"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const experienceId = searchParams.get("experienceId")
    if (!experienceId) {
      return Response.json({ error: "experienceId is required" }, { status: 400 })
    }

    const settings = await db
      .select({ paywallConfig: experienceSettings.paywallConfig })
      .from(experienceSettings)
      .where(eq(experienceSettings.experienceId, experienceId))
      .limit(1)

    const paywallConfig = (settings[0]?.paywallConfig as any) ?? { 
      enabled: false, 
      productIds: [], 
      rule: 'any',
      lockedMessage: "Subscribe to view odds, units, and explanations."
    }
    // Ensure lockedMessage exists
    if (!paywallConfig.lockedMessage) {
      paywallConfig.lockedMessage = "Subscribe to view odds, units, and explanations."
    }
    return Response.json({ paywallConfig })
  } catch (error) {
    console.error("Error fetching public settings:", error)
    return Response.json({ error: "Failed to fetch settings" }, { status: 500 })
  }
}


