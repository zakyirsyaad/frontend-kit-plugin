"use client";

import dynamic from "next/dynamic";

// `ssr: false` is only allowed inside a Client Component in the App Router,
// so Server Components import this wrapper instead of the canvas directly.
// Three.js stays out of the initial JS bundle until the canvas mounts.
export const Systems3DCanvas = dynamic(() => import("./systems-3d-canvas"), {
  ssr: false,
  loading: () => <div className="size-full animate-pulse bg-card" />,
});
