'use client'

import { Providers } from '~/app/providers'
import { WhopProvider } from '~/lib/whop-context'

export function WhopClientWrapper({
	children,
	experienceId,
}: {
	children: React.ReactNode
	experienceId: string
}) {
	return (
		<Providers>
			<WhopProvider experienceId={experienceId}>{children}</WhopProvider>
		</Providers>
	)
}
