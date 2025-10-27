import { NextRequest } from "next/server"
import { db } from "~/db"
import { experienceSettings } from "~/db/schema"
import { verifyUserToken } from "@whop/api"
import { whop } from "~/lib/whop"
import { eq } from "drizzle-orm"

export async function GET(req: NextRequest) {
  try {
    const { userId } = await verifyUserToken(req.headers)
    const { searchParams } = new URL(req.url)
    const experienceId = searchParams.get("experienceId")

    if (!experienceId) {
      return Response.json({ error: "experienceId is required" }, { status: 400 })
    }

    // Check if user is admin
    const access = await whop.access.checkIfUserHasAccessToExperience({ 
      experienceId, 
      userId 
    })

    if (access.accessLevel !== "admin") {
      return Response.json(
        { error: "Only admins can view settings" },
        { status: 403 }
      )
    }

    // Fetch settings or return default
    const settings = await db
      .select()
      .from(experienceSettings)
      .where(eq(experienceSettings.experienceId, experienceId))
      .limit(1)

    if (settings.length === 0) {
      // Return default settings
      return Response.json({
        settings: {
          experienceId,
          forumId: null,
          autoPostEnabled: false,
        }
      })
    }

    return Response.json({ settings: settings[0] })
  } catch (error) {
    console.error("Error fetching settings:", error)
    return Response.json({ error: "Failed to fetch settings" }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { userId } = await verifyUserToken(req.headers)
    const body = await req.json()
    const { experienceId, forumId, autoPostEnabled } = body

    if (!experienceId) {
      return Response.json({ error: "experienceId is required" }, { status: 400 })
    }

    // Check if user is admin
    const access = await whop.access.checkIfUserHasAccessToExperience({ 
      experienceId, 
      userId 
    })

    if (access.accessLevel !== "admin") {
      return Response.json(
        { error: "Only admins can update settings" },
        { status: 403 }
      )
    }

    // Check if settings exist
    const existing = await db
      .select()
      .from(experienceSettings)
      .where(eq(experienceSettings.experienceId, experienceId))
      .limit(1)

    if (existing.length > 0) {
      // Update existing settings
      const updated = await db
        .update(experienceSettings)
        .set({
          forumId: forumId ?? null,
          autoPostEnabled: autoPostEnabled ?? false,
          updatedAt: new Date(),
        })
        .where(eq(experienceSettings.experienceId, experienceId))
        .returning()

      return Response.json({ settings: updated[0] })
    } else {
      // Create new settings
      const created = await db
        .insert(experienceSettings)
        .values({
          experienceId,
          forumId: forumId ?? null,
          autoPostEnabled: autoPostEnabled ?? false,
        })
        .returning()

      return Response.json({ settings: created[0] })
    }
  } catch (error) {
    console.error("Error updating settings:", error)
    return Response.json({ error: "Failed to update settings" }, { status: 500 })
  }
}

