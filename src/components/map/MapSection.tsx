"use client";

import dynamic from "next/dynamic";

/**
 * The SSR boundary, and the only reason this file exists.
 *
 * MapLibre touches `window` at module scope, so `MapWorkspace` must never be
 * server-rendered. `ssr: false` is only legal inside a Client Component in Next 16, and
 * `src/app/page.tsx` is a Server Component — hence this thin client wrapper.
 */
const MapWorkspace = dynamic(() => import("./MapWorkspace"), {
  ssr: false,
  loading: () => (
    <div className="h-[70vh] rounded-lg border border-black/10 dark:border-white/15" />
  ),
});

export default function MapSection() {
  return <MapWorkspace />;
}
