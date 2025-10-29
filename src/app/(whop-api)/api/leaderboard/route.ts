import { NextRequest } from "next/server";
import { verifyUserToken } from "@whop/api";
import { db } from "~/db";
import { userStats } from "~/db/schema";

/**
 * GET /api/leaderboard - Get global leaderboard
 */
export async function GET(req: NextRequest) {
  try {
    await verifyUserToken(req.headers);

    const stats = await db.select().from(userStats);

    // Calculate and add derived fields
    const leaderboard = stats.map((stat) => {
      const winRate =
        stat.totalBets > 0 ? (stat.wonBets / stat.totalBets) * 100 : 0;

      const unitROI = parseFloat(stat.totalUnitsInvested) > 0
        ? ((parseFloat(stat.totalUnitsWon) - parseFloat(stat.totalUnitsInvested)) /
           parseFloat(stat.totalUnitsInvested)) * 100
        : 0;

      const dollarROI = parseFloat(stat.totalDollarsInvested) > 0
        ? ((parseFloat(stat.totalDollarsWon) - parseFloat(stat.totalDollarsInvested)) /
           parseFloat(stat.totalDollarsInvested)) * 100
        : 0;

      return {
        ...stat,
        winRate,
        unitROI,
        dollarROI,
      };
    });

    // Sort by win rate (descending), then by total bets
    const sorted = leaderboard.sort((a, b) => {
      if (b.winRate !== a.winRate) {
        return b.winRate - a.winRate;
      }
      return b.totalBets - a.totalBets;
    });

    return Response.json({ leaderboard: sorted });
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    return Response.json(
      { error: "Failed to fetch leaderboard" },
      { status: 500 }
    );
  }
}



