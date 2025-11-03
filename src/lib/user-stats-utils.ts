import { db } from "~/db";
import { userStats } from "~/db/schema";
import { eq } from "drizzle-orm";

/**
 * Update user stats when a bet/leg result changes
 * Handles both regular bets and parlay legs
 */
export async function updateUserStatsForResultChange(
  userId: string,
  oldResult: string,
  newResult: string,
  hasInvestment: boolean
) {
  if (!hasInvestment || oldResult === newResult) {
    return;
  }

  try {
    const existingStats = await db
      .select()
      .from(userStats)
      .where(eq(userStats.userId, userId))
      .limit(1);

    if (existingStats.length === 0) {
      return; // No stats entry exists, skip
    }

    const updates: any = {};

    // Handle win/loss changes
    if (oldResult === "win" && (newResult === "lose" || newResult === "returned")) {
      // Reverting a win
      updates.wonBets = existingStats[0].wonBets - 1;
    } else if (
      (oldResult === "lose" || oldResult === "returned" || oldResult === "pending") &&
      newResult === "win"
    ) {
      // New win
      updates.wonBets = existingStats[0].wonBets + 1;
    }

    if (Object.keys(updates).length > 0) {
      await db.update(userStats).set(updates).where(eq(userStats.userId, userId));
    }
  } catch (statsError) {
    console.error("Error updating user stats:", statsError);
  }
}

