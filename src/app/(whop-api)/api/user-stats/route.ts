import { NextRequest } from "next/server";
import { verifyUserToken } from "@whop/api";
import { db } from "~/db";
import { userStats } from "~/db/schema";
import { eq } from "drizzle-orm";

/**
 * GET /api/user-stats - Get user stats
 */
export async function GET(req: NextRequest) {
  try {
    const { userId } = await verifyUserToken(req.headers);

    const result = await db
      .select()
      .from(userStats)
      .where(eq(userStats.userId, userId))
      .limit(1);

    if (result.length === 0) {
      // Return default stats if user doesn't have stats yet
      return Response.json({
        stats: {
          userId,
          username: "Unknown",
          totalBets: 0,
          wonBets: 0,
          totalUnitsInvested: "0",
          totalUnitsWon: "0",
          totalDollarsInvested: "0",
          totalDollarsWon: "0",
          hasCompletedOnboarding: false,
        },
      });
    }

    return Response.json({ stats: result[0] });
  } catch (error) {
    console.error("Error fetching user stats:", error);
    return Response.json(
      { error: "Failed to fetch user stats" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/user-stats - Update or create user stats
 */
export async function POST(req: NextRequest) {
  try {
    const { userId } = await verifyUserToken(req.headers);
    const body = await req.json();
    const { username, ...statUpdates } = body;

    // Check if stats exist
    const existing = await db
      .select()
      .from(userStats)
      .where(eq(userStats.userId, userId))
      .limit(1);

    if (existing.length === 0) {
      // Create new stats
      const newStats = await db
        .insert(userStats)
        .values({
          userId,
          username: username || "Unknown",
          ...statUpdates,
        })
        .returning();

      return Response.json({ stats: newStats[0] });
    }

    // Update existing stats
    const updated = await db
      .update(userStats)
      .set({
        ...statUpdates,
        updatedAt: new Date(),
      })
      .where(eq(userStats.userId, userId))
      .returning();

    return Response.json({ stats: updated[0] });
  } catch (error) {
    console.error("Error updating user stats:", error);
    return Response.json(
      { error: "Failed to update user stats" },
      { status: 500 }
    );
  }
}

