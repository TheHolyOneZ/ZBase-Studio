import { useStore, useActiveTab } from "../store";
import DataGrid from "./data/DataGrid";
import QueryEditor from "./query/QueryEditor";
import ErCanvas from "./er/ErCanvas";
import OverviewPanel from "./stats/OverviewPanel";
import FullDbSearchPanel from "./search/FullDbSearchPanel";
import TransactionBar from "./txn/TransactionBar";
import BuilderView from "./builder/BuilderView";
import PgBuilderView from "./builder/pg/PgBuilderView";
import MysqlBuilderView from "./builder/mysql/MysqlBuilderView";
import EmptyState from "./common/EmptyState";
import { Database, Table2, Code2, Share2, BarChart2, Search, Hammer } from "lucide-react";
import { clsx } from "clsx";
import type { ViewMode } from "../types/domain";
import { schemaToBuilderDraft } from "../lib/schemaToDraft";

const VIEW_TABS: { mode: ViewMode; label: string; icon: React.ReactNode }[] = [
  { mode: "data", label: "Data", icon: <Table2 size={13} /> },
  { mode: "query", label: "Query", icon: <Code2 size={13} /> },
  { mode: "er", label: "ER Diagram", icon: <Share2 size={13} /> },
  { mode: "stats", label: "Stats", icon: <BarChart2 size={13} /> },
  { mode: "search", label: "Search", icon: <Search size={13} /> },
];

export default function ViewPanel() {
  const { schemas, activeTable, setTabViewMode, builderDrafts, createBuilderTab } = useStore();
  const activeTab = useActiveTab();

  function handleEditInBuilder() {
    if (!activeTab) return;
    const s = schemas[activeTab.id];
    if (!s) return;
    const base = activeTab.label.replace(/\.(db|sqlite|sqlite3)$/i, "");
    const { draft } = schemaToBuilderDraft(s, `${base} (copy)`);
    createBuilderTab(draft);
  }

  if (!activeTab) {
    return (
      <EmptyState
        icon={<Database size={48} strokeWidth={1} />}
        title="No database open"
        description="Click + in the tab bar to open a .db file"
      />
    );
  }


  if (builderDrafts[activeTab.id]) {
    return <BuilderView tabId={activeTab.id} />;
  }


  if (activeTab.viewMode === "builder" && activeTab.engine === "postgres") {
    return <PgBuilderView tabId={activeTab.id} />;
  }


  if (activeTab.viewMode === "builder" && (activeTab.engine === "mysql" || activeTab.engine === "mariadb")) {
    return <MysqlBuilderView tabId={activeTab.id} />;
  }

  const schema = schemas[activeTab.id];
  const table = activeTable[activeTab.id] ?? null;
  const isDuckDb = activeTab.engine === "duckdb";
  const isPostgres = activeTab.engine === "postgres";
  const isMysql = activeTab.engine === "mysql" || activeTab.engine === "mariadb";


  const visibleTabs = isPostgres || isMysql
    ? [
        ...VIEW_TABS.filter((t) => t.mode !== "builder"),
        { mode: "builder" as ViewMode, label: "Schema", icon: <Hammer size={13} /> },
      ]
    : isDuckDb
      ? VIEW_TABS.filter((t) => t.mode === "data" || t.mode === "query" || t.mode === "er")
      : VIEW_TABS;

  return (
    <div className="flex flex-col h-full overflow-hidden">

      <div
        className="flex items-stretch h-9 shrink-0"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-0)" }}
      >
        {visibleTabs.map(({ mode, label, icon }) => {
          const active = activeTab.viewMode === mode;
          return (
            <button
              key={mode}
              onClick={() => setTabViewMode(activeTab.id, mode)}
              className={clsx(
                "flex items-center gap-1.5 px-3 text-xs cursor-default select-none transition-all duration-100 relative",
                active ? "font-medium" : "font-normal",
              )}
              style={{
                borderRight: "1px solid var(--border)",
                color: active ? "var(--fg-0)" : "var(--fg-subtle)",
                background: active ? "var(--bg-1)" : "transparent",
              }}
            >
              {active && (
                <span
                  className="absolute top-0 left-0 right-0 h-0.5"
                  style={{ background: "var(--accent)" }}
                />
              )}
              {icon}
              {label}
            </button>
          );
        })}

        {!isDuckDb && !isPostgres && !isMysql && (
          <div className="ml-auto flex items-center pr-2">
            <button
              onClick={handleEditInBuilder}
              disabled={!schema}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-default transition-all disabled:opacity-30"
              style={{ color: "var(--fg-muted)", border: "1px solid var(--border)" }}
              title="Open this database's schema in a new visual builder tab (creates a copy — original is unchanged)"
            >
              <Hammer size={11} /> Edit Schema in Builder…
            </button>
          </div>
        )}
      </div>


      <div className="flex-1 overflow-hidden">
        {activeTab.viewMode === "data" && (
          table ? (
            <DataGrid tabId={activeTab.id} table={table} readOnly={isDuckDb} />
          ) : (
            <EmptyState title="Select a table" description="Click a table in the sidebar to view its rows" />
          )
        )}
        {activeTab.viewMode === "query" && (
          <QueryEditor tabId={activeTab.id} />
        )}
        {activeTab.viewMode === "er" && schema && (
          <ErCanvas tabId={activeTab.id} schema={schema} engine={activeTab.engine} />
        )}
        {activeTab.viewMode === "er" && !schema && (
          <EmptyState title="No schema loaded" description="Open a database first" />
        )}
        {activeTab.viewMode === "stats" && (
          <OverviewPanel tabId={activeTab.id} />
        )}
        {activeTab.viewMode === "search" && (
          <FullDbSearchPanel tabId={activeTab.id} />
        )}
      </div>


      {activeTab.dirtyTxn && !isDuckDb && !isMysql && <TransactionBar tabId={activeTab.id} />}
    </div>
  );
}
