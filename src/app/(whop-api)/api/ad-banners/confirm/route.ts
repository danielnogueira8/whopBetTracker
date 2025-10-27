import { NextRequest, NextResponse } from 'next/server'
import { verifyUserToken } from '@whop/api'
import { db } from '~/db'
import { adBanners } from '~/db/schema'
import { eq } from 'drizzle-orm'
import { whop } from '~/lib/whop'
import { env } from '~/env'

/**
 * POST /api/ad-banners/confirm - Confirm payment and activate banner
 */
export async function POST(req: NextRequest) {
	try {
		const { userId } = await verifyUserToken(req.headers)
		if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

		const body = await req.json()
		const { imageUrl, linkUrl, title, duration, purchaseReceiptId } = body

		if (!imageUrl || !duration || !purchaseReceiptId) {
			return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
		}

		// Calculate start and end times
		const startTime = new Date()
		const endTime = new Date()

		switch (duration) {
			case '1_minute':
				endTime.setMinutes(endTime.getMinutes() + 1)
				break
			case '1_day':
				endTime.setDate(endTime.getDate() + 1)
				break
			case '1_week':
				endTime.setDate(endTime.getDate() + 7)
				break
			case '1_month':
				endTime.setMonth(endTime.getMonth() + 1)
				break
			default:
				return NextResponse.json({ error: 'Invalid duration' }, { status: 400 })
		}

		// Create banner with active status
		const newBanner = await db
			.insert(adBanners)
			.values({
				userId,
				imageUrl,
				linkUrl: linkUrl || null,
				title: title || null,
				duration,
				startTime,
				endTime,
				purchaseReceiptId,
				status: 'active',
			})
			.returning()

		// IMPORTANT: Revoke the temporary access pass membership that was automatically granted
		// This allows users to repurchase the same ad slot in the future
		try {
			// Map duration back to plan ID to revoke access
			const planIdMap: Record<string, string> = {
				'1_minute': env.AD_BANNER_1_MINUTE_PLAN_ID,
				'1_day': env.AD_BANNER_1_DAY_PLAN_ID,
				'1_week': env.AD_BANNER_1_WEEK_PLAN_ID,
				'1_month': env.AD_BANNER_1_MONTH_PLAN_ID,
			}
			const planId = planIdMap[duration]
			
			if (planId) {
				// Remove the user's membership to this plan so they can purchase again
				// This is necessary because Whop grants membership even for one-time purchases
				await whop.access.revokeAccessFromExperience({
					experienceId: env.NEXT_PUBLIC_WHOP_APP_ID,
					userId,
					planId,
				})
			}
		} catch (error) {
			// Log but don't fail - the banner was already created
			console.error('Failed to revoke temporary membership (non-critical):', error)
		}

		return NextResponse.json({ banner: newBanner[0], success: true })
	} catch (error) {
		console.error('Error confirming banner:', error)
		return NextResponse.json({ error: 'Failed to confirm banner' }, { status: 500 })
	}
}
