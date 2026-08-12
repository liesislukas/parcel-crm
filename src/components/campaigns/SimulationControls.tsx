"use client";

import type { ReactElement } from "react";
import { useSyncExternalStore } from "react";
import {
  advanceAll,
  getServerSnapshot,
  getSnapshot,
  resetAll,
  runToCompletion,
  subscribe,
} from "@/lib/campaigns/store";

const BUTTON_CLASS =
  "rounded-md border border-black/20 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/25";

/**
 * The advance/reset controls every campaigns surface reuses. `scope` is always `"all"`
 * today — a plain, per-browser simulation with no timer and no `setInterval` anywhere;
 * the clock only moves when a button is pressed.
 */
export function SimulationControls({ scope }: { scope: "all" }): ReactElement {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const disabled = state.campaigns.length === 0;
  const maxTick = state.campaigns.reduce((max, campaign) => Math.max(max, campaign.tick), 0);

  return (
    <div data-scope={scope} className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        data-testid="advance-simulation"
        className={BUTTON_CLASS}
        disabled={disabled}
        onClick={() => advanceAll(1)}
      >
        Advance simulation (+12 h)
      </button>
      <button
        type="button"
        data-testid="run-to-completion"
        className={BUTTON_CLASS}
        disabled={disabled}
        onClick={() => runToCompletion()}
      >
        Run simulation to completion
      </button>
      <button
        type="button"
        data-testid="reset-simulation"
        className={BUTTON_CLASS}
        disabled={disabled}
        onClick={() => resetAll()}
      >
        Reset simulation
      </button>
      <span data-testid="simulation-clock" className="text-xs text-black/60 dark:text-white/60">
        Simulated clock: T+{maxTick} ticks ({maxTick * 12} h)
      </span>
    </div>
  );
}
