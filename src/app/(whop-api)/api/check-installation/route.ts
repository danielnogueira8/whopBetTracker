import { NextRequest, NextResponse } from 'next/server'
import { verifyUserToken } from '@whop/api'
import { whop, verifyAppInstallation, getOrStoreSellerCompanyId } from '~/lib/whop'
import { env } from '~/env'

/**
 * Check if the app is installed on a seller's company with required permissions
 * This is a diagnostic endpoint to help sellers troubleshoot permission issues
 */
export async function GET(req: NextRequest) {
	try {
		const { userId } = await verifyUserToken(req.headers)
		if (!userId) {
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
		}

		// Get experienceId from query params
		const { searchParams } = new URL(req.url)
		const experienceId = searchParams.get('experienceId')

		if (!experienceId) {
			return NextResponse.json({ error: 'experienceId is required' }, { status: 400 })
		}

		// Check if user is admin of the experience
		const access = await whop.access.checkIfUserHasAccessToExperience({
			experienceId,
			userId,
		})

		if (access?.accessLevel !== 'admin') {
			return NextResponse.json(
				{
					error: 'You must be an admin of this experience to check installation status',
					accessLevel: access?.accessLevel,
				},
				{ status: 403 }
			)
		}

		// Get the seller's company ID
		const sellerCompanyId = await getOrStoreSellerCompanyId(userId, experienceId)
		if (!sellerCompanyId) {
			return NextResponse.json(
				{ error: 'Could not determine your company ID' },
				{ status: 400 }
			)
		}

		// Verify app installation
		const installationStatus = await verifyAppInstallation(sellerCompanyId)

		return NextResponse.json({
			userId,
			experienceId,
			companyId: sellerCompanyId,
			appId: env.NEXT_PUBLIC_WHOP_APP_ID,
			installation: {
				isInstalled: installationStatus.isInstalled,
				hasCreatePermission: installationStatus.hasCreatePermission,
				error: installationStatus.error,
			},
			status: installationStatus.isInstalled ? 'ready' : 'not_installed',
			message: installationStatus.isInstalled
				? 'App is installed and ready to create bets/parlays for sale'
				: 'App is not installed on your company. Please install it from the Whop app store and grant the access_pass:create permission.',
			installUrl: `https://whop.com/apps/${env.NEXT_PUBLIC_WHOP_APP_ID}`,
		})
	} catch (error: any) {
		console.error('[check-installation] Error:', error)
		return NextResponse.json(
			{
				error: 'Failed to check installation status',
				details: error?.message || String(error),
			},
			{ status: 500 }
		)
	}
}

