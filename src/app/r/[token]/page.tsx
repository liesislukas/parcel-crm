"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { recordBrowserFact } from "@/lib/campaigns/store";

type ResolveState = { status: "resolving" } | { status: "refused"; reason: string };

/**
 * `/r/[token]` — the short-link redirect. The click fact is written synchronously to
 * `localStorage` (there is no network hop that could stall), so the redirect follows
 * immediately on success; on refusal (unknown token, bounced message, opted-out owner,
 * or not-yet-delivered) it renders the reason instead of redirecting.
 */
export default function Page({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const router = useRouter();
  const [state, setState] = useState<ResolveState>({ status: "resolving" });
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    // Deferred to a microtask so the "resolving" state above has a paint to render
    // before this effect's redirect or refusal lands — and so the store write (an
    // external system) resolves through a callback rather than synchronously inline.
    Promise.resolve().then(() => {
      const result = recordBrowserFact(token, "short_url.visited");
      if (result.ok) {
        router.replace(`/campaigns/offer/${token}`);
      } else {
        setState({ status: "refused", reason: result.reason });
      }
    });
  }, [token, router]);

  if (state.status === "refused") {
    return (
      <div className="flex flex-col gap-3">
        <p data-testid="short-link-refused">{state.reason}</p>
        <Link href="/campaigns">Back to Campaigns</Link>
      </div>
    );
  }

  return <p data-testid="short-link-resolving">Resolving simulated short link…</p>;
}
