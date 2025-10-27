import { NextRequest } from "next/server"
import { verifyUserToken } from "@whop/api"
import { whop } from "~/lib/whop"
import { env } from "~/env"

export async function GET(req: NextRequest) {
  try {
    const { userId } = await verifyUserToken(req.headers)
    const { searchParams } = new URL(req.url)
    const experienceId = searchParams.get("experienceId")

    if (!experienceId) {
      return Response.json({ error: "experienceId is required" }, { status: 400 })
    }

    // Check if user is admin
    const access = await whop.access.checkIfUserHasAccessToExperience({ 
      experienceId, 
      userId 
    })

    if (access.accessLevel !== "admin") {
      return Response.json(
        { error: "Only admins can view forums" },
        { status: 403 }
      )
    }

    // List all experiences for the company and filter for forums
    const forums = []
    try {
      // Get all experiences for the company
      // Use companyId parameter with the company ID from environment
      console.log("Fetching experiences for companyId:", env.NEXT_PUBLIC_WHOP_COMPANY_ID)
      const experiences = await whop.experiences.listExperiences({ 
        companyId: env.NEXT_PUBLIC_WHOP_COMPANY_ID 
      })

      console.log("Raw experiences response:", JSON.stringify(experiences, null, 2))

      // Handle different response structures
      let experienceList: any[] = []
      if (Array.isArray(experiences)) {
        experienceList = experiences
      } else if (experiences?.experiencesV2?.nodes && Array.isArray(experiences.experiencesV2.nodes)) {
        // Handle GraphQL-style response with experiencesV2.nodes
        experienceList = experiences.experiencesV2.nodes.filter((exp): exp is any => exp !== null)
      }

      console.log(`Found ${experienceList.length} total experiences`)

      // Filter for forum experiences
      for (const exp of experienceList) {
        // Log ALL fields on this experience for debugging
        console.log("Experience object fields:", Object.keys(exp))
        console.log("Full experience:", JSON.stringify(exp, null, 2))
        
        // Check if this is a forum experience by looking at app.name === "Forums"
        const isForum = exp.app?.name === "Forums"

        console.log(`Experience "${exp.name || exp.title || exp.id}" - isForum: ${isForum}`)
        
        if (isForum) {
          forums.push({
            id: exp.id,
            name: exp.name || exp.title || "Forum"
          })
        }
      }

      console.log(`Found ${forums.length} forum experiences`)
    } catch (error: any) {
      console.error("Error fetching forums from Whop API:", error)
      // Return empty array if Whop API fails
      return Response.json({ forums: [] })
    }

    return Response.json({ forums })
  } catch (error) {
    console.error("Error in forums endpoint:", error)
    return Response.json({ error: "Failed to fetch forums" }, { status: 500 })
  }
}

