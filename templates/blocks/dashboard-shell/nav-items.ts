import { ChartColumnIcon, FolderIcon, LayoutDashboardIcon, SettingsIcon, UsersIcon, type LucideIcon } from "lucide-react"

export type NavItem = { title: string; href: string; icon: LucideIcon }

// One list drives the sidebar links and the header title.
export const NAV_MAIN: NavItem[] = [
  { title: "Overview", href: "/dashboard", icon: LayoutDashboardIcon },
  { title: "Projects", href: "/dashboard/projects", icon: FolderIcon },
  { title: "Analytics", href: "/dashboard/analytics", icon: ChartColumnIcon },
  { title: "Team", href: "/dashboard/team", icon: UsersIcon },
]

export const NAV_SECONDARY: NavItem[] = [{ title: "Settings", href: "/dashboard/settings", icon: SettingsIcon }]

export function findNavItem(pathname: string) {
  const items = [...NAV_MAIN, ...NAV_SECONDARY]
  // Longest match wins, so /dashboard/projects/42 resolves to "Projects", not "Overview".
  return items
    .filter((item) => pathname === item.href || pathname.startsWith(`${item.href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]
}
