import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"

export type Status = "live" | "warning" | "error"

// Full class names on purpose: Tailwind only generates CSS for classes written out in source.
const STATUS: Record<Status, { label: string; dot: string }> = {
  live: { label: "Live", dot: "bg-status-live" },
  warning: { label: "Degraded", dot: "bg-status-warning" },
  error: { label: "Failed", dot: "bg-status-error" },
}

export const STATUS_OPTIONS = (Object.keys(STATUS) as Status[]).map((value) => ({
  value,
  label: STATUS[value].label,
}))

/** Color is a signal, the label is the meaning — never render the dot without its text. */
export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  const { label: fallback, dot } = STATUS[status]
  return (
    <Badge variant="outline">
      <span aria-hidden className={cn("size-2 rounded-full", dot)} />
      {label ?? fallback}
    </Badge>
  )
}
