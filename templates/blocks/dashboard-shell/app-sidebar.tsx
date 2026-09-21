"use client"

import { BoxIcon } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import type * as React from "react"

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

import { findNavItem, NAV_MAIN, NAV_SECONDARY, type NavItem } from "./nav-items"
import { NavUser, type NavUserProps } from "./nav-user"

function NavLinks({ items, activeHref }: { items: NavItem[]; activeHref?: string }) {
  return (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.href}>
          <SidebarMenuButton asChild isActive={item.href === activeHref} tooltip={item.title}>
            <Link href={item.href}>
              <item.icon aria-hidden />
              <span>{item.title}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}

export function AppSidebar({
  appName = "Acme",
  user,
  ...props
}: React.ComponentProps<typeof Sidebar> & { appName?: string; user: NavUserProps["user"] }) {
  const activeHref = findNavItem(usePathname())?.href

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild size="lg">
              <Link href="/dashboard">
                <span className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <BoxIcon aria-hidden className="size-4" />
                </span>
                <span className="font-heading font-semibold">{appName}</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Workspace</SidebarGroupLabel>
          <SidebarGroupContent>
            <NavLinks items={NAV_MAIN} activeHref={activeHref} />
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="mt-auto">
          <SidebarGroupContent>
            <NavLinks items={NAV_SECONDARY} activeHref={activeHref} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <NavUser user={user} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
