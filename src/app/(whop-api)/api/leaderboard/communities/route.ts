import { NextRequest, NextResponse } from "next/server";
import { verifyUserToken } from "@whop/api";
import { db } from "~/db";
import { bets } from "~/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { whop } from "~/lib/whop";
import { calculateBettingROI } from "~/lib/bet-utils";

// Helper: convert to decimal odds
function toDecimalOdds(value: string, format: string): number {
  const num = parseFloat(value);
  if (format === "decimal") return num;
  if (format === "american") {
    return num > 0 ? num / 100 + 1 : 100 / Math.abs(num) + 1;
  }
  // fractional e.g. 5/2
  const [n, d] = value.split("/").map(Number);
  return d ? n / d + 1 : 0;
}

export async function GET(req: NextRequest) {
  try {
    await verifyUserToken(req.headers);

    // Fetch all community bets across experiences (server-side aggregate)
    const rows = await db
      .select()
      .from(bets)
      .where(eq(bets.isCommunityBet, true));

    // Group by experienceId
    const grouped: Record<string, any[]> = {};
    for (const row of rows) {
      if (!grouped[row.experienceId]) grouped[row.experienceId] = [];
      grouped[row.experienceId].push(row);
    }

    // Cache experience titles to avoid repeated API calls
    const titleCache: Record<string, string> = {};

    const leaderboard = await Promise.all(
      Object.entries(grouped).map(async ([experienceId, items]) => {
        let totalBets = 0;
        let wonBets = 0;
        const oddValues: Array<{ value: string; format: string }> = [];

        for (const bet of items) {
          totalBets++;
          if (bet.result === "win") wonBets++;
          oddValues.push({ value: String(bet.oddValue), format: bet.oddFormat });
        }

        const winRate = totalBets > 0 ? (wonBets / totalBets) * 100 : 0;
        let avgOdds = 0;
        if (oddValues.length > 0) {
          const sum = oddValues.reduce((s, o) => s + toDecimalOdds(o.value, o.format), 0);
          avgOdds = sum / oddValues.length;
        }
        const winRatio = winRate / 100;
        const roi = avgOdds > 0 ? calculateBettingROI(avgOdds, winRatio, true) : 0;

        if (!titleCache[experienceId]) {
          const exp = await whop.experiences.getExperience({ experienceId });
          titleCache[experienceId] = exp?.company?.title ?? experienceId;
        }

        return {
          experienceId,
          companyName: titleCache[experienceId],
          totalBets,
          wonBets,
          winRate,
          avgOdds,
          roi,
        };
      })
    );

    // Sort by win rate desc, then total bets desc
    leaderboard.sort((a, b) => (b.winRate !== a.winRate ? b.winRate - a.winRate : b.totalBets - a.totalBets));

    return NextResponse.json({ leaderboard });
  } catch (error) {
    console.error("Error fetching communities leaderboard:", error);
    return NextResponse.json({ error: "Failed to fetch communities leaderboard" }, { status: 500 });
  }
}


