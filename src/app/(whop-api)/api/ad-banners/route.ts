import { NextRequest, NextResponse } from 'next/server'
import { verifyUserToken } from '@whop/api'
import { db } from '~/db'
import { adBanners } from '~/db/schema'
import { and, eq, gte, lte, desc } from 'drizzle-orm'

/**
 * GET /api/ad-banners - Get currently active banner
 */
export async function GET(req: NextRequest) {
	try {
		const now = new Date()

		// Find active banner (status='active' and current time is within start/end range)
		const activeBanner = await db
			.select()
			.from(adBanners)
			.where(
				and(
					eq(adBanners.status, 'active'),
					lte(adBanners.startTime, now),
					gte(adBanners.endTime, now),
				),
			)
			.orderBy(desc(adBanners.createdAt))
			.limit(1)

		if (activeBanner.length === 0) {
			return NextResponse.json({ banner: null })
		}

		return NextResponse.json({ banner: activeBanner[0] })
	} catch (error) {
		console.error('Error fetching active banner:', error)
		return NextResponse.json({ error: 'Failed to fetch banner' }, { status: 500 })
	}
}

/**
 * POST /api/ad-banners - Create new banner (after payment confirmation)
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

		// Calculate start and end times based on duration
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

		// Create the banner with 'active' status
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

		return NextResponse.json({ banner: newBanner[0] })
	} catch (error) {
		console.error('Error creating banner:', error)
		return NextResponse.json({ error: 'Failed to create banner' }, { status: 500 })
	}
}
