"use client";

import { useEffect } from "react";

// Catches render and data errors inside this route segment. The layout above
// it stays mounted, so keep this focused on recovery, not navigation chrome.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Replace with your error reporter. The digest identifies the server-side
    // error; the message itself is not exposed to the browser in production.
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col items-start gap-4 p-6">
      <div className="flex items-center gap-2">
        <span aria-hidden className="inline-block size-2 shrink-0 rounded-full bg-status-error" />
        <h2 className="text-lg font-medium">Something went wrong</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        This section failed to load. You can try again; the rest of the app keeps working.
      </p>
      {error.digest ? (
        <p className="font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
      ) : null}
      <button
        type="button"
        onClick={reset}
        className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
      >
        Try again
      </button>
    </div>
  );
}
