import { NextRequest, NextResponse } from 'next/server'
import { verifyUserToken } from '@whop/api'
import { env } from '~/env'
import { whop } from '~/lib/whop'

/**
 * POST /api/ad-banners/checkout - Create Whop checkout session for ad purchase
 */
export async function POST(req: NextRequest) {
	try {
		const { userId } = await verifyUserToken(req.headers)
		if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

		const body = await req.json()
		const { duration } = body

		if (!duration) {
			return NextResponse.json({ error: 'Duration is required' }, { status: 400 })
		}

		// Map duration to plan ID
		const planIdMap: Record<string, string> = {
			'1_minute': env.AD_BANNER_1_MINUTE_PLAN_ID,
			'1_day': env.AD_BANNER_1_DAY_PLAN_ID,
			'1_week': env.AD_BANNER_1_WEEK_PLAN_ID,
			'1_month': env.AD_BANNER_1_MONTH_PLAN_ID,
		}

		const planId = planIdMap[duration]

		if (!planId) {
			return NextResponse.json({ error: 'Invalid duration' }, { status: 400 })
		}

		// Create unique metadata for tracking - this makes each purchase unique
		// even if user already purchased before
		const uniqueId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
		const metadata = {
			ad_purchase_id: uniqueId,
			duration,
			purchase_type: 'consumable',
			timestamp: new Date().toISOString(),
		}

		// Create checkout session with metadata
		// Note: Whop creates access pass membership on checkout, so users can only
		// purchase once per plan. To allow repurchases, you need separate products
		// for each ad purchase in your Whop dashboard, not just different plans.
		const checkoutSession = await whop.payments.createCheckoutSession({
			planId,
			metadata: metadata as any,
		})

		if (!checkoutSession) {
			return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
		}

		return NextResponse.json({
			planId,
			checkoutId: checkoutSession.id,
			duration,
			metadata,
		})
	} catch (error) {
		console.error('Failed to create checkout session:', error)
		return NextResponse.json({ error: 'Failed to create checkout session' }, { status: 500 })
	}
}
