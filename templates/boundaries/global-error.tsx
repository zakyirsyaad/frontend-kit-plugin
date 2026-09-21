"use client";

// Last resort: replaces the root layout when it is the layout itself that
// failed, so it must render <html> and <body> on its own. Tokens are not
// available here if globals.css failed to load, so keep the markup minimal.
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-background text-foreground antialiased">
        <div className="mx-auto flex w-full max-w-lg flex-col items-start gap-4 p-6">
          <h2 className="text-lg font-medium">The app failed to load</h2>
          <p className="text-sm text-muted-foreground">
            A problem in the root layout stopped the page from rendering.
          </p>
          {error.digest ? (
            <p className="font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
          ) : null}
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
