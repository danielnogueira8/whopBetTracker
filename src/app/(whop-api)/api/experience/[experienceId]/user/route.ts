import { verifyUserToken } from '@whop/api'
import { NextRequest, NextResponse } from 'next/server'
import { type WhopAccess, type WhopUser, whop } from '~/lib/whop'

export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ experienceId: string }> },
) {
	const { experienceId } = await params
	if (!experienceId) return NextResponse.json({ error: 'Missing params' }, { status: 400 })

	const { userId } = await verifyUserToken(req.headers)
	if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

	try {
		const [user, access] = await Promise.all([
			whop.users.getUser({ userId }),
			whop.access.checkIfUserHasAccessToExperience({ experienceId, userId }),
		])
		return NextResponse.json<{
			user: WhopUser
			access: WhopAccess
		}>({ user, access })
	} catch (error) {
		console.error('Failed to fetch user:', error)
		const errorMessage = error instanceof Error ? error.message : 'Unknown error'
		return NextResponse.json({ 
			error: 'Failed to fetch user', 
			details: errorMessage 
		}, { status: 500 })
	}
}
