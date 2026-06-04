import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { X, Github, Globe, ExternalLink } from "lucide-react";
import logoUrl from "../assets/logo.png";

async function openLink(url: string): Promise<void> {
  const { openUrl } = await import("@tauri-apps/plugin-opener");
  await openUrl(url);
}


const PROJECT_LINKS = [
  { label: "GitHub", icon: <Github size={11} />, url: "https://github.com/TheHolyOneZ/ZBase-Studio" },
  { label: "Download", icon: <ExternalLink size={11} />, url: "https://zsync.eu/zbase-studio/" },
];
const DEV_LINKS = [
  { label: "TheHolyOneZ", icon: <Github size={11} />, url: "https://github.com/TheHolyOneZ" },
  { label: "zsync.eu", icon: <Globe size={11} />, url: "https://zsync.eu" },
];
const STACK: { label: string; tier: "core" | "engine" | "ui" }[] = [
  { label: "Tauri 2",       tier: "core" },
  { label: "Rust",          tier: "core" },
  { label: "React 19",      tier: "core" },
  { label: "TypeScript",    tier: "core" },
  { label: "SQLite",        tier: "engine" },
  { label: "DuckDB",        tier: "engine" },
  { label: "PostgreSQL",    tier: "engine" },
  { label: "MySQL",         tier: "engine" },
  { label: "MariaDB",       tier: "engine" },
  { label: "TailwindCSS 4", tier: "ui" },
  { label: "Zustand",       tier: "ui" },
  { label: "Monaco Editor", tier: "ui" },
  { label: "sqlx",          tier: "ui" },
];
const TIER_STYLE: Record<"core" | "engine" | "ui", React.CSSProperties> = {
  core:   { background: "rgba(46,189,133,0.1)",  border: "1px solid rgba(46,189,133,0.3)",   color: "var(--accent)" },
  engine: { background: "rgba(120,110,255,0.08)", border: "1px solid rgba(120,110,255,0.25)", color: "rgba(170,165,255,0.9)" },
  ui:     { background: "var(--bg-2)",             border: "1px solid var(--border)",           color: "var(--fg-subtle)" },
};


function LinkBtn({ label, icon, url }: { label: string; icon: React.ReactNode; url: string }) {
  return (
    <button
      onClick={() => openLink(url)}
      className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-[var(--r-sm)] cursor-default transition-all duration-100 select-none"
      style={{ background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--fg-muted)" }}
      onMouseEnter={(e) => Object.assign(e.currentTarget.style, { background: "rgba(46,189,133,0.08)", borderColor: "rgba(46,189,133,0.4)", color: "var(--accent)" })}
      onMouseLeave={(e) => Object.assign(e.currentTarget.style, { background: "var(--bg-2)", borderColor: "var(--border)", color: "var(--fg-muted)" })}
    >
      {icon}{label}
    </button>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-bold uppercase tracking-[0.13em]" style={{ color: "var(--fg-subtle)" }}>
      {children}
    </span>
  );
}


interface Props { open: boolean; onClose: () => void; }

export default function AboutModal({ open, onClose }: Props) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  return createPortal(
    <AnimatePresence>
      {open && (

        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          style={{
            position: "fixed", inset: 0, zIndex: 50,
            overflowY: "auto",
            background: "rgba(0,0,0,0.75)",
            backdropFilter: "blur(8px)",
          }}
        >

          <div
            style={{ minHeight: "100%", display: "flex", alignItems: "center", justifyContent: "center", padding: "32px 16px" }}
            onClick={(e) => e.target === e.currentTarget && onClose()}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              style={{
                width: 460,
                background: "var(--bg-1)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r-lg)",
                overflow: "hidden",
                boxShadow: "0 40px 100px rgba(0,0,0,0.8), 0 0 0 1px rgba(255,255,255,0.04)",
                flexShrink: 0,
              }}
            >

              <div style={{ position: "relative", background: "var(--bg-0)", padding: "32px 28px 26px", overflow: "hidden" }}>

                <div style={{ position: "absolute", inset: 0, pointerEvents: "none", background: "radial-gradient(ellipse 70% 100% at 50% -5%, rgba(46,189,133,0.16) 0%, transparent 65%)" }} />

                <div style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: 0.035, backgroundImage: "linear-gradient(var(--fg-subtle) 1px, transparent 1px),linear-gradient(90deg,var(--fg-subtle) 1px,transparent 1px)", backgroundSize: "28px 28px" }} />


                <button
                  onClick={onClose}
                  style={{ position: "absolute", top: 10, right: 10, zIndex: 1, width: 24, height: 24, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", color: "var(--fg-subtle)", border: "none", cursor: "default", transition: "all 0.1s" }}
                  onMouseEnter={(e) => Object.assign(e.currentTarget.style, { background: "var(--bg-2)", color: "var(--fg-0)" })}
                  onMouseLeave={(e) => Object.assign(e.currentTarget.style, { background: "transparent", color: "var(--fg-subtle)" })}
                >
                  <X size={13} />
                </button>


                <div style={{ display: "flex", justifyContent: "center", marginBottom: 16, position: "relative", zIndex: 1 }}>
                  <div style={{
                    width: 88, height: 88, borderRadius: 20,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "0 0 0 1px rgba(46,189,133,0.2), 0 0 48px rgba(46,189,133,0.22), 0 8px 32px rgba(0,0,0,0.5)",
                    overflow: "hidden",
                    flexShrink: 0,
                  }}>
                    <img src={logoUrl} alt="ZBase Studio" style={{ width: 88, height: 88 }} draggable={false} />
                  </div>
                </div>


                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, position: "relative", zIndex: 1 }}>
                  <span style={{
                    fontSize: 20, fontWeight: 900, letterSpacing: "0.1em", textTransform: "uppercase",
                    background: "linear-gradient(135deg, var(--fg-0) 25%, var(--accent) 100%)",
                    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                  }}>
                    ZBase Studio
                  </span>
                  <span style={{
                    fontSize: 10, fontFamily: "monospace", fontWeight: 600, padding: "2px 8px", borderRadius: 20,
                    color: "var(--accent)", background: "rgba(46,189,133,0.1)", border: "1px solid rgba(46,189,133,0.25)", letterSpacing: "0.07em",
                  }}>
                    v0.2.0
                  </span>
                  <p style={{ fontSize: 11.5, color: "var(--fg-subtle)", textAlign: "center", lineHeight: 1.65, maxWidth: 310, margin: "4px 0 0" }}>
                    "Built because managing five engines shouldn't require five apps."
                  </p>
                </div>
              </div>


              <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)" }}>
                <SectionLabel>Created by</SectionLabel>
                <div style={{
                  marginTop: 10, display: "flex", alignItems: "center", gap: 12, padding: "10px 14px",
                  borderRadius: "var(--r-md)", background: "rgba(46,189,133,0.05)", border: "1px solid rgba(46,189,133,0.18)",
                }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    background: "linear-gradient(145deg, var(--accent) 0%, rgba(46,189,133,0.4) 100%)",
                    boxShadow: "0 0 18px rgba(46,189,133,0.28)",
                    fontSize: 15, fontWeight: 900, color: "#0B0F14",
                  }}>Z</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--fg-0)" }}>TheHolyOneZ</span>
                    <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0 }}>
                      {["Designer", "Frontend", "Backend", "Maintainer"].map((r, i, arr) => (
                        <span key={r} style={{ fontSize: 10, color: "var(--fg-subtle)" }}>
                          {r}{i < arr.length - 1 && <span style={{ margin: "0 5px", opacity: 0.45 }}>·</span>}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              </div>


              <div style={{ padding: "18px 22px", borderBottom: "1px solid var(--border)", display: "flex", gap: 24 }}>
                <div style={{ flex: 1 }}>
                  <SectionLabel>Project</SectionLabel>
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {PROJECT_LINKS.map((l) => <LinkBtn key={l.label} {...l} />)}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <SectionLabel>Developer</SectionLabel>
                  <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {DEV_LINKS.map((l) => <LinkBtn key={l.label} {...l} />)}
                  </div>
                </div>
              </div>


              <div style={{ padding: "18px 22px 20px" }}>
                <SectionLabel>Tech Stack</SectionLabel>
                <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {STACK.map((s) => (
                    <span key={s.label} style={{ ...TIER_STYLE[s.tier], fontSize: 11, fontWeight: 500, padding: "3px 10px", borderRadius: 999 }}>
                      {s.label}
                    </span>
                  ))}
                </div>
              </div>


              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "9px 22px", borderTop: "1px solid var(--border)", background: "var(--bg-0)" }}>
                <span style={{ fontSize: 10, color: "var(--fg-subtle)" }}>GNU General Public License v3.0</span>
                <span style={{ fontSize: 10, fontFamily: "monospace", color: "var(--fg-subtle)" }}>© 2026 TheHolyOneZ</span>
              </div>
            </motion.div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
