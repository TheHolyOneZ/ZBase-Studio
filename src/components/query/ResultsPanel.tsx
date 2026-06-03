import { useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { QueryResult } from "../../types/ipc";
import { cellDisplay, isNull } from "../../lib/cellCoerce";
import Spinner from "../common/Spinner";
import { CheckCircle, AlertCircle, Clock } from "lucide-react";

const DDL_RE = /^\s*(CREATE|DROP|ALTER|PRAGMA|ATTACH|DETACH|VACUUM|ANALYZE|REINDEX|BEGIN|COMMIT|ROLLBACK|SAVEPOINT|RELEASE)\b/i;

interface ResultsPanelProps {
  result: QueryResult | null;
  error: string | null;
  loading: boolean;
  sql?: string;
}

export default function ResultsPanel({ result, error, loading, sql = "" }: ResultsPanelProps) {
  const parentRef = useRef<HTMLDivElement>(null);

  const rowVirtualizer = useVirtualizer({
    count: result?.rows.length ?? 0,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 28,
    overscan: 8,
  });

  const COL_W = 140;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-40">
        <Spinner size={20} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-sm" style={{ color: "var(--danger)", background: "rgba(248,113,113,0.08)", borderTop: "1px solid var(--border)" }}>
        <AlertCircle size={14} />
        <span>{error}</span>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="flex items-center justify-center h-24 text-xs" style={{ color: "var(--fg-subtle)" }}>
        Run a query to see results
      </div>
    );
  }

  if (result.columns.length === 0) {
    const isDdl = DDL_RE.test(sql);
    const label = isDdl
      ? "OK — statement executed"
      : `${result.rows_affected} row${result.rows_affected !== 1 ? "s" : ""} affected`;
    return (
      <div className="flex items-center gap-2 px-4 py-3 text-sm" style={{ color: "var(--success)", borderTop: "1px solid var(--border)" }}>
        <CheckCircle size={14} />
        <span>{label}</span>
        <span className="ml-2 text-xs flex items-center gap-1" style={{ color: "var(--fg-subtle)" }}>
          <Clock size={10} />
          {result.duration_ms}ms
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col" style={{ height: 260, borderTop: "1px solid var(--border)" }}>
      <div
        className="flex items-center gap-3 px-3 py-1 shrink-0 text-[11px]"
        style={{ borderBottom: "1px solid var(--border)", color: "var(--fg-subtle)", background: "var(--bg-1)" }}
      >
        <span>{result.rows.length} row{result.rows.length !== 1 ? "s" : ""}</span>
        <span className="flex items-center gap-1"><Clock size={10} />{result.duration_ms}ms</span>
      </div>


      <div className="flex shrink-0 text-[11px] font-semibold" style={{ background: "var(--bg-1)", color: "var(--fg-subtle)", borderBottom: "1px solid var(--border)" }}>
        {result.columns.map((col, i) => (
          <div key={i} className="px-2 py-1 border-r border-[var(--border)] truncate" style={{ width: COL_W, minWidth: 60, flexShrink: 0 }}>
            {col}
          </div>
        ))}
      </div>


      <div ref={parentRef} className="flex-1 overflow-auto">
        <div style={{ height: rowVirtualizer.getTotalSize(), position: "relative" }}>
          {rowVirtualizer.getVirtualItems().map((vr) => {
            const row = result.rows[vr.index];
            return (
              <div
                key={vr.key}
                className="flex absolute left-0 right-0 hover:bg-[var(--bg-2)]"
                style={{ height: vr.size, transform: `translateY(${vr.start}px)`, borderBottom: "1px solid rgba(255,255,255,0.03)" }}
              >
                {row.map((cell, ci) => (
                  <div
                    key={ci}
                    className="px-2 flex items-center text-xs border-r border-[var(--border)] overflow-hidden"
                    style={{ width: COL_W, minWidth: 60, flexShrink: 0, color: isNull(cell) ? "var(--fg-subtle)" : "var(--fg-0)", fontStyle: isNull(cell) ? "italic" : undefined }}
                  >
                    <span className="truncate">{cellDisplay(cell)}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
