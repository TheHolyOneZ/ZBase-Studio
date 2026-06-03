import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Pencil, PencilOff, Plus, Trash2, Download, Check, X, Copy, Rows3, ChevronUp, ChevronDown, ChevronsUpDown, Filter } from "lucide-react";
import { engineRowOps } from "../../lib/engineOps";
import type { RowPage } from "../../types/ipc";
import type { SortSpec, RowFilter } from "../../types/domain";
import { cellDisplay, isNull } from "../../lib/cellCoerce";
import Spinner from "../common/Spinner";
import EmptyState from "../common/EmptyState";
import ExportDialog from "../export/ExportDialog";
import ColumnFilterPopup from "./ColumnFilterPopup";
import { useStore } from "../../store";
import { extractError } from "../../lib/extractError";

interface DataGridProps {
  tabId: string;
  table: string;
  readOnly?: boolean;
}

const PAGE_SIZE = 200;
const COL_MIN_W = 80;
const COL_DEFAULT_W = 160;

function coerceInput(value: string, declType: string | undefined): unknown {
  if (value === "") return null;
  const t = (declType ?? "").toUpperCase();
  if (t.includes("INT") || t === "SERIAL" || t === "BIGSERIAL" || t === "SMALLSERIAL") {
    const n = parseInt(value, 10);
    return isNaN(n) ? value : n;
  }
  if (t.includes("REAL") || t.includes("FLOAT") || t.includes("DOUBLE") ||
      t.includes("NUMERIC") || t.includes("DECIMAL")) {
    const n = parseFloat(value);
    return isNaN(n) ? value : n;
  }
  return value;
}

export default function DataGrid({ tabId, table, readOnly = false }: DataGridProps) {
  const { schemas, addToast, openContextMenu, tabs, setSchema } = useStore();
  const engine = tabs.find((t) => t.id === tabId)?.engine ?? "sqlite";
  const ops = engineRowOps(engine);

  async function refreshSchema() {
    try {
      setSchema(tabId, await ops.getSchema(tabId));
    } catch {  }
  }
  const [page, setPage] = useState<RowPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [sort, setSort] = useState<SortSpec | null>(null);
  const [filters, setFilters] = useState<RowFilter[]>([]);
  const [openPopupCol, setOpenPopupCol] = useState<string | null>(null);
  const [popupAnchor, setPopupAnchor] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const parentRef = useRef<HTMLDivElement>(null);


  const [editMode, setEditMode] = useState(false);
  const [editingCell, setEditingCell] = useState<{ row: number; col: number } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [newRow, setNewRow] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const editInputRef = useRef<HTMLInputElement>(null);
  const newRowFirstRef = useRef<HTMLInputElement>(null);


  const committingRef = useRef(false);


  const tableSchema = schemas[tabId]?.tables.find((t) => t.name === table);
  const pkCols = tableSchema?.columns
    .filter((c) => c.pk > 0)
    .sort((a, b) => a.pk - b.pk) ?? [];


  const loadPage = useCallback(async (off: number) => {
    setLoading(true);
    setError(null);
    try {
      const args = { tab_id: tabId, table, offset: off, page_size: PAGE_SIZE, filters, sort };
      const result = await ops.getRows(args);
      setPage(result);
      setOffset(off);
    } catch (e) {
      setError(extractError(e));
    } finally {
      setLoading(false);
    }

  }, [tabId, table, sort, filters]);

  useEffect(() => {
    setPage(null);
    setOffset(0);
    setEditMode(false);
    setEditingCell(null);
    setSelectedRows(new Set());
    setNewRow(null);
    setSort(null);
    setFilters([]);
    setOpenPopupCol(null);

  }, [tabId, table]);

  useEffect(() => {
    loadPage(0);
  }, [loadPage]);


  useLayoutEffect(() => {
    if (editingCell) editInputRef.current?.focus();
  }, [editingCell]);

  const newRowWasNullRef = useRef(true);
  useLayoutEffect(() => {
    if (newRow !== null && newRowWasNullRef.current) {
      newRowFirstRef.current?.focus();
    }
    newRowWasNullRef.current = newRow === null;
  }, [newRow]);


  const rowVirtualizer = useVirtualizer({
    count: page?.rows.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 32,
    overscan: 10,
  });


  function pkSpec(rowIdx: number, cols: RowPage["columns"]) {
    const row = page!.rows[rowIdx];
    if (pkCols.length > 0) {
      return {
        pk_columns: pkCols.map((c) => c.name),
        pk_values: pkCols.map((c) => {
          const ci = cols.findIndex((x) => x.name === c.name);
          return ci >= 0 ? row[ci] : null;
        }),
      };
    }

    return {
      pk_columns: cols.map((c) => c.name),
      pk_values: [...row],
    };
  }

  function startCellEdit(rowIdx: number, colIdx: number) {
    if (!editMode || busy || committingRef.current) return;
    const raw = page!.rows[rowIdx][colIdx];
    setEditingCell({ row: rowIdx, col: colIdx });
    setEditValue(raw == null ? "" : String(raw));
  }

  async function commitCellEdit(rowIdx: number, colIdx: number) {
    if (!page || committingRef.current) return;
    const cols = page.columns;
    const colName = cols[colIdx].name;
    const coerced = coerceInput(editValue, cols[colIdx].decl_type);
    const { pk_columns, pk_values } = pkSpec(rowIdx, cols);

    committingRef.current = true;
    try {
      setBusy(true);
      const editReq = { tab_id: tabId, table, pk_columns, pk_values, changes: { [colName]: coerced } };
      await ops.applyRowEdit(editReq);
      setPage((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          rows: prev.rows.map((r, i) =>
            i === rowIdx ? r.map((cell, j) => (j === colIdx ? coerced : cell)) : r,
          ),
        };
      });
    } catch (e) {
      addToast({ type: "error", message: `Edit failed: ${extractError(e)}` });
    } finally {
      committingRef.current = false;
      setBusy(false);
      setEditingCell(null);
    }
  }

  function cancelCellEdit() {
    setEditingCell(null);
    setEditValue("");
  }

  async function handleDeleteSelected() {
    if (!page || selectedRows.size === 0) return;
    const cols = page.columns;
    const pkCNames = pkCols.length > 0
      ? pkCols.map((c) => c.name)
      : cols.map((c) => c.name);

    const pkValuesList = [...selectedRows].map((ri) => {
      const row = page.rows[ri];
      return pkCNames.map((name) => {
        const ci = cols.findIndex((c) => c.name === name);
        return ci >= 0 ? row[ci] : null;
      });
    });

    try {
      setBusy(true);
      const delReq = { tab_id: tabId, table, pk_columns: pkCNames, pk_values_list: pkValuesList };
      await ops.deleteRows(delReq);
      setSelectedRows(new Set());
      await Promise.all([loadPage(offset), refreshSchema()]);
      addToast({ type: "success", message: `Deleted ${pkValuesList.length} row${pkValuesList.length !== 1 ? "s" : ""}` });
    } catch (e) {
      addToast({ type: "error", message: `Delete failed: ${extractError(e)}` });
    } finally {
      setBusy(false);
    }
  }

  async function handleInsertRow() {
    if (!newRow || !page) return;
    const values: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(newRow)) {
      if (v === "") continue;
      const col = page.columns.find((c) => c.name === k);
      values[k] = coerceInput(v, col?.decl_type);
    }
    if (Object.keys(values).length === 0) {
      setNewRow(null);
      return;
    }
    try {
      setBusy(true);
      const insReq = { tab_id: tabId, table, values };
      await ops.insertRow(insReq);
      setNewRow(null);
      await Promise.all([loadPage(offset), refreshSchema()]);
      addToast({ type: "success", message: "Row inserted" });
    } catch (e) {
      addToast({ type: "error", message: `Insert failed: ${extractError(e)}` });
    } finally {
      setBusy(false);
    }
  }

  function handleCellContextMenu(e: React.MouseEvent, rowIdx: number, colIdx: number) {
    e.preventDefault();
    if (!page) return;
    const cell = page.rows[rowIdx][colIdx];
    const row = page.rows[rowIdx];
    openContextMenu(e.clientX, e.clientY, [
      {
        label: "Copy cell value",
        icon: <Copy size={12} />,
        action: () => navigator.clipboard.writeText(cellDisplay(cell)).catch(() => {}),
      },
      {
        label: "Copy row as JSON",
        icon: <Copy size={12} />,
        action: () => {
          const obj = Object.fromEntries(page.columns.map((c, i) => [c.name, row[i]]));
          navigator.clipboard.writeText(JSON.stringify(obj, null, 2)).catch(() => {});
        },
      },
      {
        label: "Copy row as CSV",
        icon: <Rows3 size={12} />,
        action: () => {
          const csv = row.map((v) => {
            const s = cellDisplay(v);
            return s.includes(",") || s.includes('"') || s.includes("\n")
              ? `"${s.replace(/"/g, '""')}"` : s;
          }).join(",");
          navigator.clipboard.writeText(csv).catch(() => {});
        },
      },
    ]);
  }

  function toggleRowSelect(idx: number) {
    setSelectedRows((prev) => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  function toggleSelectAll() {
    if (!page) return;
    if (selectedRows.size === page.rows.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(page.rows.map((_, i) => i)));
    }
  }

  // ── render guards ─────────────────────────────────────────────────────────
  if (error) return <EmptyState title="Error loading data" description={error} />;
  if (!page && loading) {
    return <div className="flex items-center justify-center flex-1"><Spinner size={24} /></div>;
  }
  if (!page) return null;

  const cols = page.columns;
  const totalH = rowVirtualizer.getTotalSize();
  const checkColW = editMode ? 32 : 0;
  const totalColsWidth = 40 + checkColW + cols.length * COL_DEFAULT_W;
  const allSelected = page.rows.length > 0 && selectedRows.size === page.rows.length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* ── toolbar ── */}
      <div
        className="flex items-center gap-1.5 px-2 py-1.5 shrink-0"
        style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-0)" }}
      >
        {!readOnly && (
          <button
            onClick={() => {
              setEditMode((v) => {
                if (v) { setEditingCell(null); setSelectedRows(new Set()); setNewRow(null); }
                return !v;
              });
            }}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-default transition-all"
            style={{
              background: editMode ? "var(--accent-soft)" : "transparent",
              color: editMode ? "var(--accent)" : "var(--fg-muted)",
              border: `1px solid ${editMode ? "var(--accent)" : "transparent"}`,
            }}
          >
            {editMode ? <PencilOff size={12} /> : <Pencil size={12} />}
            {editMode ? "Exit Edit" : "Edit"}
          </button>
        )}

        {editMode && !readOnly && (
          <>
            <button
              onClick={() => setNewRow(page.columns.reduce((a, c) => ({ ...a, [c.name]: "" }), {}))}
              disabled={newRow !== null || busy}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-default transition-all disabled:opacity-40"
              style={{ color: "var(--fg-muted)", border: "1px solid var(--border)", background: "var(--bg-2)" }}
            >
              <Plus size={12} /> Add Row
            </button>

            {selectedRows.size > 0 && (
              <button
                onClick={handleDeleteSelected}
                disabled={busy}
                className="flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-default transition-all disabled:opacity-40"
                style={{ color: "var(--danger)", border: "1px solid rgba(248,113,113,0.3)", background: "rgba(248,113,113,0.08)" }}
              >
                {busy ? <Spinner size={11} /> : <Trash2 size={12} />}
                Delete ({selectedRows.size})
              </button>
            )}
          </>
        )}

        <div className="ml-auto">
          <button
            onClick={() => setExportOpen(true)}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs cursor-default transition-all"
            style={{ color: "var(--fg-muted)", border: "1px solid var(--border)", background: "var(--bg-2)" }}
          >
            <Download size={12} /> Export
          </button>
        </div>
      </div>

      {/* ── active filter chips ── */}
      {filters.length > 0 && (
        <div className="flex items-center flex-wrap gap-1.5 px-2 py-1 shrink-0"
          style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-1)" }}>
          {filters.map((f) => (
            <span key={f.column}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] cursor-default"
              style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--accent)" }}>
              {f.column} {f.op} {f.value !== null && f.value !== undefined ? String(f.value) : ""}
              <button onClick={() => setFilters((prev) => prev.filter((x) => x.column !== f.column))}
                style={{ color: "var(--accent)", lineHeight: 1 }}>&times;</button>
            </span>
          ))}
          <button onClick={() => setFilters([])}
            className="text-[10px] cursor-default"
            style={{ color: "var(--fg-subtle)" }}>Clear all</button>
        </div>
      )}

      {/* ── column filter popup ── */}
      {openPopupCol && (
        <ColumnFilterPopup
          column={openPopupCol}
          current={filters.find((f) => f.column === openPopupCol) ?? null}
          anchor={popupAnchor}
          onApply={(f) => {
            setFilters((prev) => {
              const next = prev.filter((x) => x.column !== f.column);
              return [...next, f];
            });
            setOpenPopupCol(null);
          }}
          onClear={() => {
            setFilters((prev) => prev.filter((x) => x.column !== openPopupCol));
            setOpenPopupCol(null);
          }}
          onClose={() => setOpenPopupCol(null)}
        />
      )}

      {/* ── scrollable area (header + rows share one scroll container) ── */}
      <div ref={parentRef} className="flex-1 overflow-auto">
        <div style={{ minWidth: totalColsWidth }}>

          {/* ── sticky header ── */}
          <div
            className="sticky top-0 z-10 flex text-[11px] font-semibold select-none"
            style={{ borderBottom: "1px solid var(--border)", background: "var(--bg-1)", color: "var(--fg-subtle)" }}
          >
            {/* Row-number / select-all cell */}
            <div
              className="flex items-center justify-center text-[10px] shrink-0"
              style={{ width: 40 + checkColW }}
            >
              {editMode ? (
                <CheckBox
                  checked={allSelected}
                  indeterminate={selectedRows.size > 0 && !allSelected}
                  onChange={toggleSelectAll}
                />
              ) : "#"}
            </div>
            {cols.map((c, i) => {
              const isSort = sort?.column === c.name;
              const hasFilter = filters.some((f) => f.column === c.name);
              return (
                <div
                  key={i}
                  className="flex items-center px-2 py-1.5 gap-1 border-r border-[var(--border)] overflow-hidden group"
                  style={{ width: COL_DEFAULT_W, minWidth: COL_MIN_W, flexShrink: 0, cursor: "pointer" }}
                  onClick={() => {
                    setSort((prev) => {
                      if (!prev || prev.column !== c.name) return { column: c.name, desc: false };
                      if (!prev.desc) return { column: c.name, desc: true };
                      return null;
                    });
                  }}
                >
                  <span className="truncate flex-1">{c.name}</span>
                  {c.decl_type && (
                    <span className="text-[9px] shrink-0 opacity-50 uppercase">{c.decl_type}</span>
                  )}
                  {isSort ? (
                    sort!.desc ? <ChevronDown size={10} style={{ color: "var(--accent)", flexShrink: 0 }} /> : <ChevronUp size={10} style={{ color: "var(--accent)", flexShrink: 0 }} />
                  ) : (
                    <ChevronsUpDown size={10} style={{ color: "var(--fg-subtle)", flexShrink: 0, opacity: 0 }} className="group-hover:!opacity-60" />
                  )}
                  <button
                    title="Filter this column"
                    onClick={(e) => {
                      e.stopPropagation();
                      const rect = e.currentTarget.getBoundingClientRect();
                      setPopupAnchor({ top: rect.bottom + 4, left: rect.left });
                      setOpenPopupCol((prev) => prev === c.name ? null : c.name);
                    }}
                    style={{
                      padding: "1px 2px",
                      borderRadius: 2,
                      cursor: "default",
                      color: hasFilter ? "var(--accent)" : "var(--fg-subtle)",
                      background: hasFilter ? "var(--accent-soft)" : "transparent",
                      opacity: hasFilter ? 1 : undefined,
                      flexShrink: 0,
                    }}
                    className={hasFilter ? "" : "opacity-0 group-hover:opacity-60"}
                  >
                    <Filter size={9} />
                  </button>
                </div>
              );
            })}
          </div>

          {/* ── virtual rows ── */}
          <div style={{ height: totalH, position: "relative" }}>
            {rowVirtualizer.getVirtualItems().map((vr) => {
              const row = page.rows[vr.index];
              const isSelected = selectedRows.has(vr.index);
              return (
                <div
                  key={vr.key}
                  className="flex items-stretch absolute left-0 transition-colors"
                  style={{
                    width: "100%",
                    height: vr.size,
                    transform: `translateY(${vr.start}px)`,
                    borderBottom: "1px solid rgba(255,255,255,0.03)",
                    background: isSelected
                      ? "rgba(34,211,238,0.07)"
                      : "transparent",
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "var(--bg-2)";
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) (e.currentTarget as HTMLDivElement).style.background = "transparent";
                  }}
                >
                  {/* Row # / checkbox */}
                  <div
                    className="shrink-0 flex items-center justify-center text-[10px]"
                    style={{ width: 40 + checkColW, color: "var(--fg-subtle)" }}
                    onClick={() => editMode && toggleRowSelect(vr.index)}
                  >
                    {editMode ? (
                      <CheckBox checked={isSelected} onChange={() => toggleRowSelect(vr.index)} />
                    ) : (
                      offset + vr.index + 1
                    )}
                  </div>

                  {/* Data cells */}
                  {row.map((cell, ci) => {
                    const isEditing =
                      editingCell?.row === vr.index && editingCell?.col === ci;
                    const nullVal = isNull(cell);
                    return (
                      <div
                        key={ci}
                        className="flex items-center border-r border-[var(--border)] overflow-hidden"
                        style={{
                          width: COL_DEFAULT_W,
                          minWidth: COL_MIN_W,
                          flexShrink: 0,
                          cursor: editMode ? "text" : "default",
                          background: isEditing ? "var(--bg-0)" : "transparent",
                          outline: isEditing ? `1px solid var(--accent)` : "none",
                          outlineOffset: "-1px",
                        }}
                        onClick={() => !isEditing && startCellEdit(vr.index, ci)}
                        onContextMenu={(e) => handleCellContextMenu(e, vr.index, ci)}
                      >
                        {isEditing ? (
                          <input
                            ref={editInputRef}
                            className="w-full h-full px-2 text-xs bg-transparent outline-none"
                            style={{ color: "var(--fg-0)" }}
                            value={editValue}
                            onChange={(e) => setEditValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") { e.preventDefault(); commitCellEdit(vr.index, ci); }
                              if (e.key === "Escape") cancelCellEdit();
                              if (e.key === "Tab") {
                                e.preventDefault();
                                commitCellEdit(vr.index, ci).then(() => {
                                  const nextCol = ci + 1;
                                  if (nextCol < cols.length) startCellEdit(vr.index, nextCol);
                                });
                              }
                            }}
                            onBlur={() => commitCellEdit(vr.index, ci)}
                          />
                        ) : (
                          <span
                            className="truncate px-2 text-xs"
                            style={{
                              color: nullVal ? "var(--fg-subtle)" : "var(--fg-0)",
                              fontStyle: nullVal ? "italic" : undefined,
                            }}
                          >
                            {cellDisplay(cell)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>

          {/* ── new row composer (outside virtualizer, inside scroll container) ── */}
          {newRow && (
            <div
              className="flex items-stretch"
              style={{ borderBottom: "1px solid var(--border)", background: "rgba(34,211,238,0.05)", minHeight: 32 }}
            >
              <div
                className="shrink-0 flex items-center justify-center text-[10px]"
                style={{ width: 40 + checkColW, color: "var(--accent)" }}
              >
                <Plus size={11} />
              </div>
              {cols.map((col, ci) => (
                <div
                  key={ci}
                  className="flex items-center border-r border-[var(--border)]"
                  style={{ width: COL_DEFAULT_W, minWidth: COL_MIN_W, flexShrink: 0 }}
                >
                  <input
                    ref={ci === 0 ? newRowFirstRef : undefined}
                    className="w-full h-full px-2 text-xs bg-transparent outline-none"
                    style={{ color: "var(--fg-0)" }}
                    placeholder={col.name}
                    value={newRow[col.name] ?? ""}
                    onChange={(e) => setNewRow((prev) => prev ? { ...prev, [col.name]: e.target.value } : prev)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleInsertRow();
                      if (e.key === "Escape") setNewRow(null);
                    }}
                  />
                </div>
              ))}
              {/* Confirm / cancel buttons */}
              <div className="flex items-center gap-1 px-2 shrink-0">
                <button
                  onClick={handleInsertRow}
                  disabled={busy}
                  className="p-1 rounded cursor-default transition-all"
                  style={{ color: "var(--accent)" }}
                  title="Insert row (Enter)"
                >
                  {busy ? <Spinner size={12} /> : <Check size={13} />}
                </button>
                <button
                  onClick={() => setNewRow(null)}
                  className="p-1 rounded cursor-default transition-all"
                  style={{ color: "var(--fg-subtle)" }}
                  title="Cancel (Esc)"
                >
                  <X size={13} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── pager ── */}
      <div
        className="flex items-center justify-between px-3 py-1.5 shrink-0 text-[11px]"
        style={{ borderTop: "1px solid var(--border)", color: "var(--fg-subtle)" }}
      >
        <div className="flex items-center gap-3">
          {loading && <Spinner size={12} />}
          <span>
            {offset + 1}–{Math.min(offset + PAGE_SIZE, offset + page.rows.length)} of ~{page.total_estimate.toLocaleString()}
          </span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => loadPage(Math.max(0, offset - PAGE_SIZE))}
            disabled={offset === 0 || loading}
            className="px-2 py-0.5 rounded text-[11px] disabled:opacity-30 cursor-default transition-colors"
            style={{ color: "var(--fg-muted)", border: "1px solid var(--border)", background: "var(--bg-2)" }}
          >
            ‹ Prev
          </button>
          <button
            onClick={() => page.next_offset !== null && loadPage(page.next_offset)}
            disabled={page.next_offset === null || loading}
            className="px-2 py-0.5 rounded text-[11px] disabled:opacity-30 cursor-default transition-colors"
            style={{ color: "var(--fg-muted)", border: "1px solid var(--border)", background: "var(--bg-2)" }}
          >
            Next ›
          </button>
        </div>
      </div>

      <ExportDialog
        open={exportOpen}
        onClose={() => setExportOpen(false)}
        tabId={tabId}
        table={table}
      />
    </div>
  );
}

// ── tiny checkbox component ───────────────────────────────────────────────────
function CheckBox({
  checked,
  indeterminate,
  onChange,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    // nothing needed — visual handled by render
  }, [indeterminate]);

  return (
    <button
      ref={ref}
      onClick={(e) => { e.stopPropagation(); onChange(); }}
      className="w-3.5 h-3.5 rounded-sm flex items-center justify-center shrink-0 cursor-default transition-all"
      style={{
        background: checked || indeterminate ? "var(--accent)" : "var(--bg-0)",
        border: `1px solid ${checked || indeterminate ? "var(--accent)" : "var(--border)"}`,
      }}
    >
      {indeterminate && !checked ? (
        <span style={{ width: 7, height: 1.5, background: "#0B0F14", borderRadius: 1, display: "block" }} />
      ) : checked ? (
        <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
          <path d="M1 3.5L3.5 6L8 1" stroke="#0B0F14" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </button>
  );
}
