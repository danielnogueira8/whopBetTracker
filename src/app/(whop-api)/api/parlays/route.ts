import { NextRequest } from "next/server"
import { db } from "~/db"
import { parlays, parlayLegs, experienceSettings } from "~/db/schema"
import { verifyUserToken } from "@whop/api"
import { whop } from "~/lib/whop"
import { eq, and, desc, asc, count } from "drizzle-orm"
import { calculateParlayOdds } from "~/lib/parlay-utils"
import { formatParlayForForum } from "~/lib/forum-post-utils"
import { env } from "~/env"

// GET - Fetch parlays with filtering
export async function GET(req: NextRequest) {
  try {
    const { userId } = await verifyUserToken(req.headers)
    const { searchParams } = new URL(req.url)

    const experienceId = searchParams.get("experienceId")
    const isCommunity = searchParams.get("isCommunity") === "true"
    const isUpcoming = searchParams.get("isUpcoming") === "true"
    const page = parseInt(searchParams.get("page") || "1")
    const limit = parseInt(searchParams.get("limit") || "50")
    const offset = (page - 1) * limit
    const order = (searchParams.get("order") || "desc").toLowerCase() === "asc" ? "asc" : "desc"

    if (!experienceId) {
      return Response.json({ error: "experienceId is required" }, { status: 400 })
    }

    // Build where conditions
    let whereClause;
    
    if (isUpcoming) {
      whereClause = and(
        eq(parlays.experienceId, experienceId),
        eq(parlays.isUpcomingBet, true)
      )
    } else if (isCommunity) {
      whereClause = and(
        eq(parlays.experienceId, experienceId),
        eq(parlays.isCommunityBet, true)
      )
    } else {
      // User's own parlays
      whereClause = and(
        eq(parlays.experienceId, experienceId),
        eq(parlays.userId, userId),
        eq(parlays.isCommunityBet, false),
        eq(parlays.isUpcomingBet, false)
      )
    }

    // Fetch parlays with pagination
    const results = await db
      .select()
      .from(parlays)
      .where(whereClause)
      .orderBy(order === "asc" ? asc(parlays.createdAt) : desc(parlays.createdAt))
      .limit(limit)
      .offset(offset)

    // Count total
    const [countResult] = await db
      .select({ count: count() })
      .from(parlays)
      .where(whereClause)

    const totalCount = countResult?.count || 0

    // Fetch legs for each parlay
    const parlaysWithLegs = await Promise.all(
      results.map(async (parlay) => {
        const legs = await db
          .select()
          .from(parlayLegs)
          .where(eq(parlayLegs.parlayId, parlay.id))
          .orderBy(parlayLegs.legOrder)

        return {
          ...parlay,
          legs,
        }
      })
    )

    return Response.json({
      parlays: parlaysWithLegs,
      pagination: {
        page,
        limit,
        total: totalCount,
        pages: Math.ceil(totalCount / limit),
      },
    })
  } catch (error) {
    console.error("Error fetching parlays:", error)
    return Response.json({ error: "Failed to fetch parlays" }, { status: 500 })
  }
}

// POST - Create new parlay
export async function POST(req: NextRequest) {
  try {
    const { userId } = await verifyUserToken(req.headers)
    const body = await req.json()

    const {
      experienceId,
      userId: parlayUserId,
      name,
      legs,
      isCommunityBet = false,
      isUpcomingBet = false,
      unitsInvested,
      dollarsInvested,
      notes,
      forumPostId,
      eventDate,
      explanation,
      confidenceLevel,
      shouldPostToForum,
    } = body

    if (!experienceId) {
      return Response.json({ error: "experienceId is required" }, { status: 400 })
    }

    if (!name) {
      return Response.json({ error: "Parlay name is required" }, { status: 400 })
    }

    if (!legs || !Array.isArray(legs) || legs.length < 2) {
      return Response.json({ error: "At least 2 legs are required" }, { status: 400 })
    }

    // Validate legs
    for (const leg of legs) {
      if (!leg.sport || !leg.game || !leg.outcome || !leg.oddFormat || !leg.oddValue) {
        return Response.json(
          { error: "Each leg must have sport, game, outcome, oddFormat, and oddValue" },
          { status: 400 }
        )
      }
    }

    // Check admin for community and upcoming parlays
    if (isCommunityBet || isUpcomingBet) {
      const access = await whop.access.checkIfUserHasAccessToExperience({ experienceId, userId })
      if (access.accessLevel !== "admin") {
        return Response.json(
          { error: "Only admins can create community or upcoming parlays" },
          { status: 403 }
        )
      }
    }

    // Calculate combined odds
    const combinedDecimal = calculateParlayOdds(
      legs.map((leg: any) => ({
        oddFormat: leg.oddFormat,
        oddValue: leg.oddValue.toString(),
      }))
    )

    // For now, store in decimal format. Could add conversion later
    const combinedOddFormat = "decimal"
    const combinedOddValue = combinedDecimal.toFixed(2)

    // Create parlay
    const [newParlay] = await db
      .insert(parlays)
      .values({
        experienceId,
        userId: parlayUserId || null,
        name,
        combinedOddFormat,
        combinedOddValue,
        unitsInvested: unitsInvested?.toString() || null,
        dollarsInvested: dollarsInvested?.toString() || null,
        isCommunityBet,
        isUpcomingBet,
        notes: notes || null,
        forumPostId: forumPostId || null,
        eventDate: eventDate ? new Date(eventDate) : null,
        explanation: explanation || null,
        confidenceLevel: confidenceLevel || null,
        createdById: userId,
      })
      .returning()

    // Create legs
    const newLegs = await Promise.all(
      legs.map((leg: any, index: number) => {
        let sport = leg.sport;
        let league: string | null = leg.league ?? null;
        try {
          const { normalizeSportKey } = require("~/lib/sport-normalization");
          if (league) {
            const n = normalizeSportKey(league);
            if (n?.league) {
              sport = n.label;
              league = n.league;
            }
          } else {
            const n = normalizeSportKey(sport);
            if (n) {
              sport = n.label;
              if (n.league) league = n.league;
            }
          }
        } catch {}

        return db.insert(parlayLegs).values({
          parlayId: newParlay.id,
          sport,
          league,
          game: leg.game,
          outcome: leg.outcome,
          betCategory: leg.betCategory || "game_match",
          oddFormat: leg.oddFormat,
          oddValue: leg.oddValue.toString(),
          legOrder: index + 1,
        });
      })
    )

    // Check forum integration settings
    const settings = await db
      .select()
      .from(experienceSettings)
      .where(eq(experienceSettings.experienceId, experienceId))
      .limit(1)

    const shouldPost = shouldPostToForum || (settings[0]?.autoPostEnabled && settings[0]?.forumId)
    const forumId = settings[0]?.forumId

    // Debug logging
    console.log("[Parlay Forum] shouldPostToForum:", shouldPostToForum)
    console.log("[Parlay Forum] isUpcomingBet:", isUpcomingBet)
    console.log("[Parlay Forum] settings:", settings[0])
    console.log("[Parlay Forum] shouldPost:", shouldPost)
    console.log("[Parlay Forum] forumId:", forumId)

    // Post to forum if enabled
    let updatedParlay = newParlay
    if (shouldPost && forumId && isUpcomingBet) {
      try {
        // Fetch legs from database to ensure proper structure
        const createdLegsForForum = await db
          .select()
          .from(parlayLegs)
          .where(eq(parlayLegs.parlayId, newParlay.id))
          .orderBy(parlayLegs.legOrder)

        const parlayWithLegs = {
          ...newParlay,
          legs: createdLegsForForum,
        }

        const postContent = formatParlayForForum(parlayWithLegs as any)

        console.log("[Parlay Forum] Creating forum post with content length:", postContent.length)

        // Use direct API call since whop.forumPosts is not available in the SDK
        const response = await fetch(`https://api.whop.com/api/v1/forum_posts`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${env.WHOP_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            experience_id: forumId,
            content: postContent,
          }),
        })

        if (response.ok) {
          const forumPost = await response.json()
          console.log("[Parlay Forum] Forum post created successfully:", forumPost.id)
          await db.update(parlays).set({ forumPostId: forumPost.id }).where(eq(parlays.id, newParlay.id))
          updatedParlay = { ...newParlay, forumPostId: forumPost.id }
        } else {
          const errorText = await response.text()
          console.error("[Parlay Forum] API error:", errorText)
          console.error("[Parlay Forum] Status:", response.status)
        }
      } catch (error) {
        console.error("[Parlay Forum] Error posting to forum:", error)
        // Continue even if forum posting fails
      }
    }

    // Fetch legs for response
    const createdLegs = await db
      .select()
      .from(parlayLegs)
      .where(eq(parlayLegs.parlayId, newParlay.id))
      .orderBy(parlayLegs.legOrder)

    return Response.json({
      parlay: {
        ...updatedParlay,
        legs: createdLegs,
      },
    })
  } catch (error) {
    console.error("Error creating parlay:", error)
    return Response.json({ error: "Failed to create parlay" }, { status: 500 })
  }
}

