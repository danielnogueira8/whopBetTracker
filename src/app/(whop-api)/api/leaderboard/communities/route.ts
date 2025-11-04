import { NextRequest, NextResponse } from "next/server";
import { verifyUserToken } from "@whop/api";
import { db } from "~/db";
import { bets, parlays, parlayLegs } from "~/db/schema";
import { eq, inArray } from "drizzle-orm";
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

    const communityParlays = await db
      .select()
      .from(parlays)
      .where(eq(parlays.isCommunityBet, true));

    let communityParlayLegs: any[] = [];
    if (communityParlays.length > 0) {
      const parlayIds = communityParlays.map((parlay) => parlay.id);
      communityParlayLegs = await db
        .select()
        .from(parlayLegs)
        .where(inArray(parlayLegs.parlayId, parlayIds));
    }

    const parlayMap = new Map(communityParlays.map((parlay) => [parlay.id, parlay] as const));

    // Group by experienceId
    const grouped: Record<string, { bets: any[]; legs: Array<{ leg: any; parlay: any }> }> = {};
    for (const row of rows) {
      if (!grouped[row.experienceId]) {
        grouped[row.experienceId] = { bets: [], legs: [] };
      }
      grouped[row.experienceId].bets.push(row);
    }

    for (const leg of communityParlayLegs) {
      const parent = parlayMap.get(leg.parlayId);
      if (!parent) continue;
      if (!grouped[parent.experienceId]) {
        grouped[parent.experienceId] = { bets: [], legs: [] };
      }
      grouped[parent.experienceId].legs.push({ leg, parlay: parent });
    }

    // Cache experience titles to avoid repeated API calls
    const titleCache: Record<string, string> = {};

    const leaderboard = await Promise.all(
      Object.entries(grouped).map(async ([experienceId, items]) => {
        const betItems = items?.bets ?? [];
        const legItems = items?.legs ?? [];

        const combined = [
          ...betItems.map((bet) => ({
            result: bet.result,
            oddValue: String(bet.oddValue),
            oddFormat: bet.oddFormat,
          })),
          ...legItems.map(({ leg }) => ({
            result: leg.result,
            oddValue: String(leg.oddValue),
            oddFormat: leg.oddFormat,
          })),
        ];

        const totalBets = combined.length;
        const wonBets = combined.filter((entry) => entry.result === "win").length;

        const oddValues: Array<{ value: string; format: string }> = combined
          .filter((entry) => entry.oddValue && entry.oddFormat)
          .map((entry) => ({ value: entry.oddValue, format: entry.oddFormat }));

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


