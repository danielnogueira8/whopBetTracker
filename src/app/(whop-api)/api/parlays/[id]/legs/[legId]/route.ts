import { NextRequest } from "next/server";
import { db } from "~/db";
import { parlayLegs, parlays } from "~/db/schema";
import { eq, and } from "drizzle-orm";
import { verifyUserToken } from "@whop/api";
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

    const updated = await db
      .update(parlayLegs)
      .set(updateData)
      .where(and(eq(parlayLegs.id, legId), eq(parlayLegs.parlayId, id)))
      .returning();

    return Response.json({ leg: updated[0] });
  } catch (error) {
    console.error("Error updating parlay leg:", error);
    return Response.json({ error: "Failed to update leg" }, { status: 500 });
  }
}

