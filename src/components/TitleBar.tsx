import { useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { Minus, Square, X, Info } from "lucide-react";
import { useStore } from "../store";
import AboutModal from "./AboutModal";
import logoUrl from "../assets/logo.png";

export default function TitleBar() {
  const win = getCurrentWebviewWindow();
  const { tabs, activeTabId } = useStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);
  const hasDirtyTxn = activeTab?.dirtyTxn ?? false;
  const [aboutOpen, setAboutOpen] = useState(false);

  return (
    <div
      data-tauri-drag-region
      className="flex items-center justify-between h-10 px-3 shrink-0 select-none"
      style={{
        background: "rgba(11,15,20,0.8)",
        borderBottom: "1px solid var(--border)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
      }}
    >
      <div data-tauri-drag-region className="flex items-center gap-2">
        <img
          src={logoUrl}
          alt="ZBase Studio"
          style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0 }}
          draggable={false}
        />
        <span
          className="text-[11px] font-bold tracking-[0.18em] uppercase"
          style={{ color: "var(--fg-muted)" }}
        >
          ZBase Studio
        </span>
        {hasDirtyTxn && (
          <span
            className="text-[10px] font-semibold px-1.5 py-0.5 rounded"
            style={{ background: "rgba(224,165,58,0.15)", color: "#E0A53A" }}
          >
            TXN OPEN
          </span>
        )}
      </div>

      <div className="flex items-center gap-0.5">
        <button
          aria-label="About ZBase Studio"
          onClick={() => setAboutOpen(true)}
          className="w-7 h-7 rounded-[var(--r-sm)] flex items-center justify-center transition-all duration-150 cursor-default"
          style={{ color: "var(--fg-subtle)" }}
          onMouseEnter={(e) => { e.currentTarget.style.background = "var(--bg-2)"; e.currentTarget.style.color = "var(--accent)"; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "var(--fg-subtle)"; }}
        >
          <Info size={12} />
        </button>

        <div style={{ width: 1, height: 14, background: "var(--border)", margin: "0 2px" }} />

        {(
          [
            { label: "Minimize", action: () => win.minimize(), icon: <Minus size={11} />, close: false },
            { label: "Maximize", action: () => win.toggleMaximize(), icon: <Square size={10} />, close: false },
            { label: "Close",    action: () => win.close(),          icon: <X    size={11} />, close: true  },
          ] as { label: string; action: () => void; icon: React.ReactNode; close: boolean }[]
        ).map(({ label, action, icon, close }) => (
          <button
            key={label}
            aria-label={label}
            onClick={action}
            className="w-7 h-7 rounded-[var(--r-sm)] flex items-center justify-center transition-all duration-150 cursor-default"
            style={{ color: "var(--fg-subtle)" }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = close ? "rgba(248,113,113,0.15)" : "var(--bg-2)";
              e.currentTarget.style.color = close ? "#f87171" : "var(--fg-muted)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--fg-subtle)";
            }}
          >
            {icon}
          </button>
        ))}
      </div>

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  );
}
