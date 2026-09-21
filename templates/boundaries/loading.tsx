// Shown while a route segment streams in. Keep it cheap: no data fetching,
// no client hooks. Mirror the real layout so the page does not jump.
export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-4 p-6" role="status" aria-label="Loading">
      <div className="h-8 w-48 animate-pulse rounded-md bg-muted motion-reduce:animate-none" />
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="h-24 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
        <div className="h-24 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
        <div className="h-24 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      </div>
      <div className="h-64 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />
      <span className="sr-only">Loading…</span>
    </div>
  );
}
