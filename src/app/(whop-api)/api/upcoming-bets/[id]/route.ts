import { NextRequest } from "next/server";
import { db } from "~/db";
import { upcomingBets, experienceSettings } from "~/db/schema";
import { verifyUserToken } from "@whop/api";
import { whop } from "~/lib/whop";
import { eq, and } from "drizzle-orm";
import { formatUpcomingBetForForum } from "~/lib/forum-post-utils";
import { env } from "~/env";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const { searchParams } = new URL(req.url);
    const experienceId = searchParams.get("experienceId");

    // Require experienceId
    if (!experienceId) {
      return Response.json({ error: "experienceId is required" }, { status: 400 });
    }

    const bet = await db
      .select()
      .from(upcomingBets)
      .where(and(eq(upcomingBets.id, id), eq(upcomingBets.experienceId, experienceId)))
      .limit(1);

    if (bet.length === 0) {
      return Response.json({ error: "Upcoming bet not found" }, { status: 404 });
    }

    return Response.json({ bet: bet[0] });
  } catch (error) {
    console.error("Error fetching upcoming bet:", error);
    return Response.json({ error: "Failed to fetch upcoming bet" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await verifyUserToken(req.headers);
    const { id } = await params;
    const body = await req.json();
    const { experienceId, ...updateData } = body;

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
        { error: "Only admins can update upcoming bets" },
        { status: 403 }
      );
    }

    // Check if bet exists
    const existingBet = await db
      .select()
      .from(upcomingBets)
      .where(eq(upcomingBets.id, id))
      .limit(1);

    if (existingBet.length === 0) {
      return Response.json({ error: "Upcoming bet not found" }, { status: 404 });
    }

    // Prepare update data
    const updateFields: any = {
      updatedAt: new Date(),
    };

    // Only update fields that are provided
    if (updateData.sport !== undefined) updateFields.sport = updateData.sport;
    if (updateData.game !== undefined) updateFields.game = updateData.game;
    if (updateData.outcome !== undefined) updateFields.outcome = updateData.outcome;
    if (updateData.betCategory !== undefined) updateFields.betCategory = updateData.betCategory;
    if (updateData.oddFormat !== undefined) updateFields.oddFormat = updateData.oddFormat;
    if (updateData.oddValue !== undefined) updateFields.oddValue = updateData.oddValue.toString();
    if (updateData.explanation !== undefined) updateFields.explanation = updateData.explanation;
    if (updateData.confidenceLevel !== undefined) updateFields.confidenceLevel = updateData.confidenceLevel;
    if (updateData.unitsToInvest !== undefined) updateFields.unitsToInvest = updateData.unitsToInvest?.toString() || null;
    if (updateData.eventDate !== undefined) updateFields.eventDate = new Date(updateData.eventDate);

    // Update bet
    const updated = await db
      .update(upcomingBets)
      .set(updateFields)
      .where(eq(upcomingBets.id, id))
      .returning();

    // Check if forum post should be updated
    const { shouldUpdateForumPost } = updateData;
    const bet = updated[0];
    const hasForumPost = bet.forumPostId;

    if (shouldUpdateForumPost && hasForumPost) {
      try {
        const postContent = formatUpcomingBetForForum(bet);
        
        // Use direct API call since whop.forumPosts is not available in the SDK
        const response = await fetch(`https://api.whop.com/api/v1/forum_posts/${bet.forumPostId}`, {
          method: 'PATCH',
          headers: {
            'Authorization': `Bearer ${env.WHOP_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            content: postContent,
          }),
        });

        if (!response.ok) {
          console.error("Forum API error:", await response.text());
        }
      } catch (error) {
        console.error("Error updating forum post:", error);
        // Continue even if forum update fails
      }
    }

    return Response.json({ bet: updated[0] });
  } catch (error) {
    console.error("Error updating upcoming bet:", error);
    return Response.json({ error: "Failed to update upcoming bet" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { userId } = await verifyUserToken(req.headers);
    const { id } = await params;
    
    const { searchParams } = new URL(req.url);
    const experienceId = searchParams.get("experienceId");
    
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
        { error: "Only admins can delete upcoming bets" },
        { status: 403 }
      );
    }

    // Check if bet exists
    const existingBet = await db
      .select()
      .from(upcomingBets)
      .where(eq(upcomingBets.id, id))
      .limit(1);

    if (existingBet.length === 0) {
      return Response.json({ error: "Upcoming bet not found" }, { status: 404 });
    }

    await db.delete(upcomingBets).where(eq(upcomingBets.id, id));

    return Response.json({ success: true });
  } catch (error) {
    console.error("Error deleting upcoming bet:", error);
    return Response.json({ error: "Failed to delete upcoming bet" }, { status: 500 });
  }
}

