import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useStore } from "../../store";

export default function ContextMenu() {
  const { contextMenu, closeContextMenu } = useStore();
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!contextMenu) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        closeContextMenu();
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeContextMenu(); };

    const tid = setTimeout(() => {
      window.addEventListener("mousedown", onDown);
      window.addEventListener("keydown", onKey);
    }, 0);
    return () => {
      clearTimeout(tid);
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [contextMenu, closeContextMenu]);

  if (!contextMenu) return null;


  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const menuW = 200;
  const itemH = 28;
  const menuH = contextMenu.items.length * itemH + 8;
  const x = Math.min(contextMenu.x, vw - menuW - 8);
  const y = Math.min(contextMenu.y, vh - menuH - 8);

  return createPortal(
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-[9999] py-1 select-none"
      style={{
        top: y,
        left: x,
        minWidth: menuW,
        background: "var(--bg-1)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-md)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3)",
        backdropFilter: "blur(12px)",
      }}
    >
      {contextMenu.items.map((item, i) => (
        <div key={i}>
          {item.separator && i > 0 && (
            <div className="my-1 mx-2" style={{ height: 1, background: "var(--border)" }} />
          )}
          <button
            role="menuitem"
            disabled={item.disabled}
            onClick={() => { item.action(); closeContextMenu(); }}
            className="w-full flex items-center gap-2.5 px-3 text-xs cursor-default transition-all duration-100 disabled:opacity-40 disabled:pointer-events-none"
            style={{
              height: itemH,
              color: item.danger ? "var(--danger)" : "var(--fg-muted)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = item.danger
                ? "rgba(248,113,113,0.1)"
                : "var(--bg-2)";
              (e.currentTarget as HTMLButtonElement).style.color = item.danger
                ? "var(--danger)"
                : "var(--fg-0)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              (e.currentTarget as HTMLButtonElement).style.color = item.danger
                ? "var(--danger)"
                : "var(--fg-muted)";
            }}
          >
            {item.icon && (
              <span className="shrink-0" style={{ opacity: 0.7 }}>{item.icon}</span>
            )}
            <span className="flex-1 text-left">{item.label}</span>
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
