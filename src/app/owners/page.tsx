import { Suspense } from "react";
import OwnersWorkspace from "@/components/owners/OwnersWorkspace";

export default function OwnersPage() {
  return (
    <article className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">Owner CRM records</h1>
      <Suspense
        fallback={
          <p className="mt-4 rounded-lg border border-black/10 p-4 text-sm dark:border-white/15">
            Loading owner records…
          </p>
        }
      >
        <OwnersWorkspace />
      </Suspense>
    </article>
  );
}
