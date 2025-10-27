import { NextRequest } from "next/server";
import { db } from "~/db";
import { upcomingBets, bets } from "~/db/schema";
import { verifyUserToken } from "@whop/api";
import { whop } from "~/lib/whop";
import { eq } from "drizzle-orm";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await verifyUserToken(req.headers);
    const { id } = await params;
    const body = await req.json();
    const { experienceId, ...betData } = body;

    if (!experienceId) {
      return Response.json({ error: "Experience ID is required" }, { status: 400 });
    }

    // Check if user is admin
    const access = await whop.access.checkIfUserHasAccessToExperience({ 
      experienceId, 
      userId 
    });

    if (access.accessLevel !== "admin") {
      return Response.json(
        { error: "Only admins can convert bets" },
        { status: 403 }
      );
    }

    // Get the upcoming bet
    const upcomingBet = await db
      .select()
      .from(upcomingBets)
      .where(eq(upcomingBets.id, id))
      .limit(1);

    if (upcomingBet.length === 0) {
      return Response.json({ error: "Upcoming bet not found" }, { status: 404 });
    }

    const bet = upcomingBet[0];

    const { result, unitsInvested, dollarsInvested } = betData;

    // Create the community bet
    const newBet = await db
      .insert(bets)
      .values({
        experienceId: bet.experienceId,
        userId, // Will be used as the userId
        sport: bet.sport,
        game: bet.game,
        outcome: bet.outcome,
        betCategory: bet.betCategory,
        oddFormat: bet.oddFormat,
        oddValue: bet.oddValue,
        unitsInvested: unitsInvested?.toString(),
        dollarsInvested: dollarsInvested?.toString(),
        result: result || "pending",
        isCommunityBet: true,
        createdById: userId,
        createdAt: new Date(bet.eventDate),
      })
      .returning();

    // Delete the upcoming bet
    await db.delete(upcomingBets).where(eq(upcomingBets.id, id));

    return Response.json({ bet: newBet[0] });
  } catch (error) {
    console.error("Error converting bet:", error);
    return Response.json({ error: "Failed to convert bet" }, { status: 500 });
  }
}

