import { NextRequest } from "next/server";
import { verifyUserToken } from "@whop/api";
import { db } from "~/db";
import { bets, userStats } from "~/db/schema";
import { eq, and } from "drizzle-orm";

/**
 * GET /api/bets/[id] - Get a single bet
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await verifyUserToken(req.headers);
    const { id } = await params;

    const { searchParams } = new URL(req.url);
    const experienceId = searchParams.get("experienceId");

    // Require experienceId
    if (!experienceId) {
      return Response.json({ error: "experienceId is required" }, { status: 400 });
    }

    const result = await db.select().from(bets).where(
      and(eq(bets.id, id), eq(bets.experienceId, experienceId))
    ).limit(1);

    if (result.length === 0) {
      return Response.json({ error: "Bet not found" }, { status: 404 });
    }

    return Response.json({ bet: result[0] });
  } catch (error) {
    console.error("Error fetching bet:", error);
    return Response.json({ error: "Failed to fetch bet" }, { status: 500 });
  }
}

/**
 * PATCH /api/bets/[id] - Update a bet
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await verifyUserToken(req.headers);
    const { id } = await params;
    const body = await req.json();

    // Check if bet exists and user owns it
    const existingBet = await db
      .select()
      .from(bets)
      .where(eq(bets.id, id))
      .limit(1);

    if (existingBet.length === 0) {
      return Response.json({ error: "Bet not found" }, { status: 404 });
    }

    const bet = existingBet[0];

    // Only allow updates if user owns the bet or result is pending
    if (bet.userId !== userId && bet.result !== "pending") {
      return Response.json(
        { error: "Unauthorized to update this bet" },
        { status: 403 }
      );
    }

    // Update bet
    const updated = await db
      .update(bets)
      .set({
        ...body,
        updatedAt: new Date(),
      })
      .where(eq(bets.id, id))
      .returning();

    // Update user stats if result changed and bet has units
    const oldResult = bet.result;
    const newResult = body.result;
    
    if (oldResult !== newResult && (bet.unitsInvested || bet.dollarsInvested)) {
      try {
        const existingStats = await db
          .select()
          .from(userStats)
          .where(eq(userStats.userId, bet.userId))
          .limit(1);

        if (existingStats.length > 0) {
          let updates: any = {};
          
          // Handle win/loss changes
          if (oldResult === "win" && (newResult === "lose" || newResult === "returned")) {
            // Reverting a win
            updates.wonBets = existingStats[0].wonBets - 1;
            updates.totalUnitsWon = (parseFloat(existingStats[0].totalUnitsWon) - parseFloat(bet.unitsInvested || "0")).toString();
            updates.totalDollarsWon = (parseFloat(existingStats[0].totalDollarsWon || "0") - parseFloat(bet.dollarsInvested || "0")).toString();
          } else if ((oldResult === "lose" || oldResult === "returned" || oldResult === "pending") && newResult === "win") {
            // New win
            updates.wonBets = existingStats[0].wonBets + 1;
            updates.totalUnitsWon = (parseFloat(existingStats[0].totalUnitsWon) + parseFloat(bet.unitsInvested || "0")).toString();
            updates.totalDollarsWon = (parseFloat(existingStats[0].totalDollarsWon || "0") + parseFloat(bet.dollarsInvested || "0")).toString();
          }

          if (Object.keys(updates).length > 0) {
            await db
              .update(userStats)
              .set(updates)
              .where(eq(userStats.userId, bet.userId));
          }
        }
      } catch (statsError) {
        console.error("Error updating user stats:", statsError);
      }
    }

    return Response.json({ bet: updated[0] });
  } catch (error) {
    console.error("Error updating bet:", error);
    return Response.json({ error: "Failed to update bet" }, { status: 500 });
  }
}

/**
 * DELETE /api/bets/[id] - Delete a bet
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await verifyUserToken(req.headers);
    const { id } = await params;

    // Check if bet exists and user owns it
    const existingBet = await db
      .select()
      .from(bets)
      .where(eq(bets.id, id))
      .limit(1);

    if (existingBet.length === 0) {
      return Response.json({ error: "Bet not found" }, { status: 404 });
    }

    const bet = existingBet[0];

    // Only allow deletion if user owns the bet
    if (bet.userId !== userId) {
      return Response.json(
        { error: "Unauthorized to delete this bet" },
        { status: 403 }
      );
    }

    await db.delete(bets).where(eq(bets.id, id));

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting bet:", error);
    return Response.json({ error: "Failed to delete bet" }, { status: 500 });
  }
}

