import { Skeleton } from "@/components/ui/skeleton"

// Shown inside the shell while a dashboard page streams in, so the sidebar never disappears.
export default function DashboardLoading() {
  return (
    <div role="status" aria-label="Loading" className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
      <Skeleton className="h-80" />
    </div>
  )
}
