import { Suspense } from "react";
import { AcquisitionsWorkspace } from "@/components/crm/AcquisitionsWorkspace";

export const metadata = { title: "Acquisitions — Parcel CRM" };

export default function AcquisitionsPage() {
  return (
    <Suspense
      fallback={<p className="text-sm text-black/60 dark:text-white/60">Loading CRM data…</p>}
    >
      <AcquisitionsWorkspace />
    </Suspense>
  );
}
