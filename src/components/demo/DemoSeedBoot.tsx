"use client";

import { useEffect } from "react";
import { ensureDemoSeed } from "@/lib/demo/ensureSeed";

/** Renders nothing. Its only job is to call `src/lib/demo/ensureSeed.ts`'s `ensureDemoSeed` once, on mount. */
export function DemoSeedBoot(): null {
  useEffect(() => {
    void ensureDemoSeed();
  }, []);
  return null;
}
