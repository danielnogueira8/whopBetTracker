import { NextRequest } from "next/server";
import { verifyUserToken } from "@whop/api";
import { whop } from "~/lib/whop";

/**
 * POST /api/check-admin - Check admin status for a list of user IDs
 */
export async function POST(req: NextRequest) {
  try {
    await verifyUserToken(req.headers);
    const body = await req.json();
    const { userIds, experienceId } = body;

    if (!userIds || !Array.isArray(userIds) || !experienceId) {
      return Response.json(
        { error: "Missing userIds or experienceId" },
        { status: 400 }
      );
    }

    const adminStatus: Record<string, boolean> = {};

    // Check admin status for each user
    for (const userId of userIds) {
      try {
        const access = await whop.access.checkIfUserHasAccessToExperience({
          experienceId,
          userId,
        });
        
        adminStatus[userId] = access.accessLevel === "admin";
      } catch (error) {
        console.error(`Error checking admin status for ${userId}:`, error);
        adminStatus[userId] = false;
      }
    }

    return Response.json({ adminStatus });
  } catch (error) {
    console.error("Error checking admin status:", error);
    return Response.json(
      { error: "Failed to check admin status" },
      { status: 500 }
    );
  }
}



