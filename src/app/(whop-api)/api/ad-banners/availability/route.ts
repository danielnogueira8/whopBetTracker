import { NextRequest, NextResponse } from 'next/server'
import { db } from '~/db'
import { adBanners } from '~/db/schema'
import { and, eq, gte, lte } from 'drizzle-orm'

/**
 * GET /api/ad-banners/availability - Check if ad slot is available
 */
export async function GET(req: NextRequest) {
	try {
		const now = new Date()

		// First, mark expired banners as expired
		await db
			.update(adBanners)
			.set({ status: 'expired' })
			.where(
				and(
					eq(adBanners.status, 'active'),
					lte(adBanners.endTime, now),
				),
			)

		// Check for active banner
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
			.limit(1)

		if (activeBanner.length > 0) {
			const banner = activeBanner[0]
			return NextResponse.json({
				available: false,
				currentAd: banner,
				availableAt: banner.endTime,
			})
		}

		return NextResponse.json({
			available: true,
			currentAd: null,
			availableAt: null,
		})
	} catch (error) {
		console.error('Error checking availability:', error)
		return NextResponse.json({ error: 'Failed to check availability' }, { status: 500 })
	}
}
