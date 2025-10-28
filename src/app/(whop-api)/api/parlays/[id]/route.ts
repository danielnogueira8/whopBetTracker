import { NextRequest } from "next/server"
import { db } from "~/db"
import { parlays, parlayLegs, experienceSettings } from "~/db/schema"
import { verifyUserToken } from "@whop/api"
import { whop } from "~/lib/whop"
import { eq, and } from "drizzle-orm"
import { calculateParlayOdds, calculateParlayResult } from "~/lib/parlay-utils"
import { formatParlayForForum } from "~/lib/forum-post-utils"
import { env } from "~/env"

// GET - Fetch single parlay
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyUserToken(req.headers)
    const { id } = await params

    const parlay = await db.select().from(parlays).where(eq(parlays.id, id)).limit(1)

    if (parlay.length === 0) {
      return Response.json({ error: "Parlay not found" }, { status: 404 })
    }

    // Fetch legs
    const legs = await db
      .select()
      .from(parlayLegs)
      .where(eq(parlayLegs.parlayId, id))
      .orderBy(parlayLegs.legOrder)

    return Response.json({
      parlay: {
        ...parlay[0],
        legs,
      },
    })
  } catch (error) {
    console.error("Error fetching parlay:", error)
    return Response.json({ error: "Failed to fetch parlay" }, { status: 500 })
  }
}

// PATCH - Update parlay
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await verifyUserToken(req.headers)
    const { id } = await params
    const body = await req.json()

    const {
      experienceId,
      shouldUpdateForumPost,
      ...updateData
    } = body

    // Validate legs to avoid inserting undefined values
    if (updateData.legs && Array.isArray(updateData.legs)) {
      for (const leg of updateData.legs) {
        if (leg.oddFormat == null || leg.oddValue == null) {
          return Response.json(
            { error: "Each leg requires oddFormat and oddValue" },
            { status: 400 }
          )
        }
      }
    }

    // Fetch existing parlay
    const existing = await db.select().from(parlays).where(eq(parlays.id, id)).limit(1)

    if (existing.length === 0) {
      return Response.json({ error: "Parlay not found" }, { status: 404 })
    }

    const parlay = existing[0]

    // Check permissions
    if (parlay.isCommunityBet || parlay.isUpcomingBet) {
      const access = await whop.access.checkIfUserHasAccessToExperience({
        experienceId: parlay.experienceId,
        userId,
      })
      if (access.accessLevel !== "admin") {
        return Response.json(
          { error: "Only admins can update community or upcoming parlays" },
          { status: 403 }
        )
      }
    } else if (parlay.userId !== userId) {
      return Response.json({ error: "Forbidden" }, { status: 403 })
    }

    // Prepare update fields
    const updateFields: any = {
      updatedAt: new Date(),
    }

    if (updateData.name) updateFields.name = updateData.name
    if (updateData.unitsInvested !== undefined)
      updateFields.unitsInvested = updateData.unitsInvested?.toString() || null
    if (updateData.dollarsInvested !== undefined)
      updateFields.dollarsInvested = updateData.dollarsInvested?.toString() || null
    if (updateData.notes !== undefined) updateFields.notes = updateData.notes || null
    if (updateData.eventDate !== undefined)
      updateFields.eventDate = updateData.eventDate ? new Date(updateData.eventDate) : null
    if (updateData.explanation !== undefined)
      updateFields.explanation = updateData.explanation || null
    if (updateData.confidenceLevel !== undefined)
      updateFields.confidenceLevel = updateData.confidenceLevel || null
    if (updateData.result !== undefined)
      updateFields.result = updateData.result
    if (updateData.isUpcomingBet !== undefined)
      updateFields.isUpcomingBet = updateData.isUpcomingBet
    if (updateData.isCommunityBet !== undefined)
      updateFields.isCommunityBet = updateData.isCommunityBet

    // Handle leg updates
    if (updateData.legs && Array.isArray(updateData.legs)) {
      // Recalculate combined odds if legs changed
      const combinedDecimal = calculateParlayOdds(
        updateData.legs.map((leg: any) => ({
          oddFormat: leg.oddFormat,
          oddValue: leg.oddValue.toString(),
        }))
      )

      updateFields.combinedOddFormat = "decimal"
      updateFields.combinedOddValue = combinedDecimal.toFixed(2)

      // Update or insert legs
      const existingLegs = await db
        .select()
        .from(parlayLegs)
        .where(eq(parlayLegs.parlayId, id))

      // Delete old legs
      await db.delete(parlayLegs).where(eq(parlayLegs.parlayId, id))

      // Insert new legs
      await Promise.all(
        updateData.legs.map((leg: any, index: number) =>
          db.insert(parlayLegs).values({
            parlayId: id,
            sport: leg.sport,
            game: leg.game,
            outcome: leg.outcome,
            betCategory: leg.betCategory || "game_match",
            oddFormat: leg.oddFormat,
            oddValue: leg.oddValue.toString(),
            result: leg.result || "pending",
            legOrder: index + 1,
          })
        )
      )
    }

    // Update parlay
    const [updated] = await db.update(parlays).set(updateFields).where(eq(parlays.id, id)).returning()

    // Auto-calculate result based on leg results ONLY if no explicit result was provided
    if (updateData.result === undefined) {
      const legs = await db
        .select()
        .from(parlayLegs)
        .where(eq(parlayLegs.parlayId, id))
        .orderBy(parlayLegs.legOrder)

      const legResults = legs.map((leg) => leg.result)
      const newResult = calculateParlayResult(legResults)

      await db.update(parlays).set({ result: newResult }).where(eq(parlays.id, id))
      updated.result = newResult
    } else {
      // If an explicit result was set (win/lose), cascade it to all legs
      if (updateData.result === "win" || updateData.result === "lose") {
        await db.update(parlayLegs)
          .set({ result: updateData.result })
          .where(eq(parlayLegs.parlayId, id))
      }
    }

    // Update forum post if requested
    if (shouldUpdateForumPost && updated.forumPostId && updated.isUpcomingBet) {
      try {
        const legs = await db
          .select()
          .from(parlayLegs)
          .where(eq(parlayLegs.parlayId, id))
          .orderBy(parlayLegs.legOrder)

        const parlayWithLegs = {
          ...updated,
          legs,
        }

        const postContent = formatParlayForForum(parlayWithLegs as any)

        const response = await fetch(`https://api.whop.com/api/v1/forum_posts/${updated.forumPostId}`, {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${env.WHOP_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            content: postContent,
          }),
        })

        if (!response.ok) {
          console.error("Forum API error:", await response.text())
        }
      } catch (error) {
        console.error("Error updating forum post:", error)
      }
    }

    // Fetch legs for response
    const legs = await db
      .select()
      .from(parlayLegs)
      .where(eq(parlayLegs.parlayId, id))
      .orderBy(parlayLegs.legOrder)

    return Response.json({
      parlay: {
        ...updated,
        legs,
      },
    })
  } catch (error) {
    console.error("Error updating parlay:", error)
    return Response.json({ error: "Failed to update parlay" }, { status: 500 })
  }
}

// DELETE - Delete parlay
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await verifyUserToken(req.headers)
    const { id } = await params

    // Fetch existing parlay
    const existing = await db.select().from(parlays).where(eq(parlays.id, id)).limit(1)

    if (existing.length === 0) {
      return Response.json({ error: "Parlay not found" }, { status: 404 })
    }

    const parlay = existing[0]

    // Check permissions
    if (parlay.isCommunityBet || parlay.isUpcomingBet) {
      const access = await whop.access.checkIfUserHasAccessToExperience({
        experienceId: parlay.experienceId,
        userId,
      })
      if (access.accessLevel !== "admin") {
        return Response.json(
          { error: "Only admins can delete community or upcoming parlays" },
          { status: 403 }
        )
      }
    } else if (parlay.userId !== userId) {
      return Response.json({ error: "Forbidden" }, { status: 403 })
    }

    // Delete forum post if it exists
    if (parlay.forumPostId) {
      try {
        await fetch(`https://api.whop.com/api/v1/forum_posts/${parlay.forumPostId}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${env.WHOP_API_KEY}`,
            "Content-Type": "application/json",
          },
        })
      } catch (error) {
        console.error("Error deleting forum post:", error)
        // Continue with parlay deletion even if forum post deletion fails
      }
    }

    // Delete parlay (legs will be deleted via cascade)
    await db.delete(parlays).where(eq(parlays.id, id))

    return Response.json({ success: true })
  } catch (error) {
    console.error("Error deleting parlay:", error)
    return Response.json({ error: "Failed to delete parlay" }, { status: 500 })
  }
}

