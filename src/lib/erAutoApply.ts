import { useEffect, useRef } from "react";
import { useStore } from "../store";
import { diffDrafts } from "./schemaDiff";
import { planToStatements } from "./planToSql";
import { applySchemaPlan, getDbSchema } from "../ipc/commands";

const DEBOUNCE_MS = 400;

function parseApplyError(err: unknown): string {

  const msg =
    err !== null && typeof err === "object" && "message" in err
      ? String((err as { message: unknown }).message)
      : String(err);
  if (msg.includes("SQLITE_BUSY") || msg.includes("database is locked")) {
    return "Database is locked by another process. Close other connections and try again.";
  }
  if (msg.includes("foreign key constraint") || msg.includes("FOREIGN KEY")) {
    return `FK constraint violation — existing data violates the new constraint. Changes were rolled back.`;
  }
  if (msg.includes("foreign_key_check") || msg.includes("Foreign key violations")) {
    const match = msg.match(/(\d+)\s+violation/i);
    const count = match ? ` (${match[1]} row${Number(match[1]) !== 1 ? "s" : ""})` : "";
    return `FK integrity check failed${count}. Changes were rolled back.`;
  }
  if (msg.includes("UNIQUE constraint") || msg.includes("UNIQUE")) {
    return `UNIQUE constraint violation — existing data conflicts. Changes were rolled back.`;
  }
  if (msg.includes("NOT NULL")) {
    return `NOT NULL constraint violation — existing rows have NULL in the column. Changes were rolled back.`;
  }
  return `Auto-save failed: ${msg}`;
}

export function useErAutoApply(tabId: string) {
  const { erDrafts, schemas, setSchema, addToast, silentUpdateErDraft, resyncErDraft } = useStore();
  const draft = erDrafts?.[tabId];
  const snapshot = schemas[tabId];

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const applyingRef = useRef(false);
  const pendingRetryRef = useRef(false);


  const draftRef = useRef(draft);
  draftRef.current = draft;
  const snapshotRef = useRef(snapshot);
  snapshotRef.current = snapshot;


  const storeRef = useRef({ setSchema, addToast, silentUpdateErDraft, resyncErDraft });
  storeRef.current = { setSchema, addToast, silentUpdateErDraft, resyncErDraft };


  const doApplyRef = useRef<() => Promise<void>>(async () => {});
  doApplyRef.current = async () => {
    if (applyingRef.current) {

      pendingRetryRef.current = true;
      return;
    }

    const currentDraft = draftRef.current;
    const currentSnapshot = snapshotRef.current;
    if (!currentDraft || !currentSnapshot) return;

    const plan = diffDrafts(currentSnapshot, currentDraft);
    if (plan.ops.length === 0) return;

    applyingRef.current = true;
    pendingRetryRef.current = false;
    try {
      const { statements, requiresFkOff, rebuiltTables } = planToStatements(plan);
      await applySchemaPlan(tabId, statements, requiresFkOff, rebuiltTables);
      const newSchema = await getDbSchema(tabId);
      storeRef.current.setSchema(tabId, newSchema);

      storeRef.current.silentUpdateErDraft(tabId, (d) => ({ ...d, snapshot: newSchema }));
    } catch (err) {

      const liveSchema = snapshotRef.current;
      if (liveSchema) {
        storeRef.current.resyncErDraft(tabId, liveSchema);
      }
      storeRef.current.addToast({ type: "error", message: parseApplyError(err) });
    } finally {
      applyingRef.current = false;

      if (pendingRetryRef.current) {
        pendingRetryRef.current = false;
        timerRef.current = setTimeout(() => doApplyRef.current?.(), DEBOUNCE_MS);
      }
    }
  };

  useEffect(() => {
    if (!draft || !snapshot) return;

    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => doApplyRef.current?.(), DEBOUNCE_MS);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [draft]);
}
