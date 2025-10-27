import { WhopIframeSdkProvider } from '@whop/react'
import { SidebarProvider, SidebarInset } from '~/components/ui/sidebar'
import { AppSidebar } from '~/components/app-sidebar'
import { ThemeProvider } from '~/components/theme-provider'
import { WhopClientWrapper } from '~/components/whop-client-wrapper'

export const experimental_ppr = true

interface LayoutProps {
	children: React.ReactNode
	params: Promise<{ experienceId: string }>
}

export default async function ExperienceLayout({
	children,
	params,
}: LayoutProps) {
	const { experienceId } = await params

	return (
		<ThemeProvider attribute="class" defaultTheme="system" enableSystem>
			<WhopIframeSdkProvider>
				<WhopClientWrapper experienceId={experienceId}>
					<SidebarProvider>
						<AppSidebar experienceId={experienceId} />
						<SidebarInset>{children}</SidebarInset>
					</SidebarProvider>
				</WhopClientWrapper>
			</WhopIframeSdkProvider>
		</ThemeProvider>
	)
}
