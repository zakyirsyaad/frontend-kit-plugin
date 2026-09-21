# Registry item fixtures

Each `*.json` file has the shape of `shadcn@4 view <item>` output: an array with one registry item.

**Recorded:** `name`, `type`, `dependencies`, `registryDependencies`, `cssVars`, `css`, and each file's `path`, `type` and `target` were copied from `shadcn@4.21.0 view` on 2026-09-21.

**Not recorded:** file `content`. The original source belongs to Magic UI (MIT) and Aceternity UI (terms forbid redistribution), and this kit never stores third-party component code. Each `content` is a short stand-in written for these tests. It reproduces the patterns the original has, such as hex colors, palette classes, a missing `"use client"`, `motion/react` without reduced-motion handling, extra icon libraries, and animation classes without keyframes.

`fixture__unsafe.json` is synthetic. It exists to exercise the dangerous-pattern checks.

Refresh the recorded fields when shadcn or an item changes. Keep the stand-in content minimal.
