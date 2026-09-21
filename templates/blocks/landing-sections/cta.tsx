import Link from "next/link"

import { Button } from "@/components/ui/button"

export function Cta({
  title,
  description,
  action,
}: {
  title: string
  description?: string
  action: { label: string; href: string }
}) {
  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6">
      <div className="flex flex-col items-start gap-6 rounded-xl bg-primary p-8 text-primary-foreground sm:p-12 md:flex-row md:items-center md:justify-between">
        <div className="flex max-w-xl flex-col gap-2">
          <h2 className="font-heading text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{title}</h2>
          {description ? <p className="text-primary-foreground/80 text-pretty">{description}</p> : null}
        </div>
        <Button asChild size="lg" variant="secondary">
          <Link href={action.href}>{action.label}</Link>
        </Button>
      </div>
    </section>
  )
}
