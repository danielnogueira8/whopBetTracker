import { NextRequest } from "next/server";
import { verifyUserToken } from "@whop/api";
import { db } from "~/db";
import { bets, userStats } from "~/db/schema";
import { eq, and, desc, sql } from "drizzle-orm";

/**
 * GET /api/bets - Fetch all bets for a user
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await verifyUserToken(req.headers);
    
    // Get query parameters
    const { searchParams } = new URL(req.url);
    const isCommunity = searchParams.get("isCommunity");
    const userOnly = searchParams.get("userOnly");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const offset = (page - 1) * limit;

    // Build count query for pagination
    let countQuery = db.select({ count: sql<number>`count(*)` }).from(bets);
    
    // Build data query
    let dataQuery = db.select().from(bets);

    if (userOnly === "true") {
      // User's personal bets
      dataQuery = dataQuery.where(eq(bets.userId, userId)) as any;
      countQuery = countQuery.where(eq(bets.userId, userId));
    }

    if (isCommunity === "true") {
      // Community bets (visible to everyone)
      const communityDataQuery = db
        .select()
        .from(bets)
        .where(eq(bets.isCommunityBet, true))
        .orderBy(desc(bets.createdAt))
        .limit(limit)
        .offset(offset);
      
      const communityCountQuery = db
        .select({ count: sql<number>`count(*)` })
        .from(bets)
        .where(eq(bets.isCommunityBet, true));

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

    if (userOnly === "true") {
      // Exclude community bets
      dataQuery = dataQuery.where(
        and(eq(bets.userId, userId), eq(bets.isCommunityBet, false))
      ) as any;
      countQuery = countQuery.where(
        and(eq(bets.userId, userId), eq(bets.isCommunityBet, false))
      );
    }

    const results = await dataQuery
      .orderBy(desc(bets.createdAt))
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
      sport,
      game,
      outcome,
      betCategory = "game_match",
      oddFormat,
      oddValue,
      unitsInvested,
      dollarsInvested,
      date,
      result = "pending",
      isCommunityBet = false,
    } = body;

    // Validation
    if (!game || !outcome || !oddFormat || !oddValue) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const betDate = date ? new Date(date) : new Date();

    const newBet = await db
      .insert(bets)
      .values({
        userId,
        sport,
        game,
        outcome,
        betCategory,
        oddFormat,
        oddValue: oddValue.toString(),
        unitsInvested: unitsInvested?.toString(),
        dollarsInvested: dollarsInvested?.toString(),
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

