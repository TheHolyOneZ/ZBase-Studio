import { useState } from "react";
import { ChevronRight, ChevronDown, Table2, Eye, Zap, Download, Copy, Pencil, Hammer } from "lucide-react";
import { useStore, useActiveTab } from "../../store";
import type { SchemaSnapshot } from "../../types/schema";

interface TreeSectionProps {
  label: string;
  count: number;
  children: React.ReactNode;
}

function TreeSection({ label, count, children }: TreeSectionProps) {
  const [open, setOpen] = useState(true);
  return (
    <div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-1.5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide cursor-default select-none transition-colors"
        style={{ color: "var(--fg-subtle)" }}
        onMouseEnter={(e) => (e.currentTarget.style.color = "var(--fg-muted)")}
        onMouseLeave={(e) => (e.currentTarget.style.color = "var(--fg-subtle)")}
      >
        {open ? <ChevronDown size={10} /> : <ChevronRight size={10} />}
        <span className="flex-1 text-left">{label}</span>
        <span>{count}</span>
      </button>
      {open && <div>{children}</div>}
    </div>
  );
}

interface SchemaTreeProps {
  tabId: string;
  schema: SchemaSnapshot;
}

export default function SchemaTree({ tabId, schema }: SchemaTreeProps) {
  const { setActiveTable, activeTable, setTabViewMode, openContextMenu, setTableExportTarget, setEditTableTarget } = useStore();
  const activeTab = useActiveTab();
  const isDuckDb = activeTab?.engine === "duckdb";
  const isMysql = activeTab?.engine === "mysql" || activeTab?.engine === "mariadb";
  const isPostgres = activeTab?.engine === "postgres";
  const currentTable = activeTable[tabId] ?? null;

  function selectTable(name: string) {
    setActiveTable(tabId, name);
    setTabViewMode(tabId, "data");
  }

  function tableContextMenu(e: React.MouseEvent, name: string) {
    e.preventDefault();
    e.stopPropagation();
    openContextMenu(e.clientX, e.clientY, [
      ...(!isDuckDb && !isMysql && !isPostgres ? [{
        label: "Edit Table…",
        icon: <Pencil size={12} />,
        action: () => {
          selectTable(name);
          setEditTableTarget({ tabId, table: name });
        },
      }] : []),
      ...(isMysql || isPostgres ? [{
        label: "Open in Schema Builder…",
        icon: <Hammer size={12} />,
        action: () => {
          selectTable(name);
          setTabViewMode(tabId, "builder");
        },
      }] : []),
      {
        label: "Export table…",
        icon: <Download size={12} />,
        action: () => {
          selectTable(name);
          setTableExportTarget({ tabId, table: name });
        },
      },
      {
        label: "Copy table name",
        icon: <Copy size={12} />,
        action: () => navigator.clipboard.writeText(name).catch(() => {}),
      },
    ]);
  }

  return (
    <div className="flex flex-col gap-1 py-2">
      {schema.tables.length > 0 && (
        <TreeSection label="Tables" count={schema.tables.length}>
          {schema.tables.map((t) => (
            <button
              key={t.name}
              onClick={() => selectTable(t.name)}
              onContextMenu={(e) => tableContextMenu(e, t.name)}
              className="w-full flex items-center gap-2 px-4 py-1 text-xs cursor-default select-none transition-all duration-100"
              style={{
                background: currentTable === t.name ? "var(--accent-soft)" : "transparent",
                color: currentTable === t.name ? "var(--accent)" : "var(--fg-muted)",
              }}
              onMouseEnter={(e) => {
                if (currentTable !== t.name) {
                  e.currentTarget.style.background = "var(--bg-2)";
                  e.currentTarget.style.color = "var(--fg-0)";
                }
              }}
              onMouseLeave={(e) => {
                if (currentTable !== t.name) {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--fg-muted)";
                }
              }}
            >
              <Table2 size={12} style={{ flexShrink: 0 }} />
              <span className="truncate flex-1 text-left">{t.name}</span>
              {t.row_count_estimate !== null && (
                <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>
                  {t.row_count_estimate.toLocaleString()}
                </span>
              )}
            </button>
          ))}
        </TreeSection>
      )}

      {schema.views.length > 0 && (
        <TreeSection label="Views" count={schema.views.length}>
          {schema.views.map((v) => (
            <button
              key={v.name}
              onClick={() => selectTable(v.name)}
              className="w-full flex items-center gap-2 px-4 py-1 text-xs cursor-default select-none transition-all duration-100"
              style={{ color: "var(--fg-muted)" }}
              onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-2)"; e.currentTarget.style.color = "var(--fg-0)"; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--fg-muted)"; }}
            >
              <Eye size={12} style={{ flexShrink: 0 }} />
              <span className="truncate">{v.name}</span>
            </button>
          ))}
        </TreeSection>
      )}

      {schema.triggers.length > 0 && (
        <TreeSection label="Triggers" count={schema.triggers.length}>
          {schema.triggers.map((tr) => (
            <div
              key={tr.name}
              className="flex items-center gap-2 px-4 py-1 text-xs"
              style={{ color: "var(--fg-subtle)" }}
            >
              <Zap size={12} style={{ flexShrink: 0 }} />
              <span className="truncate">{tr.name}</span>
            </div>
          ))}
        </TreeSection>
      )}
    </div>
  );
}
