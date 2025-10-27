import { dehydrate } from "@tanstack/react-query";
import { WhopIframeSdkProvider } from "@whop/react";
import { SidebarProvider, SidebarInset } from "~/components/ui/sidebar";
import { AppSidebar } from "~/components/app-sidebar";
import { ThemeProvider } from "~/components/theme-provider";
import { WhopProvider } from "~/components/whop-context";
import {
  serverQueryClient,
  whopExperienceQuery,
  whopUserQuery,
} from "~/components/whop-context/whop-queries";

export const experimental_ppr = true;

export default async function ExperienceLayout({
  children,
  params,
}: LayoutProps<"/experiences/[experienceId]">) {
  const { experienceId } = await params;

  serverQueryClient.prefetchQuery(whopExperienceQuery(experienceId));
  serverQueryClient.prefetchQuery(whopUserQuery(experienceId));

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <WhopIframeSdkProvider>
        <WhopProvider
          state={dehydrate(serverQueryClient)}
          experienceId={experienceId}
        >
          <SidebarProvider>
            <AppSidebar experienceId={experienceId} />
            <SidebarInset>
              {children}
            </SidebarInset>
          </SidebarProvider>
        </WhopProvider>
      </WhopIframeSdkProvider>
    </ThemeProvider>
  );
}
