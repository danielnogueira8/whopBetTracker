import { NextRequest, NextResponse } from 'next/server'
import { verifyUserToken } from '@whop/api'
import { db } from '~/db'
import { userStats } from '~/db/schema'
import { eq } from 'drizzle-orm'

/**
 * POST /api/user-stats/onboarding - Mark onboarding as complete
 */
export async function POST(req: NextRequest) {
	try {
		const { userId } = await verifyUserToken(req.headers)

		// Check if user stats exist
		const existing = await db
			.select()
			.from(userStats)
			.where(eq(userStats.userId, userId))
			.limit(1)

		if (existing.length > 0) {
			// Update existing record
			await db.update(userStats).set({ hasCompletedOnboarding: true }).where(eq(userStats.userId, userId))
		} else {
			// Create new record with onboarding completed
			await db
				.insert(userStats)
				.values({
					userId,
					username: 'Admin',
					totalBets: 0,
					wonBets: 0,
					totalUnitsInvested: '0',
					totalUnitsWon: '0',
					totalDollarsInvested: '0',
					totalDollarsWon: '0',
					hasCompletedOnboarding: true,
				})
		}

		return NextResponse.json({ success: true })
	} catch (error) {
		console.error('Error completing onboarding:', error)
		return NextResponse.json({ error: 'Failed to complete onboarding' }, { status: 500 })
	}
}
