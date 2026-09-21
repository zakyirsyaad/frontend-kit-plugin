import Link from "next/link";

// Rendered for unmatched routes and for notFound() calls in this segment.
export default function NotFound() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-start gap-4 p-6">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h2 className="text-lg font-medium">Page not found</h2>
      <p className="text-sm text-muted-foreground">
        The page you asked for does not exist, or it moved.
      </p>
      <Link
        href="/"
        className="inline-flex h-9 items-center rounded-md border border-border px-4 text-sm font-medium transition-colors hover:bg-secondary"
      >
        Back to home
      </Link>
    </div>
  );
}
