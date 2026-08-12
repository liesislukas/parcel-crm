"use client";

import { useCallback, useEffect, useState } from "react";
import {
  readAcquisition,
  writeAcquisition,
  resetAcquisition,
  type AcquisitionStore,
} from "@/lib/store";
import {
  INTEREST_LABEL,
  STAGE_LABEL,
  defaultRecord,
  entityKey,
  makeId,
  todayIso,
  type AcquisitionRecord,
  type AcquisitionStage,
  type EntityRef,
  type InterestLevel,
} from "@/lib/crm/acquisition";
import { memberName } from "@/lib/crm/team";

export type AcquisitionApi = {
  store: AcquisitionStore;
  hydrated: boolean;
  today: string; // "" until hydrated
  getRecord(entity: EntityRef): AcquisitionRecord; // stored record, else defaultRecord(entity, now)
  ensureRecord(entity: EntityRef): void;
  setStage(entity: EntityRef, stage: AcquisitionStage, actor: string): void;
  saveInterestAndPrice(
    entity: EntityRef,
    interest: InterestLevel,
    askingPriceUsd: number | null,
    actor: string,
  ): void;
  createTask(input: {
    entity: EntityRef;
    title: string;
    assigneeId: string;
    dueDate: string;
  }): void;
  completeTask(taskId: string): void;
  reopenTask(taskId: string): void;
  resetDemo(): void;
};

const EMPTY_STORE: AcquisitionStore = { version: 1, records: {}, tasks: [], events: [] };

export function useAcquisitionStore(): AcquisitionApi {
  const [store, setStore] = useState<AcquisitionStore>(EMPTY_STORE);
  const [hydrated, setHydrated] = useState(false);
  const [today, setToday] = useState("");

  useEffect(() => {
    // Wrapped in a named function, rather than calling setState directly in the effect
    // body, to match this repo's `react-hooks/set-state-in-effect` convention (see the
    // `load()` pattern in MapWorkspace.tsx). Behaviour is unchanged: a single, one-time
    // hydration read with an empty dependency array — re-running this would clobber
    // unsaved UI state.
    function hydrate() {
      const t = todayIso();
      setToday(t);
      setStore(readAcquisition(t));
      setHydrated(true);
    }
    hydrate();
  }, []);

  const commit = useCallback((next: AcquisitionStore) => {
    writeAcquisition(next);
    setStore(next);
  }, []);

  const getRecord = useCallback(
    (entity: EntityRef): AcquisitionRecord => {
      const key = entityKey(entity);
      return store.records[key] ?? defaultRecord(entity, "");
    },
    [store],
  );

  const ensureRecord = useCallback(
    (entity: EntityRef) => {
      const key = entityKey(entity);
      if (store.records[key]) return;
      const record = defaultRecord(entity, new Date().toISOString());
      commit({ ...store, records: { ...store.records, [key]: record } });
    },
    [store, commit],
  );

  const setStage = useCallback(
    (entity: EntityRef, stage: AcquisitionStage, actor: string) => {
      const key = entityKey(entity);
      const current = store.records[key] ?? defaultRecord(entity, new Date().toISOString());
      if (current.stage === stage) return; // no-op, writes nothing

      const now = new Date().toISOString();
      const nextRecord: AcquisitionRecord = { ...current, stage, updatedAt: now };
      const event = {
        id: makeId("evt"),
        entityKey: key,
        at: now,
        actor,
        kind: "stage-changed" as const,
        summary: `Stage changed from ${STAGE_LABEL[current.stage]} to ${STAGE_LABEL[stage]}.`,
        seeded: false,
      };
      commit({
        ...store,
        records: { ...store.records, [key]: nextRecord },
        events: [event, ...store.events],
      });
    },
    [store, commit],
  );

  const saveInterestAndPrice = useCallback(
    (entity: EntityRef, interest: InterestLevel, askingPriceUsd: number | null, actor: string) => {
      const key = entityKey(entity);
      const current = store.records[key] ?? defaultRecord(entity, new Date().toISOString());
      const now = new Date().toISOString();

      const nextEvents: (typeof store.events)[number][] = [];

      if (current.interest !== interest) {
        nextEvents.push({
          id: makeId("evt"),
          entityKey: key,
          at: now,
          actor,
          kind: "interest-changed",
          summary: `Interest changed from ${INTEREST_LABEL[current.interest]} to ${INTEREST_LABEL[interest]}.`,
          seeded: false,
        });
      }

      if (current.askingPriceUsd !== askingPriceUsd) {
        let summary: string;
        if (current.askingPriceUsd !== null && askingPriceUsd !== null) {
          summary = `Asking price changed from $${current.askingPriceUsd.toLocaleString("en-US")} to $${askingPriceUsd.toLocaleString("en-US")}.`;
        } else if (current.askingPriceUsd === null && askingPriceUsd !== null) {
          summary = `Asking price recorded: $${askingPriceUsd.toLocaleString("en-US")}.`;
        } else {
          summary = "Asking price cleared.";
        }
        nextEvents.push({
          id: makeId("evt"),
          entityKey: key,
          at: now,
          actor,
          kind: "asking-price-changed",
          summary,
          seeded: false,
        });
      }

      if (nextEvents.length === 0) return; // unchanged form writes no history

      const nextRecord: AcquisitionRecord = {
        ...current,
        interest,
        askingPriceUsd,
        updatedAt: now,
      };
      commit({
        ...store,
        records: { ...store.records, [key]: nextRecord },
        events: [...nextEvents.reverse(), ...store.events],
      });
    },
    [store, commit],
  );

  const createTask = useCallback(
    (input: { entity: EntityRef; title: string; assigneeId: string; dueDate: string }) => {
      const key = entityKey(input.entity);
      const now = new Date().toISOString();
      const task = {
        id: makeId("task"),
        title: input.title,
        assigneeId: input.assigneeId,
        entity: input.entity,
        dueDate: input.dueDate,
        status: "open" as const,
        createdAt: now,
        completedAt: null,
        seeded: false,
      };
      const records = store.records[key]
        ? store.records
        : { ...store.records, [key]: defaultRecord(input.entity, now) };
      const event = {
        id: makeId("evt"),
        entityKey: key,
        at: now,
        actor: memberName(input.assigneeId),
        kind: "task-created" as const,
        summary: `Task assigned to ${memberName(input.assigneeId)}: ${input.title}`,
        seeded: false,
      };
      commit({
        ...store,
        records,
        tasks: [...store.tasks, task],
        events: [event, ...store.events],
      });
    },
    [store, commit],
  );

  const completeTask = useCallback(
    (taskId: string) => {
      const task = store.tasks.find((t) => t.id === taskId);
      if (!task || task.status === "done") return;
      const now = new Date().toISOString();
      const nextTasks = store.tasks.map((t) =>
        t.id === taskId ? { ...t, status: "done" as const, completedAt: now } : t,
      );
      const event = {
        id: makeId("evt"),
        entityKey: entityKey(task.entity),
        at: now,
        actor: memberName(task.assigneeId),
        kind: "task-completed" as const,
        summary: `Task completed: ${task.title}`,
        seeded: false,
      };
      commit({ ...store, tasks: nextTasks, events: [event, ...store.events] });
    },
    [store, commit],
  );

  const reopenTask = useCallback(
    (taskId: string) => {
      const task = store.tasks.find((t) => t.id === taskId);
      if (!task || task.status === "open") return;
      const now = new Date().toISOString();
      const nextTasks = store.tasks.map((t) =>
        t.id === taskId ? { ...t, status: "open" as const, completedAt: null } : t,
      );
      const event = {
        id: makeId("evt"),
        entityKey: entityKey(task.entity),
        at: now,
        actor: memberName(task.assigneeId),
        kind: "task-reopened" as const,
        summary: `Task reopened: ${task.title}`,
        seeded: false,
      };
      commit({ ...store, tasks: nextTasks, events: [event, ...store.events] });
    },
    [store, commit],
  );

  const resetDemo = useCallback(() => {
    const t = today || todayIso();
    setStore(resetAcquisition(t));
  }, [today]);

  return {
    store,
    hydrated,
    today,
    getRecord,
    ensureRecord,
    setStage,
    saveInterestAndPrice,
    createTask,
    completeTask,
    reopenTask,
    resetDemo,
  };
}
