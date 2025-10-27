import { NextRequest, NextResponse } from 'next/server'
import { verifyUserToken } from '@whop/api'
import { db } from '~/db'
import { adBanners } from '~/db/schema'
import { eq } from 'drizzle-orm'

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

		return NextResponse.json({ banner: newBanner[0], success: true })
	} catch (error) {
		console.error('Error confirming banner:', error)
		return NextResponse.json({ error: 'Failed to confirm banner' }, { status: 500 })
	}
}
