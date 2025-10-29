import { NextRequest } from "next/server";
import { verifyUserToken } from "@whop/api";
import { db } from "~/db";
import { bets, userStats } from "~/db/schema";
import { eq, and, desc, asc, sql } from "drizzle-orm";

/**
 * GET /api/bets - Fetch all bets for a user
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await verifyUserToken(req.headers);
    
    // Get query parameters
    const { searchParams } = new URL(req.url);
    const experienceId = searchParams.get("experienceId");
    const isCommunity = searchParams.get("isCommunity");
    const userOnly = searchParams.get("userOnly");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = (page - 1) * limit;
    const order = (searchParams.get("order") || "desc").toLowerCase() === "asc" ? "asc" : "desc";

    // Require experienceId
    if (!experienceId) {
      return Response.json({ error: "experienceId is required" }, { status: 400 });
    }

    if (isCommunity === "true") {
      // Community bets (visible to everyone)
      const communityDataQuery = db
        .select()
        .from(bets)
        .where(and(eq(bets.isCommunityBet, true), eq(bets.experienceId, experienceId)))
        .orderBy(order === "asc" ? asc(bets.createdAt) : desc(bets.createdAt))
        .limit(limit)
        .offset(offset);
      
      const communityCountQuery = db
        .select({ count: sql<number>`count(*)` })
        .from(bets)
        .where(and(eq(bets.isCommunityBet, true), eq(bets.experienceId, experienceId)));

      const results = await communityDataQuery;
      const totalResult = await communityCountQuery;
      
      return Response.json({ 
        bets: results, 
        pagination: { 
          page, 
          limit, 
          total: totalResult[0].count,
          totalPages: Math.ceil(totalResult[0].count / limit)
        } 
      });
    }

    // Build queries for user-only bets
    let dataQuery = db.select().from(bets);
    
    if (userOnly === "true") {
      // User's personal bets - exclude community bets
      dataQuery = dataQuery.where(
        and(eq(bets.userId, userId), eq(bets.isCommunityBet, false), eq(bets.experienceId, experienceId))
      ) as any;
    }

    // Build count query
    const countQuery = db
      .select({ count: sql<number>`count(*)` })
      .from(bets)
      .where(userOnly === "true" 
        ? and(eq(bets.userId, userId), eq(bets.isCommunityBet, false), eq(bets.experienceId, experienceId))
        : eq(bets.experienceId, experienceId)
      );

    const results = await dataQuery
      .orderBy(order === "asc" ? asc(bets.createdAt) : desc(bets.createdAt))
      .limit(limit)
      .offset(offset);
    
    const totalResult = await countQuery;
    
    return Response.json({ 
      bets: results,
      pagination: {
        page,
        limit,
        total: totalResult[0].count,
        totalPages: Math.ceil(totalResult[0].count / limit)
      }
    });
  } catch (error) {
    console.error("Error fetching bets:", error);
    return Response.json({ error: "Failed to fetch bets" }, { status: 500 });
  }
}

/**
 * POST /api/bets - Create a new bet
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await verifyUserToken(req.headers);
    const body = await req.json();

    const {
      experienceId,
      sport,
      league: inputLeague,
      game,
      outcome,
      betCategory = "game_match",
      oddFormat,
      oddValue,
      unitsInvested,
      dollarsInvested,
      notes,
      confidenceLevel,
      date,
      result = "pending",
      isCommunityBet = false,
    } = body;

    // Validation
    if (!experienceId || !sport || !game || !outcome || !oddFormat || !oddValue) {
      return Response.json(
        { error: "Missing required fields (experienceId, sport, game, outcome, oddFormat, oddValue)" },
        { status: 400 }
      );
    }

    // Canonicalize sport/league conservatively
    let canonicalSport = sport as string;
    let league: string | null = inputLeague ?? null;
    try {
      const { normalizeSportKey } = await import("~/lib/sport-normalization");
      if (league && typeof league === "string") {
        // If a league is explicitly provided and maps to a sport, align sport
        const n = normalizeSportKey(league);
        if (n?.league && n.label) {
          canonicalSport = n.label; // label is canonical sport name
          league = n.league;
        }
      } else {
        // If sport itself is an alias that carries a league (e.g., nfl)
        const n = normalizeSportKey(canonicalSport);
        if (n?.league) {
          canonicalSport = n.label;
          league = n.league;
        } else if (n) {
          canonicalSport = n.label;
        }
      }
    } catch {}

    const betDate = date ? new Date(date) : new Date();

    const newBet = await db
      .insert(bets)
      .values({
        experienceId,
        userId,
        sport: canonicalSport,
        league,
        game,
        outcome,
        betCategory,
        oddFormat,
        oddValue: oddValue.toString(),
        unitsInvested: unitsInvested?.toString(),
        dollarsInvested: dollarsInvested?.toString(),
        notes: notes || null,
        confidenceLevel: confidenceLevel || 5,
        isCommunityBet,
        createdById: userId,
        result,
        createdAt: betDate,
      })
      .returning();

    // Update user stats if bet has units/dollars
    if (unitsInvested || dollarsInvested) {
      try {
        const existingStats = await db
          .select()
          .from(userStats)
          .where(eq(userStats.userId, userId))
          .limit(1);

        if (existingStats.length === 0) {
          // Create new stats entry
          await db.insert(userStats).values({
            userId,
            username: userId, // Use userId as default, can be updated later
            totalBets: 1,
            totalUnitsInvested: unitsInvested || "0",
            totalDollarsInvested: dollarsInvested || "0",
          });
        } else {
          // Update existing stats
          await db
            .update(userStats)
            .set({
              totalBets: existingStats[0].totalBets + 1,
              totalUnitsInvested: (parseFloat(existingStats[0].totalUnitsInvested) + parseFloat(unitsInvested || "0")).toString(),
              totalDollarsInvested: (parseFloat(existingStats[0].totalDollarsInvested) + parseFloat(dollarsInvested || "0")).toString(),
            })
            .where(eq(userStats.userId, userId));
        }
      } catch (statsError) {
        console.error("Error updating user stats:", statsError);
        // Don't fail the bet creation if stats update fails
      }
    }

    return Response.json({ bet: newBet[0] });
  } catch (error) {
    console.error("Error creating bet:", error);
    return Response.json({ error: "Failed to create bet" }, { status: 500 });
  }
}

