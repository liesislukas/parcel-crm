"use client";

import type { ReactElement } from "react";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
import {
  getServerSnapshot,
  getSnapshot,
  recordBrowserFact,
  subscribe,
} from "@/lib/campaigns/store";
import { SimulatedBadge, SimulationBanner } from "./SimulatedBadge";

const BUTTON_CLASS =
  "rounded-md border border-black/20 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/25";

type LoginState =
  { status: "idle" } | { status: "success" } | { status: "refused"; reason: string };

/**
 * The simulated owner-facing landing page reached via `/r/[token]`. This is what the
 * owner would see after clicking the short link — rendered inside the CRM for the demo,
 * not published anywhere.
 */
export function OfferLanding({ token }: { token: string }): ReactElement {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const message = state.messages.find((m) => m.shortUrlToken === token);
  const [loginState, setLoginState] = useState<LoginState>({ status: "idle" });

  if (!message) {
    return (
      <p data-testid="offer-missing">Unknown short link. Campaigns live in this browser only.</p>
    );
  }

  function handleLogin() {
    const result = recordBrowserFact(token, "portal.logged_in");
    if (result.ok) {
      setLoginState({ status: "success" });
    } else {
      setLoginState({ status: "refused", reason: result.reason });
    }
  }

  return (
    <article className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h1 className="flex flex-wrap items-center gap-2 text-xl font-semibold">
          Simulated owner landing page <SimulatedBadge />
        </h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          This is the page the owner would see after clicking the short link. It is rendered inside
          the CRM for the demo and is not published anywhere.
        </p>
      </header>

      <SimulationBanner />

      <div>
        <p className="font-medium">{message.ownerName}</p>
        <pre className="mt-2 whitespace-pre-wrap font-sans text-sm text-black/80 dark:text-white/80">
          {message.body}
        </pre>
      </div>

      {loginState.status === "success" ? (
        <p data-testid="portal-logged-in">
          Logged into the application (simulated) — recorded on this message&apos;s timeline.
        </p>
      ) : (
        <button
          type="button"
          data-testid="portal-login"
          className={BUTTON_CLASS}
          onClick={handleLogin}
        >
          Sign in to the owner portal (simulated)
        </button>
      )}
      {loginState.status === "refused" && (
        <p data-testid="portal-login-refused">{loginState.reason}</p>
      )}

      <Link data-testid="back-to-campaign" href={`/campaigns/${message.campaignId}`}>
        Back to the campaign
      </Link>
    </article>
  );
}
