import { X, Plus, Database, Download, FolderOpen, HardDrive } from "lucide-react";
import { useStore } from "../store";
import { closeDb, closePgDb, closeMysqlDb } from "../ipc/commands";

export default function TabBar() {
  const {
    tabs, activeTabId, setActiveTab, removeTab,
    openContextMenu, setDbExportTabId, openNewTabChooser, builderDrafts,
    discardBuilderDraft,
  } = useStore();

  async function handleClose(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (builderDrafts[id]) {
      discardBuilderDraft(id);
      return;
    }
    const tab = tabs.find((t) => t.id === id);
    try {
      if (tab?.engine === "postgres") {
        closePgDb(id);
      } else if (tab?.engine === "mysql" || tab?.engine === "mariadb") {
        closeMysqlDb(id);
      } else {
        await closeDb(id);
      }
    } catch {

    }
    removeTab(id);
  }

  return (
    <div
      className="flex items-stretch h-9 shrink-0 overflow-x-auto overflow-y-hidden"
      style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-0)" }}
    >
      {tabs.map((tab) => {
        const active = tab.id === activeTabId;
        const isDraft = !!builderDrafts[tab.id];
        return (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            onContextMenu={(e) => {
              e.preventDefault();
              openContextMenu(e.clientX, e.clientY, [
                ...(!isDraft && tab.engine === "sqlite" ? [{
                  label: "Export Database…",
                  icon: <Download size={12} />,
                  action: () => { setActiveTab(tab.id); setDbExportTabId(tab.id); },
                }] : []),
                ...(!isDraft && tab.engine !== "postgres" && tab.engine !== "mysql" && tab.engine !== "mariadb" ? [{
                  label: "Open in file manager",
                  icon: <FolderOpen size={12} />,
                  action: () => {
                    import("@tauri-apps/plugin-opener").then(({ openPath }) => {
                      const normalized = tab.path.replace(/\\/g, "/");
                      const dir = normalized.substring(0, normalized.lastIndexOf("/")) || tab.path;
                      openPath(dir).catch(() => {});
                    });
                  },
                }] : []),
                {
                  label: "Close tab",
                  icon: <X size={12} />,
                  separator: !isDraft,
                  danger: true,
                  action: () => handleClose(tab.id, { stopPropagation: () => {} } as React.MouseEvent),
                },
              ]);
            }}
            className="flex items-center gap-2 px-3 h-full shrink-0 max-w-44 transition-all duration-150 cursor-default select-none group"
            style={{
              borderRight: "1px solid var(--border)",
              background: active ? "var(--bg-1)" : "transparent",
              color: active ? "var(--fg-0)" : "var(--fg-muted)",
              position: "relative",
            }}
          >
            {active && (
              <span
                className="absolute top-0 left-0 right-0 h-0.5"
                style={{ background: "var(--accent)" }}
              />
            )}
            {isDraft
              ? <HardDrive size={12} style={{ color: active ? "var(--accent)" : "var(--fg-subtle)", flexShrink: 0 }} />
              : <Database size={12} style={{ color: active ? "var(--accent)" : "var(--fg-subtle)", flexShrink: 0 }} />
            }
            <span className="text-xs truncate">{tab.label}</span>
            {tab.dirtyTxn && (
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: "#E0A53A" }} />
            )}
            {isDraft && (
              <span className="text-[9px] px-1 rounded shrink-0" style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--accent)" }}>
                draft
              </span>
            )}
            {tab.engine === "duckdb" && !isDraft && (
              <span className="text-[9px] px-1 rounded shrink-0 font-medium" style={{ background: "rgba(255,198,0,0.12)", color: "#FFC600", border: "1px solid rgba(255,198,0,0.3)" }}>
                DuckDB
              </span>
            )}
            {tab.engine === "postgres" && (
              <span className="text-[9px] px-1 rounded shrink-0 font-medium" style={{ background: "rgba(50,130,250,0.12)", color: "#3282FA", border: "1px solid rgba(50,130,250,0.3)" }}>
                PG
              </span>
            )}
            {tab.engine === "mysql" && (
              <span className="text-[9px] px-1 rounded shrink-0 font-medium" style={{ background: "rgba(0,170,80,0.12)", color: "#00AA50", border: "1px solid rgba(0,170,80,0.3)" }}>
                MY
              </span>
            )}
            {tab.engine === "mariadb" && (
              <span className="text-[9px] px-1 rounded shrink-0 font-medium" style={{ background: "rgba(180,80,220,0.12)", color: "#B450DC", border: "1px solid rgba(180,80,220,0.3)" }}>
                MD
              </span>
            )}
            <button
              onClick={(e) => handleClose(tab.id, e)}
              className="ml-auto shrink-0 opacity-0 group-hover:opacity-100 transition-opacity w-4 h-4 flex items-center justify-center rounded hover:bg-[rgba(248,113,113,0.2)] hover:text-[var(--danger)]"
            >
              <X size={10} />
            </button>
          </button>
        );
      })}
      <button
        onClick={() => openNewTabChooser()}
        title="Open or create database"
        className="flex items-center justify-center w-9 h-full shrink-0 transition-all duration-150 cursor-default"
        style={{ color: "var(--fg-subtle)" }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--fg-muted)";
          e.currentTarget.style.background = "var(--bg-1)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--fg-subtle)";
          e.currentTarget.style.background = "transparent";
        }}
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
