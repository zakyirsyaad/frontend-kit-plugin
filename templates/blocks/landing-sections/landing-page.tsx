import { ActivityIcon, GaugeIcon, LockKeyholeIcon, PlugIcon } from "lucide-react"

import { Bento } from "./bento"
import { Cta } from "./cta"
import { Faq } from "./faq"
import { Hero } from "./hero"

// Example composition. Render it from app/page.tsx (or a marketing route) and replace the copy.
export function LandingPage() {
  return (
    <main className="flex flex-col">
      <Hero
        eyebrow="Release notes, automated"
        title="Know what shipped before your customers ask"
        description="Connect your repositories once. Every deploy turns into a readable changelog your support team can link to."
        primary={{ label: "Start free", href: "/signup" }}
        secondary={{ label: "See a sample changelog", href: "/changelog" }}
      />
      <Bento
        title="Built for teams that deploy daily"
        description="Everything runs from the pull requests you already write."
        items={[
          {
            title: "Grouped by customer impact",
            description: "Fixes, features and breaking changes are separated so the right people read the right part.",
            icon: ActivityIcon,
            size: "wide",
          },
          { title: "SSO and audit log", description: "SAML, SCIM and a full history of who published what.", icon: LockKeyholeIcon },
          { title: "Fast by default", description: "Static pages, served from the edge.", icon: GaugeIcon },
          {
            title: "Works with your stack",
            description: "GitHub, GitLab, Linear and Slack integrations, plus a webhook for everything else.",
            icon: PlugIcon,
            size: "wide",
          },
        ]}
      />
      <Faq
        items={[
          { question: "Do you store our source code?", answer: "No. We read pull request titles, labels and descriptions only." },
          { question: "Can we edit an entry before it goes out?", answer: "Yes. Drafts wait for approval unless you turn on auto-publish." },
          { question: "Is there a free plan?", answer: "Yes, for one repository and unlimited readers." },
        ]}
      />
      <Cta
        title="Publish your first changelog today"
        description="Setup takes about five minutes."
        action={{ label: "Create an account", href: "/signup" }}
      />
    </main>
  )
}
