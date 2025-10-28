"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { Users, Trophy, BarChart, TrendingUp, Gem, User, DollarSign, Settings, MessagesSquare } from "lucide-react"
import { useWhop } from "~/lib/whop-context"
import { ThemeToggle } from "~/components/theme-toggle"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  SidebarMenuSub,
  SidebarMenuSubItem,
  SidebarMenuSubButton,
} from "~/components/ui/sidebar"

interface AppSidebarProps {
  experienceId: string
}

export function AppSidebar({ experienceId }: AppSidebarProps) {
  const pathname = usePathname()
  const { experience, access, user } = useWhop()

  if (!experience) return null

  const companyName = `${experience.company.title} Bet Tracker`
  const userDisplay = (user?.username || user?.name || "My").replace(/^./, (c) => c.toUpperCase())
  const communityBetsUrl = `/experiences/${experienceId}/community-bets`
  const analyticsUrl = `/experiences/${experienceId}/analytics`
  const isAdmin = access?.accessLevel === "admin"

  // Don't render Forum Integration until access is loaded to avoid layout shift
  const showForumIntegration = access && isAdmin

  return (
    <Sidebar>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Bet Tracker</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === `/experiences/${experienceId}/upcoming-bets`}>
                  <Link href={`/experiences/${experienceId}/upcoming-bets` as any}>
                    <Gem />
                    <span>{experience.company.title} Picks</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === communityBetsUrl || pathname === analyticsUrl}>
                  <Link href={communityBetsUrl as any}>
                    <BarChart />
                    <span>{companyName}</span>
                  </Link>
                </SidebarMenuButton>
                <SidebarMenuSub>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={pathname === communityBetsUrl}>
                      <Link href={communityBetsUrl as any}>
                        <DollarSign />
                        <span>Bets</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={pathname === analyticsUrl}>
                      <Link href={analyticsUrl as any}>
                        <TrendingUp />
                        <span>Analytics</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                </SidebarMenuSub>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === `/experiences/${experienceId}/my-bets` || pathname === `/experiences/${experienceId}/my-bets/analytics`}>
                  <Link href={`/experiences/${experienceId}/my-bets` as any}>
                    <User />
                    <span>{userDisplay} Tracker</span>
                  </Link>
                </SidebarMenuButton>
                <SidebarMenuSub>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={pathname === `/experiences/${experienceId}/my-bets`}>
                      <Link href={`/experiences/${experienceId}/my-bets` as any}>
                        <DollarSign />
                        <span>Bets</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                  <SidebarMenuSubItem>
                    <SidebarMenuSubButton asChild isActive={pathname === `/experiences/${experienceId}/my-bets/analytics`}>
                      <Link href={`/experiences/${experienceId}/my-bets/analytics` as any}>
                        <TrendingUp />
                        <span>Analytics</span>
                      </Link>
                    </SidebarMenuSubButton>
                  </SidebarMenuSubItem>
                </SidebarMenuSub>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton asChild isActive={pathname === `/experiences/${experienceId}/leaderboard`}>
                  <Link href={`/experiences/${experienceId}/leaderboard` as any}>
                    <Trophy />
                    <span>Global Leaderboard</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {showForumIntegration && (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === `/experiences/${experienceId}/settings`}>
                    <Link href={`/experiences/${experienceId}/settings` as any}>
                      <MessagesSquare />
                      <span>Forum Integration</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="p-2">
        <ThemeToggle />
      </SidebarFooter>
    </Sidebar>
  )
}

