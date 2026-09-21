import { ArrowRightIcon } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"

export function Hero({
  eyebrow,
  title,
  description,
  primary,
  secondary,
}: {
  eyebrow?: string
  title: string
  description: string
  primary: { label: string; href: string }
  secondary?: { label: string; href: string }
}) {
  return (
    <section className="mx-auto grid w-full max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[1.1fr_1fr]">
      <div className="flex flex-col items-start gap-6">
        {eyebrow ? <p className="text-sm font-medium text-primary">{eyebrow}</p> : null}
        <h1 className="font-heading text-4xl font-semibold tracking-tight text-balance sm:text-5xl">{title}</h1>
        <p className="max-w-prose text-lg text-pretty text-muted-foreground">{description}</p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href={primary.href}>
              {primary.label}
              <ArrowRightIcon aria-hidden />
            </Link>
          </Button>
          {secondary ? (
            <Button asChild size="lg" variant="outline">
              <Link href={secondary.href}>{secondary.label}</Link>
            </Button>
          ) : null}
        </div>
      </div>

      {/* Product frame: swap for a screenshot (next/image) of the real product. */}
      <div aria-hidden className="rounded-xl border bg-card p-3 shadow-sm">
        <div className="flex items-center gap-1.5 border-b pb-3">
          <span className="size-2.5 rounded-full bg-muted-foreground/30" />
          <span className="size-2.5 rounded-full bg-muted-foreground/30" />
          <span className="size-2.5 rounded-full bg-muted-foreground/30" />
        </div>
        <div className="grid grid-cols-[5rem_1fr] gap-3 pt-3">
          <div className="flex flex-col gap-2">
            <span className="h-2.5 rounded-full bg-muted" />
            <span className="h-2.5 w-3/4 rounded-full bg-muted" />
            <span className="h-2.5 w-2/3 rounded-full bg-muted" />
          </div>
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-3 gap-2">
              <span className="h-12 rounded-xl bg-muted" />
              <span className="h-12 rounded-xl bg-muted" />
              <span className="h-12 rounded-xl bg-primary/15" />
            </div>
            <span className="h-28 rounded-xl bg-muted" />
          </div>
        </div>
      </div>
    </section>
  )
}
