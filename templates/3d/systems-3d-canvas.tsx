"use client";

import { Canvas } from "@react-three/fiber";
import { Float, MeshDistortMaterial, Sphere } from "@react-three/drei";
import { Suspense, useSyncExternalStore } from "react";

// WebGL materials cannot read Tailwind classes, so project palette tokens
// (--background/--foreground) are mirrored here as named constants
// (the one sanctioned exception to "no hex").
const SURFACE = "#18181B";
const HIGHLIGHT = "#D4D4D8";

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

function usePrefersReducedMotion() {
  return useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(REDUCED_MOTION);
      query.addEventListener("change", onChange);
      return () => query.removeEventListener("change", onChange);
    },
    () => window.matchMedia(REDUCED_MOTION).matches,
    () => true,
  );
}

function Scene({ animate }: { animate: boolean }) {
  return (
    <>
      <ambientLight intensity={0.5} />
      <directionalLight position={[2, 4, 2]} intensity={1.5} color={HIGHLIGHT} />
      <Float
        speed={animate ? 2 : 0}
        rotationIntensity={animate ? 1 : 0}
        floatIntensity={animate ? 1.5 : 0}
      >
        <Sphere args={[1, 64, 64]} scale={1.8}>
          <MeshDistortMaterial
            color={SURFACE}
            emissive={HIGHLIGHT}
            emissiveIntensity={0.2}
            roughness={0.2}
            metalness={0.8}
            distort={0.4}
            speed={animate ? 2 : 0}
          />
        </Sphere>
      </Float>
    </>
  );
}

// Do not import this module directly — use `Systems3DCanvas` from `./canvas-lazy`.
export default function Systems3DCanvasImpl() {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div className="pointer-events-none relative size-full" aria-hidden>
      <Canvas
        camera={{ position: [0, 0, 5], fov: 45 }}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        dpr={[1, 2]}
        frameloop={reducedMotion ? "demand" : "always"}
      >
        <Suspense fallback={null}>
          <Scene animate={!reducedMotion} />
        </Suspense>
      </Canvas>
    </div>
  );
}
