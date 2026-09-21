import type { LucideIcon } from "lucide-react"

import { cn } from "@/lib/utils"

export type BentoItem = {
  title: string
  description: string
  icon: LucideIcon
  /** "wide" takes two thirds of the row on desktop; pair it with a "narrow" item. */
  size?: "wide" | "narrow"
}

// Literal class names so Tailwind generates them.
const SPAN = { wide: "md:col-span-4", narrow: "md:col-span-2" } as const

export function Bento({ title, description, items }: { title: string; description?: string; items: BentoItem[] }) {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
      <div className="mb-10 flex max-w-2xl flex-col gap-3">
        <h2 className="font-heading text-3xl font-semibold tracking-tight text-balance">{title}</h2>
        {description ? <p className="text-muted-foreground text-pretty">{description}</p> : null}
      </div>
      <ul className="grid gap-4 md:grid-cols-6">
        {items.map((item) => (
          <li
            key={item.title}
            className={cn("flex flex-col gap-3 rounded-xl border bg-card p-6", SPAN[item.size ?? "narrow"])}
          >
            <item.icon aria-hidden className="size-5 text-primary" />
            <h3 className="font-heading font-medium">{item.title}</h3>
            <p className="text-sm text-muted-foreground text-pretty">{item.description}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
