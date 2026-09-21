import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

const STATS = [
  { label: "Active projects", value: "12", note: "3 added this month" },
  { label: "Deployments", value: "248", note: "Last 30 days" },
  { label: "Team members", value: "8", note: "2 pending invites" },
]

export default function DashboardPage() {
  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        {STATS.map((stat) => (
          <Card key={stat.label}>
            <CardHeader>
              <CardDescription>{stat.label}</CardDescription>
              <CardTitle className="font-heading text-3xl tabular-nums">{stat.value}</CardTitle>
              <CardDescription>{stat.note}</CardDescription>
            </CardHeader>
          </Card>
        ))}
      </div>
      <section
        aria-label="Main content"
        className="flex min-h-80 flex-1 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground"
      >
        Add a chart-card or data-table block here.
      </section>
    </>
  )
}
