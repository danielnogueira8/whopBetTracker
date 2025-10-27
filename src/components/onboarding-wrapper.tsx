'use client'

import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useWhop } from '~/lib/whop-context'
import { AdminOnboardingDialog } from './admin-onboarding-dialog'

export function OnboardingWrapper({ children }: { children: React.ReactNode }) {
	const { access, user } = useWhop()
	const [showOnboarding, setShowOnboarding] = useState(false)

	const { data: userStatsData } = useQuery({
		queryKey: ['user-stats'],
		queryFn: async () => {
			const response = await fetch('/api/user-stats')
			if (!response.ok) throw new Error('Failed to fetch user stats')
			return response.json()
		},
		staleTime: 5 * 60 * 1000, // 5 minutes
	})

	useEffect(() => {
		const isAdmin = access?.accessLevel === 'admin'
		const hasCompletedOnboarding = userStatsData?.stats?.hasCompletedOnboarding ?? false

		if (isAdmin && !hasCompletedOnboarding && userStatsData && user) {
			setShowOnboarding(true)
		}
	}, [access, userStatsData, user])

	return (
		<>
			{children}
			<AdminOnboardingDialog open={showOnboarding} onOpenChange={setShowOnboarding} />
		</>
	)
}
