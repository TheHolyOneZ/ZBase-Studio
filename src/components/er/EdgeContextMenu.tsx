import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Pencil, Trash2 } from "lucide-react";

interface EdgeContextMenuProps {
  x: number;
  y: number;
  edgeLabel?: string;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}

export default function EdgeContextMenu({ x, y, edgeLabel, onEdit, onDelete, onClose }: EdgeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleMouseDown(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleMouseDown, true);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);


  const W = 180;
  const left = x + W > window.innerWidth ? x - W : x;
  const top = y + 100 > window.innerHeight ? y - 100 : y;

  return createPortal(
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top,
        left,
        width: W,
        zIndex: 99999,
        background: "var(--bg-1)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        overflow: "hidden",
      }}
    >
      {edgeLabel && (
        <div
          className="px-3 py-1.5 text-[10px] font-mono truncate"
          style={{ color: "var(--fg-subtle)", borderBottom: "1px solid var(--border)" }}
        >
          {edgeLabel}
        </div>
      )}
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-xs cursor-default hover:bg-[var(--bg-2)] transition-colors"
        style={{ color: "var(--fg-0)" }}
        onClick={() => { onEdit(); onClose(); }}
      >
        <Pencil size={12} style={{ color: "var(--accent)" }} />
        Edit FK actions…
      </button>
      <button
        className="flex w-full items-center gap-2 px-3 py-2 text-xs cursor-default hover:bg-[var(--bg-2)] transition-colors"
        style={{ color: "var(--danger)" }}
        onClick={() => { onDelete(); onClose(); }}
      >
        <Trash2 size={12} />
        Delete FK
      </button>
    </div>,
    document.body,
  );
}
