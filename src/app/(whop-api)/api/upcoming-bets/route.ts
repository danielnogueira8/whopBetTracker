import { NextRequest } from "next/server";
import { db } from "~/db";
import { upcomingBets, experienceSettings } from "~/db/schema";
import { verifyUserToken } from "@whop/api";
import { whop } from "~/lib/whop";
import { eq } from "drizzle-orm";
import { formatUpcomingBetForForum } from "~/lib/forum-post-utils";
import { env } from "~/env";

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
      confidenceLevel,
      unitsToInvest,
      eventDate,
      shouldPostToForum,
    } = betData;

    // Validation
    if (!sport || !game || !outcome || !oddFormat || !oddValue || !eventDate) {
      return Response.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    // Check forum integration settings
    const settings = await db
      .select()
      .from(experienceSettings)
      .where(eq(experienceSettings.experienceId, experienceId))
      .limit(1);

    const shouldPost = shouldPostToForum || (settings[0]?.autoPostEnabled && settings[0]?.forumId);
    const forumId = settings[0]?.forumId;

    // Create the bet
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
        confidenceLevel: confidenceLevel || 5,
        unitsToInvest: unitsToInvest?.toString() || null,
        eventDate: new Date(eventDate),
        createdById: userId,
      })
      .returning();

    // Post to forum if enabled
    let forumPostId = null;
    if (shouldPost && forumId) {
      try {
        const postContent = formatUpcomingBetForForum(newBet[0]);
        
        // Use direct API call since whop.forumPosts is not available in the SDK
        const response = await fetch(`https://api.whop.com/api/v1/forum_posts`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.WHOP_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            experience_id: forumId,
            content: postContent,
          }),
        });

        if (response.ok) {
          const forumPost = await response.json();
          forumPostId = forumPost.id;

          // Update the bet with forum post ID
          await db
            .update(upcomingBets)
            .set({ forumPostId })
            .where(eq(upcomingBets.id, newBet[0].id));
        } else {
          console.error("Forum API error:", await response.text());
        }
      } catch (error) {
        console.error("Error posting to forum:", error);
        // Continue even if forum posting fails
      }
    }

    // Return bet with forum post ID if it was created
    return Response.json({ bet: { ...newBet[0], forumPostId } });
  } catch (error) {
    console.error("Error creating upcoming bet:", error);
    return Response.json({ error: "Failed to create upcoming bet" }, { status: 500 });
  }
}

