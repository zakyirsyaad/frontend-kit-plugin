// Canary only: renders every block that has no route of its own, so the build compiles them
// and `next start` can load them. Copied to src/app/blocks-canary/page.tsx.
import { ChartCard } from "@/components/blocks/chart-card/chart-card"
import { DeploymentsTable, type Deployment } from "@/components/blocks/data-table/deployments-table"
import { ContactForm } from "@/components/blocks/form/contact-form"
import { LandingPage } from "@/components/blocks/landing-sections/landing-page"
import { StatePanel } from "@/components/blocks/state-panel/state-panel"

const deployments: Deployment[] = [
  { id: "1", project: "web", branch: "main", status: "live", updatedAt: new Date(Date.UTC(2026, 0, 2)) },
  { id: "2", project: "api", branch: "main", status: "warning", updatedAt: new Date(Date.UTC(2026, 0, 3)) },
  { id: "3", project: "docs", branch: "feat/x", status: "error", updatedAt: new Date(Date.UTC(2026, 0, 4)) },
]

async function send() {
  "use server"
}

export default function BlocksCanaryPage() {
  return (
    <div className="flex w-full flex-col gap-8 p-4">
      <ChartCard
        title="Visitors"
        data={[
          { month: "Jan", desktop: 10, mobile: 4 },
          { month: "Feb", desktop: 14, mobile: 9 },
        ]}
        xKey="month"
        series={[
          { key: "desktop", label: "Desktop" },
          { key: "mobile", label: "Mobile" },
        ]}
      />
      <DeploymentsTable data={deployments} />
      <StatePanel kind="empty" />
      <ContactForm onSubmit={send} />
      <LandingPage />
    </div>
  )
}
