"use client";

import type { ReactElement } from "react";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { CHANNELS, CHANNEL_LABEL, type Channel } from "@/lib/campaigns/model";
import { createCampaigns } from "@/lib/campaigns/store";
import type { Owner } from "@/lib/owners";
import { AudiencePicker } from "./AudiencePicker";
import { SimulationBanner } from "./SimulatedBadge";

const PRIMARY_BUTTON_CLASS =
  "rounded-md border border-black/20 bg-black/5 px-3 py-1.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/25 dark:bg-white/10";
const BUTTON_CLASS =
  "rounded-md border border-black/20 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/25";

type SkippedEntry = { ownerKey: string; ownerName: string; channel: Channel; reason: string };

/**
 * `/campaigns/new` — pick an owner set (or a saved project), then create all three
 * simulated campaigns in one action. The primary "create all three" button is the Demo
 * Script's first step and navigates straight to `/campaigns`; the three single-channel
 * buttons stay on this page so the returned `skipped` list (per the plan's step 5) has
 * somewhere to actually render before the user leaves.
 */
export function NewCampaignForm(): ReactElement {
  const router = useRouter();
  const [name, setName] = useState("Rock Island assemblage outreach");
  const [audience, setAudience] = useState<Owner[]>([]);
  const [project, setProject] = useState<{ id: string; name: string } | null>(null);
  const [skipped, setSkipped] = useState<SkippedEntry[]>([]);

  const handleAudienceChange = useCallback(
    (selected: Owner[], selectedProject: { id: string; name: string } | null) => {
      setAudience(selected);
      setProject(selectedProject);
    },
    [],
  );

  function runCreate(channels: Channel[], navigateAfter: boolean) {
    const result = createCampaigns({
      name,
      channels,
      audience,
      projectId: project?.id ?? null,
      projectName: project?.name ?? null,
      nowMs: Date.now(),
    });
    setSkipped(result.skipped);
    if (navigateAfter) {
      router.push("/campaigns");
    }
  }

  const disabled = audience.length === 0;

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-2">
        <span className="text-[11px] font-semibold tracking-widest text-black/45 uppercase dark:text-white/45">
          Acquisition workflow
        </span>
        <h1 className="text-2xl font-semibold tracking-tight">New campaign</h1>
      </header>

      <SimulationBanner />

      <label className="flex max-w-md flex-col gap-1 text-sm">
        Campaign name
        <input
          type="text"
          data-testid="campaign-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="rounded-md border border-black/20 px-2 py-1 dark:border-white/25"
        />
      </label>

      <AudiencePicker onChange={handleAudienceChange} />

      {skipped.length > 0 && (
        <ul
          data-testid="create-skipped"
          className="flex flex-col gap-1 text-xs text-black/60 dark:text-white/60"
        >
          {skipped.map((s, i) => (
            <li key={`${s.ownerKey}|${s.channel}|${i}`}>
              {s.ownerName} — {CHANNEL_LABEL[s.channel]}: {s.reason}
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          data-testid="create-all-channels"
          className={PRIMARY_BUTTON_CLASS}
          disabled={disabled}
          onClick={() => runCreate(CHANNELS, true)}
        >
          Create all three simulated campaigns
        </button>
        {CHANNELS.map((channel) => (
          <button
            key={channel}
            type="button"
            data-testid={`create-${channel}`}
            className={BUTTON_CLASS}
            disabled={disabled}
            onClick={() => runCreate([channel], false)}
          >
            Create {CHANNEL_LABEL[channel]} campaign only
          </button>
        ))}
      </div>
    </article>
  );
}
