import { CircleAlertIcon, InboxIcon, LoaderCircleIcon } from "lucide-react"
import type * as React from "react"

import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import { cn } from "@/lib/utils"

type StatePanelKind = "empty" | "loading" | "error"

const DEFAULTS: Record<StatePanelKind, { title: string; description: string }> = {
  empty: { title: "Nothing here yet", description: "Items you add will show up here." },
  loading: { title: "Loading", description: "Fetching the latest data." },
  error: { title: "Something went wrong", description: "The data could not be loaded. Try again." },
}

export function StatePanel({
  kind,
  title,
  description,
  action,
  className,
}: {
  kind: StatePanelKind
  title?: string
  description?: string
  /** A button or link, e.g. "Retry" for errors or "Create" for empty lists. */
  action?: React.ReactNode
  className?: string
}) {
  const copy = DEFAULTS[kind]

  return (
    <Empty
      role={kind === "error" ? "alert" : "status"}
      aria-busy={kind === "loading" || undefined}
      className={cn("border bg-card", className)}
    >
      <EmptyHeader>
        <EmptyMedia variant="icon" className={cn(kind === "error" && "bg-destructive/10 text-destructive")}>
          {kind === "empty" && <InboxIcon aria-hidden />}
          {kind === "loading" && <LoaderCircleIcon aria-hidden className="motion-safe:animate-spin" />}
          {kind === "error" && <CircleAlertIcon aria-hidden />}
        </EmptyMedia>
        <EmptyTitle>{title ?? copy.title}</EmptyTitle>
        <EmptyDescription>{description ?? copy.description}</EmptyDescription>
      </EmptyHeader>
      {action ? <EmptyContent>{action}</EmptyContent> : null}
    </Empty>
  )
}
