import { useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Search, X } from "lucide-react";
import { startFullSearch, startPgFullSearch, startMysqlFullSearch, cancelJob } from "../../ipc/commands";
import { onSearchHit, onSearchDone, onSearchError } from "../../ipc/events";
import { useStore } from "../../store";
import Spinner from "../common/Spinner";
import { cellDisplay } from "../../lib/cellCoerce";
import { extractError } from "../../lib/extractError";

interface FullDbSearchPanelProps {
  tabId: string;
}

const MAX_HITS = 10_000;

export default function FullDbSearchPanel({ tabId }: FullDbSearchPanelProps) {
  const {
    searchJobId, searchHits, searchRunning,
    setSearchJobId, appendSearchHits, clearSearchHits, setSearchRunning,
    addToast, tabs,
  } = useStore();

  const engine = tabs.find((t) => t.id === tabId)?.engine ?? "sqlite";
  const [needle, setNeedle] = useState("");
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);

  const jobId = searchJobId[tabId] ?? null;
  const hits = searchHits[tabId] ?? [];
  const running = searchRunning[tabId] ?? false;

  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: hits.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 10,
  });

  async function handleSearch() {
    if (!needle.trim()) return;
    clearSearchHits(tabId);
    setSearchRunning(tabId, true);

    const jid = crypto.randomUUID();
    setSearchJobId(tabId, jid);

    try {
      const cleanup = () => { unsub1(); unsub2(); unsub3(); };
      const unsub1 = await onSearchHit(jid, (newHits) => appendSearchHits(tabId, newHits));
      const unsub2 = await onSearchDone(jid, () => { setSearchRunning(tabId, false); cleanup(); });
      const unsub3 = await onSearchError(jid, (msg) => {
        setSearchRunning(tabId, false);
        addToast({ type: "error", message: `Search error: ${msg}` });
        cleanup();
      });

      const opts = { case_sensitive: caseSensitive, use_regex: useRegex, tables: null };

      if (engine === "postgres") {
        await startPgFullSearch(tabId, jid, needle, opts);
      } else if (engine === "mysql" || engine === "mariadb") {
        await startMysqlFullSearch(tabId, jid, needle, opts);
      } else {
        await startFullSearch(tabId, jid, needle, opts);
      }
    } catch (e) {
      setSearchRunning(tabId, false);
      addToast({ type: "error", message: extractError(e) });
    }
  }

  async function handleCancel() {
    if (jobId) {
      await cancelJob(jobId).catch(() => {});
      setSearchRunning(tabId, false);
    }
  }

  const totalH = rowVirtualizer.getTotalSize();

  return (
    <div className="flex flex-col h-full">

      <div
        className="flex items-center gap-2 p-3 shrink-0"
        style={{ borderBottom: "1px solid var(--border)" }}
      >
        <div className="flex-1 flex items-center gap-2 rounded-[var(--r-sm)] px-2.5 py-1.5" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
          <Search size={13} style={{ color: "var(--fg-subtle)", flexShrink: 0 }} />
          <input
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: "var(--fg-0)" }}
            placeholder="Search all tables…"
            value={needle}
            onChange={(e) => setNeedle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
          />
          {needle && (
            <button onClick={() => setNeedle("")}><X size={12} style={{ color: "var(--fg-subtle)" }} /></button>
          )}
        </div>

        <button
          onClick={() => setCaseSensitive((v) => !v)}
          title="Case sensitive"
          className="px-2 py-1 rounded text-xs font-mono font-semibold cursor-default transition-all"
          style={{
            background: caseSensitive ? "var(--accent)" : "var(--bg-2)",
            color: caseSensitive ? "#0B0F14" : "var(--fg-muted)",
            border: `1px solid ${caseSensitive ? "var(--accent)" : "var(--border)"}`,
          }}
        >
          Aa
        </button>
        <button
          onClick={() => setUseRegex((v) => !v)}
          title="Regular expression"
          className="px-2 py-1 rounded text-xs font-mono font-semibold cursor-default transition-all"
          style={{
            background: useRegex ? "var(--accent)" : "var(--bg-2)",
            color: useRegex ? "#0B0F14" : "var(--fg-muted)",
            border: `1px solid ${useRegex ? "var(--accent)" : "var(--border)"}`,
          }}
        >
          .*
        </button>

        {running ? (
          <button onClick={handleCancel} className="flex items-center gap-1.5 text-xs px-2 py-1 rounded cursor-default" style={{ color: "var(--danger)" }}>
            <Spinner size={12} />
            Cancel
          </button>
        ) : (
          <button
            onClick={handleSearch}
            disabled={!needle.trim()}
            className="text-xs px-2.5 py-1 rounded-[var(--r-sm)] font-medium disabled:opacity-40 cursor-default"
            style={{ background: "var(--accent)", color: "#0B0F14" }}
          >
            Search
          </button>
        )}
      </div>


      <div ref={parentRef} className="flex-1 overflow-y-auto">
        {hits.length === 0 && !running && (
          <div className="flex items-center justify-center py-12 text-xs" style={{ color: "var(--fg-subtle)" }}>
            {needle ? "No results" : "Enter a search term"}
          </div>
        )}

        {hits.length > 0 && (
          <div style={{ height: totalH, position: "relative" }}>
            {rowVirtualizer.getVirtualItems().map((vr) => {
              const hit = hits[vr.index];
              return (
                <div
                  key={vr.key}
                  className="flex items-center gap-3 px-4 text-xs hover:bg-[var(--bg-2)] transition-colors"
                  style={{
                    position: "absolute", top: 0, left: 0, width: "100%",
                    height: vr.size, transform: `translateY(${vr.start}px)`,
                    borderBottom: "1px solid rgba(255,255,255,0.03)",
                  }}
                >
                  <span className="font-medium" style={{ color: "var(--accent)" }}>{hit.table}</span>
                  <span style={{ color: "var(--fg-subtle)" }}>·</span>
                  <span style={{ color: "var(--fg-muted)" }}>{hit.column}</span>
                  <span style={{ color: "var(--fg-subtle)" }}>row {hit.row_index + 1}</span>
                  <span className="ml-auto truncate max-w-48" style={{ color: "var(--fg-0)" }}>{cellDisplay(hit.value)}</span>
                </div>
              );
            })}
          </div>
        )}

        {running && hits.length > 0 && (
          <div className="flex items-center gap-2 px-4 py-2 text-xs" style={{ color: "var(--fg-subtle)" }}>
            <Spinner size={12} />
            Searching…
          </div>
        )}
      </div>

      {hits.length > 0 && (
        <div className="px-4 py-1.5 shrink-0 text-[11px]" style={{ borderTop: "1px solid var(--border)", color: "var(--fg-subtle)" }}>
          {hits.length >= MAX_HITS ? `${MAX_HITS.toLocaleString()}+ hits (capped)` : `${hits.length} hit${hits.length !== 1 ? "s" : ""}`}
        </div>
      )}
    </div>
  );
}
