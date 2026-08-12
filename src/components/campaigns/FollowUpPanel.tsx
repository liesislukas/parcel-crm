"use client";

import type { ReactElement } from "react";
import { useState } from "react";
import { CHANNELS, CHANNEL_LABEL, type Channel, type MessageState } from "@/lib/campaigns/model";
import { scheduleFollowUp, type Message } from "@/lib/campaigns/store";

const BUTTON_CLASS =
  "rounded-md border border-black/20 px-3 py-1.5 text-sm disabled:cursor-not-allowed disabled:opacity-45 dark:border-white/25";

/** The next channel in `CHANNELS` order, wrapping — a bounced email defaults to SMS. */
function nextChannel(channel: Channel): Channel {
  const index = CHANNELS.indexOf(channel);
  return CHANNELS[(index + 1) % CHANNELS.length];
}

function defaultNoteFor(parentState: MessageState): string {
  switch (parentState) {
    case "replied":
      return "Owner replied — send terms summary.";
    case "bounced":
      return "Bounced — retry on another channel.";
    case "opted_out":
      return "Opted out — do not contact again.";
    default:
      return "No response yet — follow up.";
  }
}

/**
 * The inline follow-up creation panel attached to every `MessageRow`. Enforces the
 * kit's suppression rule in the UI itself — an opted-out owner cannot be re-contacted
 * even from a follow-up form, not only at audience-selection time.
 */
export function FollowUpPanel({
  message,
  parentState,
}: {
  message: Message;
  parentState: MessageState;
}): ReactElement {
  const [open, setOpen] = useState(false);
  const [channel, setChannel] = useState<Channel>(
    parentState === "bounced" ? nextChannel(message.channel) : message.channel,
  );
  const [note, setNote] = useState(defaultNoteFor(parentState));
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);

  const suppressed = parentState === "opted_out";

  function handleCreate() {
    const result = scheduleFollowUp(message.id, channel, note);
    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setError(null);
    setCreated(true);
    setOpen(false);
  }

  return (
    <div>
      <button
        type="button"
        data-testid="open-follow-up"
        className={BUTTON_CLASS}
        onClick={() => setOpen((o) => !o)}
      >
        Schedule follow-up
      </button>
      {created && !open && <p>Follow-up created (simulated).</p>}
      {open && (
        <div data-testid="follow-up-panel" className="mt-2 flex flex-col gap-2 text-sm">
          <label className="flex flex-col gap-1">
            Channel
            <select
              data-testid="follow-up-channel"
              value={channel}
              onChange={(e) => setChannel(e.target.value as Channel)}
              className="rounded-md border border-black/20 px-2 py-1 dark:border-white/25"
            >
              {CHANNELS.map((c) => (
                <option key={c} value={c}>
                  {CHANNEL_LABEL[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            Note
            <input
              type="text"
              data-testid="follow-up-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="rounded-md border border-black/20 px-2 py-1 dark:border-white/25"
            />
          </label>
          <div className="flex flex-col gap-1">
            <button
              type="button"
              data-testid="create-follow-up"
              className={BUTTON_CLASS}
              disabled={suppressed}
              onClick={handleCreate}
            >
              Create follow-up
            </button>
            {suppressed && (
              <p className="text-xs text-black/60 dark:text-white/60">
                This owner opted out in the simulation — suppressed.
              </p>
            )}
          </div>
          {error !== null && (
            <p data-testid="follow-up-error" className="text-xs text-red-700 dark:text-red-400">
              {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
