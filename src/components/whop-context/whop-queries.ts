import { defaultShouldDehydrateQuery, QueryClient } from '@tanstack/react-query'
import { env } from '~/env'
import type { WhopAccess, WhopExperience, WhopUser } from '~/lib/whop'

export const serverQueryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 60 * 1000, // 1 minute
			retry: 1,
		},
		dehydrate: {
			shouldDehydrateQuery: (query) =>
				defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
		},
	},
})

export function getApiUrl(path: string): string {
	if (typeof window === 'undefined') {
		// Server-side: construct absolute URL for Node.js fetch
		// Try Vercel's automatic VERCEL_URL first (available in serverless functions)
		const baseUrl = process.env.VERCEL_URL 
			? `https://${process.env.VERCEL_URL}`
			: env.NEXT_PUBLIC_VERCEL_URL || 'http://localhost:3000'
		
		// Ensure protocol exists for NEXT_PUBLIC_VERCEL_URL fallback
		const fullBaseUrl = baseUrl.startsWith('http://') || baseUrl.startsWith('https://')
			? baseUrl
			: `https://${baseUrl}`
		return `${fullBaseUrl}${path}`
	}
	// Client-side: use relative path
	return path
}

export const whopExperienceQuery = (experienceId: string) => ({
	queryKey: ['experience', experienceId],
	queryFn: async () => {
		const response = await fetch(getApiUrl(`/api/experience/${experienceId}`))
		if (!response.ok) throw new Error('Failed to fetch whop experience')
		const result = (await response.json()) as WhopExperience
		return result
	},
})

export const whopUserQuery = (experienceId: string) => ({
	queryKey: ['user', experienceId],
	queryFn: async () => {
		const response = await fetch(getApiUrl(`/api/experience/${experienceId}/user`))
		if (!response.ok) throw new Error('Failed to fetch whop user')
		return response.json() as Promise<{ user: WhopUser; access: WhopAccess }>
	},
})

export const receiptsQuery = () => ({
	queryKey: ['receipts'],
	queryFn: async () => {
		const response = await fetch(getApiUrl('/api/receipts'))
		if (!response.ok) throw new Error('Failed to fetch receipts')
		return response.json() as Promise<{
			accessPasses: Array<{
				id: string
				type: 'one-time' | 'subscription'
				receipts: Array<{
					amountPaid: number
					paidAt: string
					subscriptionStatus?: string | null
					membershipId?: string | null
					member?: {
						id: string
					} | null
				}>
			}>
		}>
	},
})
