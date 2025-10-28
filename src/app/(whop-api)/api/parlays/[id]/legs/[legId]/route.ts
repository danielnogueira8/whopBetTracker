import { NextRequest } from "next/server";
import { db } from "~/db";
import { parlayLegs, parlays } from "~/db/schema";
import { eq } from "drizzle-orm";
import { verifyUserToken } from "~/lib/auth";
import { whop } from "~/lib/whop";
import { calculateParlayResult } from "~/lib/parlay-utils";

// PATCH - Update individual parlay leg result
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; legId: string }> }
) {
  try {
    const { userId } = await verifyUserToken(req.headers);
    const { id, legId } = await params;
    const body = await req.json();

    const { result } = body;

    if (!result || !["pending", "win", "lose", "returned"].includes(result)) {
      return Response.json({ error: "Invalid result value" }, { status: 400 });
    }

    // Fetch parlay to check permissions
    const [parlay] = await db.select().from(parlays).where(eq(parlays.id, id)).limit(1);

    if (!parlay) {
      return Response.json({ error: "Parlay not found" }, { status: 404 });
    }

    // Check permissions
    if (parlay.isCommunityBet || parlay.isUpcomingBet) {
      const access = await whop.access.checkIfUserHasAccessToExperience({
        experienceId: parlay.experienceId,
        userId,
      });
      if (access.accessLevel !== "admin") {
        return Response.json(
          { error: "Only admins can update community or upcoming parlays" },
          { status: 403 }
        );
      }
    } else if (parlay.userId !== userId) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    // Update the leg result
    await db
      .update(parlayLegs)
      .set({ result, updatedAt: new Date() })
      .where(eq(parlayLegs.id, legId));

    // Fetch all legs to recalculate parlay result
    const legs = await db
      .select()
      .from(parlayLegs)
      .where(eq(parlayLegs.parlayId, id))
      .orderBy(parlayLegs.legOrder);

    const legResults = legs.map((leg) => leg.result);
    const newResult = calculateParlayResult(legResults);

    // Update parlay result
    await db.update(parlays).set({ result: newResult }).where(eq(parlays.id, id));

    return Response.json({ success: true, legResult: result, parlayResult: newResult });
  } catch (error) {
    console.error("Error updating leg result:", error);
    return Response.json({ error: "Failed to update leg result" }, { status: 500 });
  }
}

