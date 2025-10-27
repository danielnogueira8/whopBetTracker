import { NextRequest, NextResponse } from 'next/server'
import { WhopExperience, whop } from '~/lib/whop'

export async function GET(
	req: NextRequest,
	{ params }: { params: Promise<{ experienceId: string }> },
) {
	const { experienceId } = await params
	if (!experienceId)
		return NextResponse.json({ error: 'Missing params' }, { status: 400 })

	try {
		console.log('Fetching experience for:', experienceId)
		console.log('Whop config:', {
			appId: process.env.NEXT_PUBLIC_WHOP_APP_ID,
			hasApiKey: !!process.env.WHOP_API_KEY,
			agentUserId: process.env.NEXT_PUBLIC_WHOP_AGENT_USER_ID,
			companyId: process.env.NEXT_PUBLIC_WHOP_COMPANY_ID
		})
		
		const experience = await whop.experiences.getExperience({ experienceId })
		console.log('Successfully fetched experience')
		return NextResponse.json<WhopExperience>(experience)
	} catch (error) {
		console.error('Failed to fetch experience:', error)
		console.error('Error details:', JSON.stringify(error, null, 2))
		const errorMessage = error instanceof Error ? error.message : 'Unknown error'
		console.error('Error message:', errorMessage)
		return NextResponse.json({ 
			error: 'Failed to fetch experience', 
			details: errorMessage,
			experienceId 
		}, { status: 500 })
	}
}
