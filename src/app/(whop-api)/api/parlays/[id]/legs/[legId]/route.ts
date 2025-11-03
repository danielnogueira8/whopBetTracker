import { NextRequest } from "next/server";
import { db } from "~/db";
import { parlayLegs, parlays } from "~/db/schema";
import { eq, and } from "drizzle-orm";
import { verifyUserToken } from "@whop/api";
import { whop } from "~/lib/whop";
import { calculateParlayResult } from "~/lib/parlay-utils";
import { updateUserStatsForResultChange } from "~/lib/user-stats-utils";

// PATCH - Update individual parlay leg result
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; legId: string }> }
) {
  try {
    const { userId } = await verifyUserToken(req.headers);
    const { id, legId } = await params;
    const body = await req.json();

    // Fetch existing leg to get old result
    const existingLeg = await db
      .select()
      .from(parlayLegs)
      .where(and(eq(parlayLegs.id, legId), eq(parlayLegs.parlayId, id)))
      .limit(1);

    if (existingLeg.length === 0) {
      return Response.json({ error: "Leg not found" }, { status: 404 });
    }

    // Fetch parlay to check permissions and get investment info
    const parlayResult = await db
      .select()
      .from(parlays)
      .where(eq(parlays.id, id))
      .limit(1);

    if (parlayResult.length === 0) {
      return Response.json({ error: "Parlay not found" }, { status: 404 });
    }

    const parlay = parlayResult[0];

    // Check permissions
    if (parlay.isCommunityBet || parlay.isUpcomingBet) {
      const access = await whop.access.checkIfUserHasAccessToExperience({
        experienceId: parlay.experienceId,
        userId,
      });
      if (access.accessLevel !== "admin") {
        return Response.json(
          { error: "Only admins can update community or upcoming parlay legs" },
          { status: 403 }
        );
      }
    } else if (parlay.userId !== userId) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    // Coerce when league/sport provided
    let updateData: any = { ...body, updatedAt: new Date() };
    try {
      const { normalizeSportKey } = await import("~/lib/sport-normalization");
      if (typeof updateData.league === "string" && updateData.league.trim()) {
        const n = normalizeSportKey(updateData.league);
        if (n?.league) {
          updateData.sport = n.label;
          updateData.league = n.league;
        }
      } else if (typeof updateData.sport === "string" && updateData.sport.trim()) {
        const n = normalizeSportKey(updateData.sport);
        if (n) {
          updateData.sport = n.label;
          if (n.league) updateData.league = n.league;
        }
      }
    } catch {}

    const oldResult = existingLeg[0].result;
    const newResult = updateData.result;

    // Update leg
    const updated = await db
      .update(parlayLegs)
      .set(updateData)
      .where(and(eq(parlayLegs.id, legId), eq(parlayLegs.parlayId, id)))
      .returning();

    // Update user stats if result changed and parlay has investment
    if (parlay.userId && (parlay.unitsInvested || parlay.dollarsInvested)) {
      await updateUserStatsForResultChange(
        parlay.userId,
        oldResult,
        newResult || oldResult,
        true
      );
    }

    // Recalculate parlay result based on all legs
    const legs = await db
      .select()
      .from(parlayLegs)
      .where(eq(parlayLegs.parlayId, id))
      .orderBy(parlayLegs.legOrder);

    const legResults = legs.map((leg) => leg.result);
    const calculatedParlayResult = calculateParlayResult(legResults);

    await db.update(parlays).set({ result: calculatedParlayResult }).where(eq(parlays.id, id));

    return Response.json({ leg: updated[0] });
  } catch (error) {
    console.error("Error updating parlay leg:", error);
    return Response.json({ error: "Failed to update leg" }, { status: 500 });
  }
}

