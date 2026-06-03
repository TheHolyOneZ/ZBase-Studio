import { create } from "zustand";
import type { ContextMenuItem, OpenTab, RecentEntry, RowFilter, SortSpec, TabId, Toast, ViewMode } from "../types/domain";
import type { DbOverview, PgOverview, MysqlOverview, ExportProgress, SearchHit } from "../types/ipc";
import type { SchemaSnapshot } from "../types/schema";
import type { BuilderDraft, BuilderSelection } from "../types/builder";
import type { PgBuilderDraft, PgBuilderSelection } from "../types/pgBuilder";
import type { PgSchemaSnapshot } from "../types/pgSchema";
import type { MysqlBuilderDraft, MysqlBuilderSelection } from "../types/mysqlBuilder";
import type { MysqlSchemaSnapshot } from "../types/mysqlSchema";
import { pgSchemaToDraft } from "../lib/pgSchemaToDraft";
import { mysqlSchemaToDraft } from "../lib/mysqlSchemaToDraft";
import { saveQuery, loadQuery } from "../lib/queryPersist";
import { makeBuilderSlice } from "./builderSliceFactory";

let toastSeq = 0;

interface State {

  tabs: OpenTab[];
  activeTabId: TabId | null;
  sidebarWidth: number;
  recentFiles: RecentEntry[];

  addTab: (tab: OpenTab) => void;
  removeTab: (id: TabId) => void;
  setActiveTab: (id: TabId) => void;
  setTabViewMode: (id: TabId, mode: ViewMode) => void;
  setTabDirtyTxn: (id: TabId, dirty: boolean) => void;
  addRecentFile: (entry: RecentEntry) => void;
  setSidebarWidth: (w: number) => void;


  queryContent: Record<TabId, string>;
  setQueryContent: (id: TabId, content: string) => void;

  queryHistory: Record<TabId, string[]>;
  pushQueryHistory: (id: TabId, sql: string) => void;


  schemas: Record<TabId, SchemaSnapshot>;
  setSchema: (id: TabId, schema: SchemaSnapshot) => void;


  erPositions: Record<TabId, Record<string, { x: number; y: number }>>;
  setErPositions: (id: TabId, positions: Record<string, { x: number; y: number }>) => void;


  gridOffsets: Record<TabId, Record<string, number>>;
  setGridOffset: (tabId: TabId, table: string, offset: number) => void;
  gridFilters: Record<TabId, Record<string, RowFilter[]>>;
  setGridFilters: (tabId: TabId, table: string, filters: RowFilter[]) => void;
  gridSort: Record<TabId, Record<string, SortSpec | null>>;
  setGridSort: (tabId: TabId, table: string, sort: SortSpec | null) => void;


  activeTable: Record<TabId, string | null>;
  setActiveTable: (tabId: TabId, table: string | null) => void;


  searchJobId: Record<TabId, string | null>;
  searchHits: Record<TabId, SearchHit[]>;
  searchRunning: Record<TabId, boolean>;
  setSearchJobId: (tabId: TabId, jobId: string | null) => void;
  appendSearchHits: (tabId: TabId, hits: SearchHit[]) => void;
  clearSearchHits: (tabId: TabId) => void;
  setSearchRunning: (tabId: TabId, running: boolean) => void;


  exportJobId: string | null;
  exportProgress: ExportProgress | null;
  exportRunning: boolean;
  setExportJob: (jobId: string | null) => void;
  setExportProgress: (p: ExportProgress | null) => void;
  setExportRunning: (running: boolean) => void;


  overviews: Record<TabId, DbOverview>;
  setOverview: (tabId: TabId, overview: DbOverview) => void;
  pgOverviews: Record<TabId, PgOverview>;
  setPgOverview: (tabId: TabId, overview: PgOverview) => void;
  mysqlOverviews: Record<TabId, MysqlOverview>;
  setMysqlOverview: (tabId: TabId, overview: MysqlOverview) => void;


  fontSize: number;
  pageSize: number;
  setFontSize: (n: number) => void;
  setPageSize: (n: number) => void;


  toasts: Toast[];
  addToast: (t: Omit<Toast, "id">) => void;
  removeToast: (id: string) => void;


  contextMenu: { x: number; y: number; items: ContextMenuItem[] } | null;
  openContextMenu: (x: number, y: number, items: ContextMenuItem[]) => void;
  closeContextMenu: () => void;


  tableExportTarget: { tabId: string; table: string } | null;
  setTableExportTarget: (t: { tabId: string; table: string } | null) => void;
  dbExportTabId: string | null;
  setDbExportTabId: (id: string | null) => void;
  editTableTarget: { tabId: string; table: string } | null;
  setEditTableTarget: (t: { tabId: string; table: string } | null) => void;


  newTabChooserOpen: boolean;
  openNewTabChooser: () => void;
  closeNewTabChooser: () => void;

  templatePickerOpen: boolean;
  setTemplatePickerOpen: (v: boolean) => void;
  schemaImportOpen: boolean;
  setSchemaImportOpen: (v: boolean) => void;
  csvImporterOpen: boolean;
  setCsvImporterOpen: (v: boolean) => void;
  pgConnectOpen: boolean;
  setPgConnectOpen: (v: boolean) => void;
  mysqlConnectOpen: boolean;
  setMysqlConnectOpen: (v: boolean) => void;
  mariadbConnectOpen: boolean;
  setMariadbConnectOpen: (v: boolean) => void;


  builderDrafts: Record<TabId, BuilderDraft>;
  builderSelection: Record<TabId, BuilderSelection>;
  builderHistory: Record<TabId, BuilderDraft[]>;
  builderFuture: Record<TabId, BuilderDraft[]>;
  _builderHistoryTs: Record<TabId, number>;
  createBuilderTab: (seed?: Partial<BuilderDraft>) => TabId;
  updateBuilderDraft: (tabId: TabId, fn: (d: BuilderDraft) => BuilderDraft) => void;
  discardBuilderDraft: (tabId: TabId) => void;
  promoteBuilderTab: (draftTabId: TabId, realTabId: TabId, path: string, label: string) => void;
  setBuilderSelection: (tabId: TabId, sel: BuilderSelection) => void;
  undoBuilderDraft: (tabId: TabId) => void;
  redoBuilderDraft: (tabId: TabId) => void;


  pgBuilderDrafts: Record<TabId, PgBuilderDraft>;
  pgBuilderSelection: Record<TabId, PgBuilderSelection>;
  pgBuilderHistory: Record<TabId, PgBuilderDraft[]>;
  pgBuilderFuture: Record<TabId, PgBuilderDraft[]>;
  _pgBuilderHistoryTs: Record<TabId, number>;
  initPgBuilderDraft: (tabId: TabId, snapshot: PgSchemaSnapshot) => void;
  updatePgBuilderDraft: (tabId: TabId, fn: (d: PgBuilderDraft) => PgBuilderDraft) => void;
  resyncPgBuilderDraft: (tabId: TabId, snapshot: PgSchemaSnapshot) => void;
  discardPgBuilderEdits: (tabId: TabId) => void;
  removePgBuilderDraft: (tabId: TabId) => void;
  setPgBuilderSelection: (tabId: TabId, sel: PgBuilderSelection) => void;
  undoPgBuilderDraft: (tabId: TabId) => void;
  redoPgBuilderDraft: (tabId: TabId) => void;


  mysqlBuilderDrafts: Record<TabId, MysqlBuilderDraft>;
  mysqlBuilderSelection: Record<TabId, MysqlBuilderSelection>;
  mysqlBuilderHistory: Record<TabId, MysqlBuilderDraft[]>;
  mysqlBuilderFuture: Record<TabId, MysqlBuilderDraft[]>;
  _mysqlBuilderHistoryTs: Record<TabId, number>;
  initMysqlBuilderDraft: (tabId: TabId, snapshot: MysqlSchemaSnapshot) => void;
  updateMysqlBuilderDraft: (tabId: TabId, fn: (d: MysqlBuilderDraft) => MysqlBuilderDraft) => void;
  resyncMysqlBuilderDraft: (tabId: TabId, snapshot: MysqlSchemaSnapshot) => void;
  discardMysqlBuilderEdits: (tabId: TabId) => void;
  removeMysqlBuilderDraft: (tabId: TabId) => void;
  setMysqlBuilderSelection: (tabId: TabId, sel: MysqlBuilderSelection) => void;
  undoMysqlBuilderDraft: (tabId: TabId) => void;
  redoMysqlBuilderDraft: (tabId: TabId) => void;
}

export const useStore = create<State>((set, _get) => ({
  tabs: [],
  activeTabId: null,
  sidebarWidth: 240,
  recentFiles: [],

  addTab: (tab) =>
    set((s) => {
      if (s.tabs.find((t) => t.id === tab.id)) return { activeTabId: tab.id };
      const saved = !tab.isDraft ? loadQuery(tab.path) : "";
      return {
        tabs: [...s.tabs, tab],
        activeTabId: tab.id,
        queryContent: saved ? { ...s.queryContent, [tab.id]: saved } : s.queryContent,
      };
    }),
  removeTab: (id) =>
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== id);
      const activeTabId =
        s.activeTabId === id ? (tabs[tabs.length - 1]?.id ?? null) : s.activeTabId;
      const { [id]: _pgd, ...pgBuilderDrafts } = s.pgBuilderDrafts;
      const { [id]: _pgs, ...pgBuilderSelection } = s.pgBuilderSelection;
      const { [id]: _pgh, ...pgBuilderHistory } = s.pgBuilderHistory;
      const { [id]: _pgf, ...pgBuilderFuture } = s.pgBuilderFuture;
      const { [id]: _pgt, ..._pgBuilderHistoryTs } = s._pgBuilderHistoryTs;
      const { [id]: _myd, ...mysqlBuilderDrafts } = s.mysqlBuilderDrafts;
      const { [id]: _mys, ...mysqlBuilderSelection } = s.mysqlBuilderSelection;
      const { [id]: _myh, ...mysqlBuilderHistory } = s.mysqlBuilderHistory;
      const { [id]: _myf, ...mysqlBuilderFuture } = s.mysqlBuilderFuture;
      const { [id]: _myt, ..._mysqlBuilderHistoryTs } = s._mysqlBuilderHistoryTs;
      return {
        tabs, activeTabId,
        pgBuilderDrafts, pgBuilderSelection, pgBuilderHistory, pgBuilderFuture, _pgBuilderHistoryTs,
        mysqlBuilderDrafts, mysqlBuilderSelection, mysqlBuilderHistory, mysqlBuilderFuture, _mysqlBuilderHistoryTs,
      };
    }),
  setActiveTab: (id) => set({ activeTabId: id }),
  setTabViewMode: (id, mode) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, viewMode: mode } : t)),
    })),
  setTabDirtyTxn: (id, dirty) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, dirtyTxn: dirty } : t)),
    })),
  addRecentFile: (entry) =>
    set((s) => ({
      recentFiles: [
        entry,
        ...s.recentFiles.filter((r) => r.path !== entry.path).slice(0, 19),
      ],
    })),
  setSidebarWidth: (w) => set({ sidebarWidth: w }),

  queryContent: {},
  setQueryContent: (id, content) =>
    set((s) => {
      const tab = s.tabs.find((t) => t.id === id);
      if (tab && !tab.isDraft) saveQuery(tab.path, content);
      return { queryContent: { ...s.queryContent, [id]: content } };
    }),

  queryHistory: {},
  pushQueryHistory: (id, sql) =>
    set((s) => {
      const hist = s.queryHistory[id] ?? [];
      return { queryHistory: { ...s.queryHistory, [id]: [sql, ...hist].slice(0, 200) } };
    }),

  schemas: {},
  setSchema: (id, schema) =>
    set((s) => ({ schemas: { ...s.schemas, [id]: schema } })),

  erPositions: {},
  setErPositions: (id, positions) =>
    set((s) => ({ erPositions: { ...s.erPositions, [id]: positions } })),

  gridOffsets: {},
  setGridOffset: (tabId, table, offset) =>
    set((s) => ({
      gridOffsets: { ...s.gridOffsets, [tabId]: { ...(s.gridOffsets[tabId] ?? {}), [table]: offset } },
    })),

  gridFilters: {},
  setGridFilters: (tabId, table, filters) =>
    set((s) => ({
      gridFilters: { ...s.gridFilters, [tabId]: { ...(s.gridFilters[tabId] ?? {}), [table]: filters } },
    })),

  gridSort: {},
  setGridSort: (tabId, table, sort) =>
    set((s) => ({
      gridSort: { ...s.gridSort, [tabId]: { ...(s.gridSort[tabId] ?? {}), [table]: sort } },
    })),

  activeTable: {},
  setActiveTable: (tabId, table) =>
    set((s) => ({ activeTable: { ...s.activeTable, [tabId]: table } })),

  searchJobId: {},
  searchHits: {},
  searchRunning: {},
  setSearchJobId: (tabId, jobId) =>
    set((s) => ({ searchJobId: { ...s.searchJobId, [tabId]: jobId } })),
  appendSearchHits: (tabId, hits) =>
    set((s) => {
      const MAX_HITS = 10_000;
      const existing = s.searchHits[tabId] ?? [];
      if (existing.length >= MAX_HITS) return {};
      const merged = existing.concat(hits.slice(0, MAX_HITS - existing.length));
      return { searchHits: { ...s.searchHits, [tabId]: merged } };
    }),
  clearSearchHits: (tabId) =>
    set((s) => ({ searchHits: { ...s.searchHits, [tabId]: [] } })),
  setSearchRunning: (tabId, running) =>
    set((s) => ({ searchRunning: { ...s.searchRunning, [tabId]: running } })),

  exportJobId: null,
  exportProgress: null,
  exportRunning: false,
  setExportJob: (jobId) => set({ exportJobId: jobId }),
  setExportProgress: (p) => set({ exportProgress: p }),
  setExportRunning: (running) => set({ exportRunning: running }),

  overviews: {},
  setOverview: (tabId, overview) =>
    set((s) => ({ overviews: { ...s.overviews, [tabId]: overview } })),
  pgOverviews: {},
  setPgOverview: (tabId, overview) =>
    set((s) => ({ pgOverviews: { ...s.pgOverviews, [tabId]: overview } })),
  mysqlOverviews: {},
  setMysqlOverview: (tabId, overview) =>
    set((s) => ({ mysqlOverviews: { ...s.mysqlOverviews, [tabId]: overview } })),

  fontSize: 13,
  pageSize: 100,
  setFontSize: (n) => set({ fontSize: n }),
  setPageSize: (n) => set({ pageSize: n }),

  toasts: [],
  addToast: (t) => {
    const id = `t${++toastSeq}`;
    set((s) => ({ toasts: [...s.toasts, { ...t, id }] }));
    setTimeout(
      () => set((s) => ({ toasts: s.toasts.filter((x) => x.id !== id) })),
      4200,
    );
  },
  removeToast: (id) =>
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

  contextMenu: null,
  openContextMenu: (x, y, items) => set({ contextMenu: { x, y, items } }),
  closeContextMenu: () => set({ contextMenu: null }),

  tableExportTarget: null,
  setTableExportTarget: (t) => set({ tableExportTarget: t }),
  dbExportTabId: null,
  setDbExportTabId: (id) => set({ dbExportTabId: id }),
  editTableTarget: null,
  setEditTableTarget: (t) => set({ editTableTarget: t }),

  newTabChooserOpen: false,
  openNewTabChooser: () => set({ newTabChooserOpen: true }),
  closeNewTabChooser: () => set({ newTabChooserOpen: false }),
  templatePickerOpen: false,
  setTemplatePickerOpen: (v) => set({ templatePickerOpen: v }),
  schemaImportOpen: false,
  setSchemaImportOpen: (v) => set({ schemaImportOpen: v }),
  csvImporterOpen: false,
  setCsvImporterOpen: (v) => set({ csvImporterOpen: v }),
  pgConnectOpen: false,
  setPgConnectOpen: (v) => set({ pgConnectOpen: v }),
  mysqlConnectOpen: false,
  setMysqlConnectOpen: (v) => set({ mysqlConnectOpen: v }),
  mariadbConnectOpen: false,
  setMariadbConnectOpen: (v) => set({ mariadbConnectOpen: v }),

  builderDrafts: {},
  builderSelection: {},
  builderHistory: {},
  builderFuture: {},
  _builderHistoryTs: {},
  createBuilderTab: (seed) => {
    const id = crypto.randomUUID();
    const draft: BuilderDraft = {
      label: seed?.label ?? "Untitled Database",
      tables: seed?.tables ?? [],
      indexes: seed?.indexes ?? [],
      views: seed?.views ?? [],
      triggers: seed?.triggers ?? [],
    };
    set((s) => ({
      builderDrafts: { ...s.builderDrafts, [id]: draft },
      tabs: s.tabs.find((t) => t.id === id) ? s.tabs : [
        ...s.tabs,
        { id, path: "", label: draft.label, viewMode: "data", dirtyTxn: false, isDraft: true },
      ],
      activeTabId: id,
    }));
    return id;
  },
  updateBuilderDraft: (tabId, fn) =>
    set((s) => {
      const d = s.builderDrafts[tabId];
      if (!d) return {};
      const updated = fn(d);
      const now = Date.now();
      const lastTs = s._builderHistoryTs[tabId] ?? 0;
      const shouldSave = now - lastTs > 400;
      const history = s.builderHistory[tabId] ?? [];
      return {
        builderDrafts: { ...s.builderDrafts, [tabId]: updated },
        tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, label: updated.label } : t)),
        builderHistory: shouldSave
          ? { ...s.builderHistory, [tabId]: [...history.slice(-49), d] }
          : s.builderHistory,
        builderFuture: shouldSave
          ? { ...s.builderFuture, [tabId]: [] }
          : s.builderFuture,
        _builderHistoryTs: shouldSave
          ? { ...s._builderHistoryTs, [tabId]: now }
          : s._builderHistoryTs,
      };
    }),
  discardBuilderDraft: (tabId) =>
    set((s) => {
      const { [tabId]: _removed, ...rest } = s.builderDrafts;
      const { [tabId]: _sel, ...selRest } = s.builderSelection;
      const { [tabId]: _hist, ...histRest } = s.builderHistory;
      const { [tabId]: _fut, ...futRest } = s.builderFuture;
      const { [tabId]: _ts, ...tsRest } = s._builderHistoryTs;
      const tabs = s.tabs.filter((t) => t.id !== tabId);
      const activeTabId = s.activeTabId === tabId ? (tabs[tabs.length - 1]?.id ?? null) : s.activeTabId;
      return {
        builderDrafts: rest, builderSelection: selRest,
        builderHistory: histRest, builderFuture: futRest, _builderHistoryTs: tsRest,
        tabs, activeTabId,
      };
    }),
  promoteBuilderTab: (draftTabId, realTabId, path, label) =>
    set((s) => {
      const { [draftTabId]: _removed, ...rest } = s.builderDrafts;
      const { [draftTabId]: _sel, ...selRest } = s.builderSelection;
      const { [draftTabId]: _hist, ...histRest } = s.builderHistory;
      const { [draftTabId]: _fut, ...futRest } = s.builderFuture;
      const { [draftTabId]: _ts, ...tsRest } = s._builderHistoryTs;
      const tabs = s.tabs
        .filter((t) => t.id !== draftTabId)
        .concat({ id: realTabId, path, label, viewMode: "data", dirtyTxn: false, isDraft: false });
      return {
        builderDrafts: rest, builderSelection: selRest,
        builderHistory: histRest, builderFuture: futRest, _builderHistoryTs: tsRest,
        tabs, activeTabId: realTabId,
      };
    }),
  setBuilderSelection: (tabId, sel) =>
    set((s) => ({ builderSelection: { ...s.builderSelection, [tabId]: sel } })),

  undoBuilderDraft: (tabId) =>
    set((s) => {
      const history = s.builderHistory[tabId] ?? [];
      if (history.length === 0) return {};
      const prev = history[history.length - 1];
      const current = s.builderDrafts[tabId];
      if (!current) return {};
      const future = s.builderFuture[tabId] ?? [];
      return {
        builderDrafts: { ...s.builderDrafts, [tabId]: prev },
        builderHistory: { ...s.builderHistory, [tabId]: history.slice(0, -1) },
        builderFuture: { ...s.builderFuture, [tabId]: [...future.slice(-49), current] },
        tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, label: prev.label } : t)),
        _builderHistoryTs: { ...s._builderHistoryTs, [tabId]: Date.now() },
      };
    }),

  redoBuilderDraft: (tabId) =>
    set((s) => {
      const future = s.builderFuture[tabId] ?? [];
      if (future.length === 0) return {};
      const next = future[future.length - 1];
      const current = s.builderDrafts[tabId];
      if (!current) return {};
      const history = s.builderHistory[tabId] ?? [];
      return {
        builderDrafts: { ...s.builderDrafts, [tabId]: next },
        builderFuture: { ...s.builderFuture, [tabId]: future.slice(0, -1) },
        builderHistory: { ...s.builderHistory, [tabId]: [...history.slice(-49), current] },
        tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, label: next.label } : t)),
        _builderHistoryTs: { ...s._builderHistoryTs, [tabId]: Date.now() },
      };
    }),

  ...(() => {
    const pg = makeBuilderSlice<PgBuilderDraft, PgSchemaSnapshot, PgBuilderSelection>(
      pgSchemaToDraft,
      {
        drafts: "pgBuilderDrafts",
        selection: "pgBuilderSelection",
        history: "pgBuilderHistory",
        future: "pgBuilderFuture",
        historyTs: "_pgBuilderHistoryTs",
      },
      set,
    );
    return {
      pgBuilderDrafts: {} as Record<TabId, PgBuilderDraft>,
      pgBuilderSelection: {} as Record<TabId, PgBuilderSelection>,
      pgBuilderHistory: {} as Record<TabId, PgBuilderDraft[]>,
      pgBuilderFuture: {} as Record<TabId, PgBuilderDraft[]>,
      _pgBuilderHistoryTs: {} as Record<TabId, number>,
      initPgBuilderDraft: pg.init,
      updatePgBuilderDraft: pg.update,
      resyncPgBuilderDraft: pg.resync,
      discardPgBuilderEdits: pg.discard,
      removePgBuilderDraft: pg.remove,
      setPgBuilderSelection: pg.setSelection,
      undoPgBuilderDraft: pg.undo,
      redoPgBuilderDraft: pg.redo,
    };
  })(),

  ...(() => {
    const my = makeBuilderSlice<MysqlBuilderDraft, MysqlSchemaSnapshot, MysqlBuilderSelection>(
      mysqlSchemaToDraft,
      {
        drafts: "mysqlBuilderDrafts",
        selection: "mysqlBuilderSelection",
        history: "mysqlBuilderHistory",
        future: "mysqlBuilderFuture",
        historyTs: "_mysqlBuilderHistoryTs",
      },
      set,
    );
    return {
      mysqlBuilderDrafts: {} as Record<TabId, MysqlBuilderDraft>,
      mysqlBuilderSelection: {} as Record<TabId, MysqlBuilderSelection>,
      mysqlBuilderHistory: {} as Record<TabId, MysqlBuilderDraft[]>,
      mysqlBuilderFuture: {} as Record<TabId, MysqlBuilderDraft[]>,
      _mysqlBuilderHistoryTs: {} as Record<TabId, number>,
      initMysqlBuilderDraft: my.init,
      updateMysqlBuilderDraft: my.update,
      resyncMysqlBuilderDraft: my.resync,
      discardMysqlBuilderEdits: my.discard,
      removeMysqlBuilderDraft: my.remove,
      setMysqlBuilderSelection: my.setSelection,
      undoMysqlBuilderDraft: my.undo,
      redoMysqlBuilderDraft: my.redo,
    };
  })(),
}));

export const useActiveTab = () => {
  const { tabs, activeTabId } = useStore();
  return tabs.find((t) => t.id === activeTabId) ?? null;
};
