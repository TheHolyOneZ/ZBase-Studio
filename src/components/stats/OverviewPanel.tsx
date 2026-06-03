import { useState } from "react";
import { computeOverview, computePgOverview, computeMysqlOverview } from "../../ipc/commands";
import { useStore } from "../../store";
import { formatBytes, formatCount } from "../../lib/filesize";
import { extractError } from "../../lib/extractError";
import Spinner from "../common/Spinner";
import Button from "../common/Button";
import { RefreshCw, CheckCircle, AlertTriangle } from "lucide-react";
import type { PgOverview, MysqlOverview } from "../../types/ipc";

interface OverviewPanelProps {
  tabId: string;
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div
      className="rounded-[var(--r-md)] p-3 flex flex-col gap-1"
      style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
    >
      <span className="text-[10px] uppercase tracking-wide font-semibold" style={{ color: "var(--fg-subtle)" }}>{label}</span>
      <span className="text-lg font-bold" style={{ color: "var(--fg-0)" }}>{value}</span>
      {sub && <span className="text-xs" style={{ color: "var(--fg-subtle)" }}>{sub}</span>}
    </div>
  );
}

export default function OverviewPanel({ tabId }: OverviewPanelProps) {
  const { overviews, setOverview, pgOverviews, setPgOverview, mysqlOverviews, setMysqlOverview, addToast, tabs } = useStore();
  const engine = tabs.find((t) => t.id === tabId)?.engine ?? "sqlite";
  const [loading, setLoading] = useState(false);

  const sqliteOverview = overviews[tabId];
  const pgOverview = pgOverviews[tabId] as PgOverview | undefined;
  const mysqlOverview = mysqlOverviews[tabId] as MysqlOverview | undefined;

  async function refresh() {
    setLoading(true);
    try {
      if (engine === "postgres") {
        const result = await computePgOverview(tabId);
        setPgOverview(tabId, result);
      } else if (engine === "mysql" || engine === "mariadb") {
        const result = await computeMysqlOverview(tabId);
        setMysqlOverview(tabId, result);
      } else {
        const result = await computeOverview(tabId);
        setOverview(tabId, result);
      }
    } catch (e) {
      addToast({ type: "error", message: `Stats error: ${extractError(e)}` });
    } finally {
      setLoading(false);
    }
  }

  const hasData = engine === "postgres" ? !!pgOverview
    : engine === "mysql" || engine === "mariadb" ? !!mysqlOverview
    : !!sqliteOverview;

  return (
    <div className="flex flex-col h-full p-4 gap-4 overflow-y-auto">
      <div className="flex items-center justify-between shrink-0">
        <h2 className="text-sm font-semibold" style={{ color: "var(--fg-0)" }}>Database Overview</h2>
        <Button size="sm" variant="ghost" onClick={refresh} disabled={loading}>
          {loading ? <Spinner size={12} /> : <RefreshCw size={12} />}
          Refresh
        </Button>
      </div>

      {!hasData && !loading && (
        <div className="flex items-center justify-center py-12 text-xs" style={{ color: "var(--fg-subtle)" }}>
          Click Refresh to compute stats
        </div>
      )}

      {loading && !hasData && (
        <div className="flex items-center justify-center py-12">
          <Spinner size={24} />
        </div>
      )}


      {engine === "postgres" && pgOverview && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="DB Size" value={formatBytes(pgOverview.db_size_bytes)} />
            <StatCard label="Tables" value={pgOverview.tables.length.toLocaleString()} />
            <StatCard label="Total Rows (est.)" value={formatCount(pgOverview.tables.reduce((s, t) => s + t.rows, 0))} />
            <StatCard label="Dead Tuples" value={formatCount(pgOverview.dead_tuples_total)} sub="Run VACUUM to reclaim" />
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--fg-subtle)" }}>
              Tables ({pgOverview.tables.length})
            </h3>
            <div className="flex flex-col gap-1">
              {pgOverview.tables.map((t) => (
                <div
                  key={`${t.schema}.${t.name}`}
                  className="flex items-center justify-between px-3 py-1.5 rounded-[var(--r-sm)] text-xs gap-2"
                  style={{ background: "var(--bg-2)" }}
                >
                  <span style={{ color: "var(--fg-subtle)", flexShrink: 0 }}>{t.schema}.</span>
                  <span style={{ color: "var(--fg-0)", flex: 1 }}>{t.name}</span>
                  <span style={{ color: "var(--fg-subtle)" }}>{formatCount(t.rows)} rows</span>
                  <span style={{ color: "var(--fg-subtle)" }}>{formatBytes(t.size_bytes)}</span>
                  <span style={{ color: "var(--fg-subtle)" }}>idx {formatBytes(t.index_size_bytes)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}


      {(engine === "mysql" || engine === "mariadb") && mysqlOverview && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label="Charset" value={mysqlOverview.default_charset} />
            <StatCard label="Tables" value={mysqlOverview.tables.length.toLocaleString()} />
            <StatCard label="Total Rows (est.)" value={formatCount(mysqlOverview.tables.reduce((s, t) => s + t.rows, 0))} />
            <StatCard label="Total Data" value={formatBytes(mysqlOverview.tables.reduce((s, t) => s + t.data_length, 0))} />
          </div>
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--fg-subtle)" }}>
              Tables ({mysqlOverview.tables.length})
            </h3>
            <div className="flex flex-col gap-1">
              {mysqlOverview.tables.map((t) => (
                <div
                  key={`${t.schema}.${t.name}`}
                  className="flex items-center justify-between px-3 py-1.5 rounded-[var(--r-sm)] text-xs gap-2"
                  style={{ background: "var(--bg-2)" }}
                >
                  <span style={{ color: "var(--fg-0)", flex: 1 }}>{t.name}</span>
                  <span style={{ color: "var(--fg-subtle)" }}>{t.engine}</span>
                  <span style={{ color: "var(--fg-subtle)" }}>{formatCount(t.rows)} rows</span>
                  <span style={{ color: "var(--fg-subtle)" }}>{formatBytes(t.data_length)}</span>
                  <span style={{ color: "var(--fg-subtle)" }}>idx {formatBytes(t.index_length)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}


      {engine === "sqlite" && sqliteOverview && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="Total Pages"
              value={sqliteOverview.page_count.toLocaleString()}
              sub={`${formatBytes(sqliteOverview.page_count * sqliteOverview.page_size)} on disk`}
            />
            <StatCard
              label="Free Pages"
              value={sqliteOverview.free_pages.toLocaleString()}
              sub={`${formatBytes(sqliteOverview.free_pages * sqliteOverview.page_size)} reclaimable`}
            />
            <StatCard label="Page Size" value={formatBytes(sqliteOverview.page_size)} />
            <StatCard label="Journal" value={sqliteOverview.journal_mode.toUpperCase()} />
          </div>

          <div
            className="flex items-center gap-2 rounded-[var(--r-md)] px-3 py-2 text-sm"
            style={{
              background: sqliteOverview.integrity_ok ? "rgba(46,189,133,0.08)" : "rgba(248,113,113,0.08)",
              border: `1px solid ${sqliteOverview.integrity_ok ? "rgba(46,189,133,0.2)" : "rgba(248,113,113,0.2)"}`,
              color: sqliteOverview.integrity_ok ? "var(--success)" : "var(--danger)",
            }}
          >
            {sqliteOverview.integrity_ok ? <CheckCircle size={14} /> : <AlertTriangle size={14} />}
            <span className="font-medium">
              {sqliteOverview.integrity_ok ? "Integrity check passed" : `${sqliteOverview.integrity_errors.length} integrity error(s)`}
            </span>
          </div>

          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "var(--fg-subtle)" }}>
              Tables ({sqliteOverview.tables.length})
            </h3>
            <div className="flex flex-col gap-1">
              {sqliteOverview.tables.map((t) => (
                <div
                  key={t.name}
                  className="flex items-center justify-between px-3 py-1.5 rounded-[var(--r-sm)] text-xs"
                  style={{ background: "var(--bg-2)" }}
                >
                  <span style={{ color: "var(--fg-0)" }}>{t.name}</span>
                  <span style={{ color: "var(--fg-subtle)" }}>{formatCount(t.row_count)} rows</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
