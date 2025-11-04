import {
	type CheckIfUserHasAccessToExperienceQuery,
	type GetExperienceQuery,
	type GetUserQuery,
	WhopServerSdk,
} from '@whop/api'
import { env } from '~/env'
import { db } from '~/db'
import { sellerPermissions } from '~/db/schema'
import { eq } from 'drizzle-orm'

// Type exports from Whop API queries
export type WhopExperience = GetExperienceQuery['experience']
export type WhopUser = GetUserQuery['publicUser']
export type WhopAccess = CheckIfUserHasAccessToExperienceQuery['hasAccessToExperience']

// Initialize WhopServerSdk with app configuration
export const whop = WhopServerSdk({
	appId: env.NEXT_PUBLIC_WHOP_APP_ID,
	appApiKey: env.WHOP_API_KEY,
	onBehalfOfUserId: env.NEXT_PUBLIC_WHOP_AGENT_USER_ID,
	companyId: env.NEXT_PUBLIC_WHOP_COMPANY_ID,
})

// Helper: create SDK instance for seller's company
// This allows the app to act on behalf of the seller's company, assuming:
// 1. The app is installed on that company
// 2. The company granted the required permissions (e.g., access_pass:create)
export function createSellerWhopSdk(companyId: string) {
	return WhopServerSdk({
		appId: env.NEXT_PUBLIC_WHOP_APP_ID,
		appApiKey: env.WHOP_API_KEY,
		onBehalfOfUserId: env.NEXT_PUBLIC_WHOP_AGENT_USER_ID,
		companyId: companyId, // Seller's company ID
	})
}

// Helper: verify if app is installed on a company with required permissions
export async function verifyAppInstallation(companyId: string): Promise<{
	isInstalled: boolean
	hasCreatePermission: boolean
	error?: string
}> {
	try {
		// Try to list experiences for this app on the target company
		// This will fail if the app is not installed
		const experiences = await whop.experiences.listExperiences({
			companyId,
		})

		// Check if any experience belongs to our app
		const appExperiences = experiences?.experiences?.nodes?.filter(
			(exp: any) => exp?.app?.id === env.NEXT_PUBLIC_WHOP_APP_ID
		) ?? []

		const isInstalled = appExperiences.length > 0

		// We can't directly check permissions via API, but we can infer from whether
		// the app is installed. If not installed, definitely no permissions.
		return {
			isInstalled,
			hasCreatePermission: isInstalled, // Assume if installed, permissions were granted
		}
	} catch (error: any) {
		console.error('[verifyAppInstallation] Error checking installation:', {
			companyId,
			error: error?.message || String(error),
		})
		return {
			isInstalled: false,
			hasCreatePermission: false,
			error: error?.message || String(error),
		}
	}
}

// Helper: get or store seller's company ID from experience
export async function getOrStoreSellerCompanyId(userId: string, experienceId: string): Promise<string | null> {
	try {
		// Check if we already have it stored
		const existing = await db
			.select()
			.from(sellerPermissions)
			.where(eq(sellerPermissions.userId, userId))
			.limit(1)

		if (existing[0]) {
			return existing[0].whopCompanyId
		}

		// Fetch from experience
		const exp = await whop.experiences.getExperience({ experienceId })
		const companyId = exp?.company?.id

		if (!companyId) {
			return null
		}

		// Store it
		await db
			.insert(sellerPermissions)
			.values({
				userId,
				whopCompanyId: companyId,
			})
			.onConflictDoUpdate({
				target: sellerPermissions.userId,
				set: {
					whopCompanyId: companyId,
					updatedAt: new Date(),
				},
			})

		return companyId
	} catch (error) {
		console.error('[getOrStoreSellerCompanyId] error', error)
		return null
	}
}

// Note: For authentication in API routes, import verifyUserToken separately:
// import { verifyUserToken } from '@whop/api'
// const { userId } = await verifyUserToken(req.headers)

// This is for the new @whop/sdk package
// For the time being it has some missing features and is not recommended to use
// Oct 21, 2025
// import Whop from '@whop/sdk'
// export const whopClient = new Whop({
// 	appID: env.WHOP_API_KEY,
// 	apiKey: env.WHOP_API_KEY,
// })

// Helper: check if a user has access to ANY of the provided product (access pass) IDs
export async function userHasAccessToAnyProducts(params: {
  userId: string
  productIds: string[]
  companyId?: string
}): Promise<boolean> {
  const { userId, productIds, companyId } = params
  if (!userId) return true // fail-open
  if (!productIds || productIds.length === 0) return true

  try {
    const effectiveCompanyId = companyId || env.NEXT_PUBLIC_WHOP_COMPANY_ID
    
    // Check memberships directly - this is the most reliable way to check current access
    const members = await whop.companies.listMembers({
      companyId: effectiveCompanyId,
      filters: {
        accessPassIds: productIds,
      },
    }) as any

    const nodes = members?.members?.nodes ?? []
    console.log('[access-check] total members with products', nodes.length, 'products', productIds)
    const userIsMember = nodes.some((m: any) => m?.user?.id === userId)
    console.log('[access-check] user membership', { userIsMember, userId, productIds })
    
    return userIsMember
  } catch (err) {
    console.error('userHasAccessToAnyProducts error', err)
    return true // fail-open to avoid false blocks
  }
}
