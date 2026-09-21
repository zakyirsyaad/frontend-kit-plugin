
## GSAP in React
- Always `useGSAP(() => { ... }, { scope: containerRef })` from `@gsap/react` — it reverts tweens and ScrollTriggers on unmount.
- Register plugins once at module scope in a `"use client"` file: `gsap.registerPlugin(useGSAP, ScrollTrigger)`.
- Never call bare `gsap.to()` inside `useEffect`.
- **One scroll engine per page**: GSAP ScrollTrigger *or* CSS scroll-driven animation, never both on the same element tree.
