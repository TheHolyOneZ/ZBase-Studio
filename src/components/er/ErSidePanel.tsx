import { useState } from "react";
import { X, Plus } from "lucide-react";
import { useStore } from "../../store";
import TableEditor from "../builder/TableEditor";
import IndexEditor from "../builder/IndexEditor";
import ConfirmDropModal from "./ConfirmDropModal";
import type { DraftColumn, DraftIndex, DraftTable } from "../../types/builder";
import type { SchemaSnapshot } from "../../types/schema";

interface ErSidePanelProps {
  tabId: string;
  tableName: string;
  liveSnapshot: SchemaSnapshot;
  onClose: () => void;
}

type PanelTab = "table" | "indexes";

export default function ErSidePanel({
  tabId,
  tableName,
  liveSnapshot,
  onClose,
}: ErSidePanelProps) {
  const { erDrafts, updateErDraft } = useStore();
  const draft = erDrafts?.[tabId];
  const table = draft?.tables.find((t) => t.name === tableName);

  const [activeTab, setActiveTab] = useState<PanelTab>("table");
  const [pendingColDrop, setPendingColDrop] = useState<{
    col: DraftColumn;
    patch: Partial<DraftTable>;
  } | null>(null);

  if (!table || !draft) return null;

  const snapTable = liveSnapshot.tables.find((t) => t.name === tableName);
  const tableIndexes = draft.indexes.filter((i) => i.table === tableName);

  function isLiveColumn(colName: string): boolean {
    return !!snapTable?.columns.find((c) => c.name === colName);
  }

  function applyPatch(patch: Partial<DraftTable>) {
    updateErDraft(tabId, (d) => ({
      ...d,
      tables: d.tables.map((t) => (t.id === table!.id ? { ...t, ...patch } : t)),
    }));
  }

  function handleChange(patch: Partial<DraftTable>) {
    if (patch.columns && patch.columns.length < table!.columns.length) {
      const removedCol = table!.columns.find(
        (c) => !patch.columns!.find((nc) => nc.id === c.id),
      );
      if (removedCol && isLiveColumn(removedCol.name)) {
        setPendingColDrop({ col: removedCol, patch });
        return;
      }
    }
    applyPatch(patch);
  }

  function confirmColDrop() {
    if (!pendingColDrop) return;
    applyPatch(pendingColDrop.patch);
    setPendingColDrop(null);
  }

  function addIndex() {
    const newIdx: DraftIndex = {
      id: crypto.randomUUID(),
      name: "",
      table: tableName,
      columns: [],
      unique: false,
      whereClause: null,
    };
    updateErDraft(tabId, (d) => ({ ...d, indexes: [...d.indexes, newIdx] }));
  }

  function updateIndex(id: string, patch: Partial<DraftIndex>) {
    updateErDraft(tabId, (d) => ({
      ...d,
      indexes: d.indexes.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    }));
  }

  function removeIndex(id: string) {
    updateErDraft(tabId, (d) => ({ ...d, indexes: d.indexes.filter((i) => i.id !== id) }));
  }

  const snapColRowCount = snapTable?.row_count_estimate;

  const tabStyle = (t: PanelTab) => ({
    borderBottom: activeTab === t ? "2px solid var(--accent)" : "2px solid transparent",
    color: activeTab === t ? "var(--accent)" : "var(--fg-muted)",
    cursor: "default" as const,
  });

  return (
    <>
      <ConfirmDropModal
        open={!!pendingColDrop}
        kind="column"
        name={pendingColDrop?.col.name ?? ""}
        rowCount={snapColRowCount}
        onConfirm={confirmColDrop}
        onCancel={() => setPendingColDrop(null)}
      />

      <div
        className="shrink-0 flex flex-col overflow-hidden"
        style={{
          borderLeft: "1px solid var(--border)",
          background: "var(--bg-1)",
          width: "clamp(380px, 30vw, 520px)",
        }}
      >

        <div
          className="flex items-center justify-between px-3 py-2 shrink-0"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          <span
            className="text-xs font-semibold font-mono truncate flex-1 mr-2"
            style={{ color: "var(--fg-0)" }}
          >
            {table.name || "(unnamed)"}
          </span>
          <button
            onClick={onClose}
            className="cursor-default p-1 rounded hover:bg-[var(--bg-2)] shrink-0"
            title="Close panel"
          >
            <X size={12} style={{ color: "var(--fg-muted)" }} />
          </button>
        </div>


        <div
          className="flex gap-0 shrink-0 px-3"
          style={{ borderBottom: "1px solid var(--border)" }}
        >
          {(["table", "indexes"] as PanelTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className="px-3 py-1.5 text-xs font-semibold capitalize transition-colors"
              style={tabStyle(t)}
            >
              {t === "indexes" ? `Indexes (${tableIndexes.length})` : "Table"}
            </button>
          ))}
        </div>


        <div className="flex-1 overflow-y-auto">
          {activeTab === "table" && (
            <TableEditor
              table={table}
              allTables={draft.tables}
              onChange={handleChange}
            />
          )}
          {activeTab === "indexes" && (
            <div className="flex flex-col gap-3 p-4">
              <button
                onClick={addIndex}
                className="flex items-center gap-1 px-2 py-1 rounded text-xs cursor-default self-start transition-all"
                style={{ color: "var(--accent)", border: "1px solid var(--accent)", background: "var(--accent-soft)" }}
              >
                <Plus size={10} /> Add index
              </button>
              {tableIndexes.length === 0 && (
                <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>
                  No indexes on this table yet.
                </p>
              )}
              {tableIndexes.map((idx) => (
                <div
                  key={idx.id}
                  className="rounded flex flex-col"
                  style={{ border: "1px solid var(--border)", background: "var(--bg-2)" }}
                >
                  <div
                    className="flex items-center justify-between px-3 py-1.5"
                    style={{ borderBottom: "1px solid var(--border)" }}
                  >
                    <span className="text-[10px] font-mono font-semibold" style={{ color: "var(--fg-muted)" }}>
                      {idx.name || "(unnamed index)"}
                      {idx.unique && <span className="ml-1.5 text-[9px] uppercase" style={{ color: "var(--accent)" }}>UNIQUE</span>}
                    </span>
                    <button
                      onClick={() => removeIndex(idx.id)}
                      className="text-xs px-1.5 py-0.5 rounded cursor-default opacity-60 hover:opacity-100"
                      style={{ color: "var(--danger)" }}
                    >
                      ×
                    </button>
                  </div>
                  <IndexEditor
                    index={idx}
                    allTables={draft.tables}
                    onChange={(patch) => updateIndex(idx.id, patch)}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
