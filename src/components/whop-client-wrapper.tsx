'use client'

import { Providers } from '~/app/providers'
import { WhopProvider } from '~/lib/whop-context'
import { OnboardingWrapper } from './onboarding-wrapper'

export function WhopClientWrapper({
	children,
	experienceId,
}: {
	children: React.ReactNode
	experienceId: string
}) {
	return (
		<Providers>
			<WhopProvider experienceId={experienceId}>
				<OnboardingWrapper>{children}</OnboardingWrapper>
			</WhopProvider>
		</Providers>
	)
}
