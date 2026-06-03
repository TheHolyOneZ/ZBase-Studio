import { commitTxn, rollbackTxn } from "../../ipc/commands";
import { useStore } from "../../store";
import { extractError } from "../../lib/extractError";
import { useState } from "react";
import Spinner from "../common/Spinner";

interface TransactionBarProps {
  tabId: string;
}

export default function TransactionBar({ tabId }: TransactionBarProps) {
  const { setTabDirtyTxn, addToast } = useStore();
  const [busy, setBusy] = useState(false);

  async function handleCommit() {
    setBusy(true);
    try {
      await commitTxn(tabId);
      setTabDirtyTxn(tabId, false);
      addToast({ type: "success", message: "Transaction committed" });
    } catch (e) {
      addToast({ type: "error", message: extractError(e) });
    } finally {
      setBusy(false);
    }
  }

  async function handleRollback() {
    setBusy(true);
    try {
      await rollbackTxn(tabId);
      setTabDirtyTxn(tabId, false);
      addToast({ type: "info", message: "Transaction rolled back" });
    } catch (e) {
      addToast({ type: "error", message: extractError(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="flex items-center gap-3 px-4 py-2 shrink-0 text-sm"
      style={{
        background: "rgba(224,165,58,0.08)",
        borderTop: "1px solid rgba(224,165,58,0.2)",
        color: "#E0A53A",
      }}
    >
      {busy ? <Spinner size={14} /> : <span className="w-2 h-2 rounded-full animate-pulse" style={{ background: "#E0A53A" }} />}
      <span className="text-xs font-medium">Transaction open</span>
      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={handleRollback}
          disabled={busy}
          className="text-xs px-2.5 py-1 rounded-[var(--r-sm)] cursor-default disabled:opacity-40"
          style={{ border: "1px solid rgba(224,165,58,0.3)", color: "#E0A53A" }}
        >
          Rollback
        </button>
        <button
          onClick={handleCommit}
          disabled={busy}
          className="text-xs px-2.5 py-1 rounded-[var(--r-sm)] cursor-default disabled:opacity-40 font-medium"
          style={{ background: "#E0A53A", color: "#0B0F14" }}
        >
          Commit
        </button>
      </div>
    </div>
  );
}
