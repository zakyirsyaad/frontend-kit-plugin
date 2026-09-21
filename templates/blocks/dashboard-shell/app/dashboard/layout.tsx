import { cookies } from "next/headers"
import type * as React from "react"

import { AppSidebar } from "@/components/blocks/dashboard-shell/app-sidebar"
import { SiteHeader } from "@/components/blocks/dashboard-shell/site-header"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { TooltipProvider } from "@/components/ui/tooltip"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  // The sidebar stores its open state in a cookie; reading it here avoids a flash on reload.
  const defaultOpen = (await cookies()).get("sidebar_state")?.value !== "false"

  // Collapsed-sidebar tooltips need a provider; shadcn's radix-nova sidebar does not add one itself.
  return (
    <TooltipProvider delayDuration={0}>
      <SidebarProvider defaultOpen={defaultOpen}>
        <AppSidebar user={{ name: "Ada Lovelace", email: "ada@example.com" }} />
        <SidebarInset>
          <SiteHeader />
          <div className="flex flex-1 flex-col gap-4 p-4 md:p-6">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
