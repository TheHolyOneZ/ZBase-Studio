import type { TabId } from "../types/domain";


type StoreSetter = (fn: (s: any) => Partial<any>) => void;

interface HasSnapshot<TSnapshot> {
  snapshot: TSnapshot;
}

export interface SliceKeys {
  drafts: string;
  selection: string;
  history: string;
  future: string;
  historyTs: string;
}

export function makeBuilderSlice<
  TDraft extends HasSnapshot<TSnapshot>,
  TSnapshot,
  TSelection
>(
  toDraft: (snapshot: TSnapshot, tabId: TabId) => TDraft,
  keys: SliceKeys,
  set: StoreSetter,
) {
  return {
    init: (tabId: TabId, snapshot: TSnapshot) =>
      set((s) => {
        if (s[keys.drafts][tabId]) return {};
        return { [keys.drafts]: { ...s[keys.drafts], [tabId]: toDraft(snapshot, tabId) } };
      }),

    update: (tabId: TabId, fn: (d: TDraft) => TDraft) =>
      set((s) => {
        const d: TDraft | undefined = s[keys.drafts][tabId];
        if (!d) return {};
        const updated = fn(d);
        const now = Date.now();
        const lastTs: number = s[keys.historyTs][tabId] ?? 0;
        const shouldSave = now - lastTs > 400;
        const history: TDraft[] = s[keys.history][tabId] ?? [];
        return {
          [keys.drafts]: { ...s[keys.drafts], [tabId]: updated },
          [keys.history]: shouldSave
            ? { ...s[keys.history], [tabId]: [...history.slice(-49), d] }
            : s[keys.history],
          [keys.future]: shouldSave ? { ...s[keys.future], [tabId]: [] } : s[keys.future],
          [keys.historyTs]: shouldSave
            ? { ...s[keys.historyTs], [tabId]: now }
            : s[keys.historyTs],
        };
      }),

    resync: (tabId: TabId, snapshot: TSnapshot) =>
      set((s) => ({
        [keys.drafts]: { ...s[keys.drafts], [tabId]: toDraft(snapshot, tabId) },
        [keys.history]: { ...s[keys.history], [tabId]: [] },
        [keys.future]: { ...s[keys.future], [tabId]: [] },
        [keys.historyTs]: { ...s[keys.historyTs], [tabId]: Date.now() },
      })),

    discard: (tabId: TabId) =>
      set((s) => {
        const draft: TDraft | undefined = s[keys.drafts][tabId];
        if (!draft) return {};
        return {
          [keys.drafts]: { ...s[keys.drafts], [tabId]: toDraft(draft.snapshot, tabId) },
          [keys.history]: { ...s[keys.history], [tabId]: [] },
          [keys.future]: { ...s[keys.future], [tabId]: [] },
          [keys.historyTs]: { ...s[keys.historyTs], [tabId]: Date.now() },
        };
      }),

    remove: (tabId: TabId) =>
      set((s) => {
        const { [tabId]: _d, ...drafts } = s[keys.drafts];
        const { [tabId]: _sel, ...sel } = s[keys.selection];
        const { [tabId]: _hist, ...hist } = s[keys.history];
        const { [tabId]: _fut, ...fut } = s[keys.future];
        const { [tabId]: _ts, ...ts } = s[keys.historyTs];
        return {
          [keys.drafts]: drafts,
          [keys.selection]: sel,
          [keys.history]: hist,
          [keys.future]: fut,
          [keys.historyTs]: ts,
        };
      }),

    setSelection: (tabId: TabId, sel: TSelection | null) =>
      set((s) => ({ [keys.selection]: { ...s[keys.selection], [tabId]: sel } })),

    undo: (tabId: TabId) =>
      set((s) => {
        const history: TDraft[] = s[keys.history][tabId] ?? [];
        if (history.length === 0) return {};
        const prev = history[history.length - 1];
        const current: TDraft | undefined = s[keys.drafts][tabId];
        if (!current) return {};
        const future: TDraft[] = s[keys.future][tabId] ?? [];
        return {
          [keys.drafts]: { ...s[keys.drafts], [tabId]: prev },
          [keys.history]: { ...s[keys.history], [tabId]: history.slice(0, -1) },
          [keys.future]: { ...s[keys.future], [tabId]: [...future.slice(-49), current] },
          [keys.historyTs]: { ...s[keys.historyTs], [tabId]: Date.now() },
        };
      }),

    redo: (tabId: TabId) =>
      set((s) => {
        const future: TDraft[] = s[keys.future][tabId] ?? [];
        if (future.length === 0) return {};
        const next = future[future.length - 1];
        const current: TDraft | undefined = s[keys.drafts][tabId];
        if (!current) return {};
        const history: TDraft[] = s[keys.history][tabId] ?? [];
        return {
          [keys.drafts]: { ...s[keys.drafts], [tabId]: next },
          [keys.future]: { ...s[keys.future], [tabId]: future.slice(0, -1) },
          [keys.history]: { ...s[keys.history], [tabId]: [...history.slice(-49), current] },
          [keys.historyTs]: { ...s[keys.historyTs], [tabId]: Date.now() },
        };
      }),
  };
}
