import { NextRequest, NextResponse } from 'next/server'
import { verifyUserToken } from '@whop/api'
import { whop } from '~/lib/whop'
import { env } from '~/env'

/**
 * POST /api/ad-banners/verify-payment - Verify if checkout payment was completed
 */
export async function POST(req: NextRequest) {
	try {
		const { userId } = await verifyUserToken(req.headers)
		if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

		const body = await req.json()
		const { checkoutId } = body

		if (!checkoutId) {
			return NextResponse.json({ error: 'Checkout ID is required' }, { status: 400 })
		}

		// For now, we'll verify if the user has a successful receipt
		// This is a simplified check - in production you'd want to verify the specific checkout session
		const receipts = await whop.payments.listReceiptsForCompany({
			companyId: env.NEXT_PUBLIC_WHOP_COMPANY_ID,
			filter: {
				accessPassIds: [
					env.AD_BANNER_1_MINUTE_PLAN_ID,
					env.AD_BANNER_1_DAY_PLAN_ID,
					env.AD_BANNER_1_WEEK_PLAN_ID,
					env.AD_BANNER_1_MONTH_PLAN_ID,
				],
				statuses: ['succeeded'],
			},
		})

		// Check if user has a recent successful receipt
		const userReceipts = receipts?.receipts?.nodes?.filter(
			(r) => r?.member?.user?.id === userId,
		)

		// Check if there's a recent successful receipt (within last 5 minutes)
		const recentReceipt = userReceipts?.find((receipt) => {
			if (!receipt || !receipt.createdAt) return false
			const receiptTime = new Date(receipt.createdAt)
			const now = new Date()
			const diffInMinutes = (now.getTime() - receiptTime.getTime()) / (1000 * 60)
			return diffInMinutes < 5 // Within last 5 minutes
		})

		return NextResponse.json({ paid: !!recentReceipt })
	} catch (error) {
		console.error('Error verifying payment:', error)
		// Return false on error - better to not show banner than show unpaid banner
		return NextResponse.json({ paid: false })
	}
}

