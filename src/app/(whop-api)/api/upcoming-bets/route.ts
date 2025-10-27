import { NextRequest } from "next/server";
import { db } from "~/db";
import { upcomingBets } from "~/db/schema";
import { verifyUserToken } from "@whop/api";
import { whop } from "~/lib/whop";
import { eq } from "drizzle-orm";

export async function GET(req: NextRequest) {
  try {
    await verifyUserToken(req.headers);

    // Get query parameters
    const { searchParams } = new URL(req.url);
    const experienceId = searchParams.get("experienceId");

    // Require experienceId
    if (!experienceId) {
      return Response.json({ error: "experienceId is required" }, { status: 400 });
    }

    // Fetch upcoming bets for this experience only
    const bets = await db.select()
      .from(upcomingBets)
      .where(eq(upcomingBets.experienceId, experienceId))
      .orderBy(upcomingBets.eventDate);

    return Response.json({ bets });
  } catch (error) {
    console.error("Error fetching upcoming bets:", error);
    return Response.json({ error: "Failed to fetch upcoming bets" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId } = await verifyUserToken(req.headers);
    const body = await req.json();
    const { experienceId, ...betData } = body;

    // Get experience ID from request body
    if (!experienceId) {
      return Response.json({ error: "experienceId is required" }, { status: 400 });
    }

    // Check if user is admin
    const access = await whop.access.checkIfUserHasAccessToExperience({ 
      experienceId, 
      userId 
    });

    if (access.accessLevel !== "admin") {
      return Response.json(
        { error: "Only admins can create upcoming bets" },
        { status: 403 }
      );
    }

    const {
      sport,
      game,
      outcome,
      betCategory = "game_match",
      oddFormat,
      oddValue,
      explanation,
      eventDate,
    } = betData;

    // Validation
    if (!game || !outcome || !oddFormat || !oddValue || !eventDate) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const newBet = await db
      .insert(upcomingBets)
      .values({
        experienceId,
        sport,
        game,
        outcome,
        betCategory,
        oddFormat,
        oddValue: oddValue.toString(),
        explanation,
        eventDate: new Date(eventDate),
        createdById: userId,
      })
      .returning();

    return Response.json({ bet: newBet[0] });
  } catch (error) {
    console.error("Error creating upcoming bet:", error);
    return Response.json({ error: "Failed to create upcoming bet" }, { status: 500 });
  }
}

