import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

export function Checkbox({ checked, onChange, disabled }: {
  checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <button
      role="checkbox"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex items-center justify-center shrink-0 transition-all cursor-default"
      style={{
        width: 13,
        height: 13,
        borderRadius: 3,
        background: checked && !disabled ? "var(--accent)" : "var(--bg-0)",
        border: `1px solid ${checked && !disabled ? "var(--accent)" : "var(--border)"}`,
        opacity: disabled ? 0.4 : 1,
      }}
    >
      {checked && !disabled && (
        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
          <path d="M1 3L3 5L7 1" stroke="#0B0F14" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

export function Toggle({ label, checked, onChange, disabled }: {
  label: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean;
}) {
  return (
    <label
      className="flex items-center gap-2 cursor-pointer text-xs select-none"
      style={{ color: disabled ? "var(--fg-subtle)" : "var(--fg-muted)", pointerEvents: disabled ? "none" : undefined }}
    >
      <button
        role="checkbox"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="w-3.5 h-3.5 rounded-sm flex items-center justify-center transition-all cursor-default shrink-0"
        style={{
          background: checked && !disabled ? "var(--accent)" : "var(--bg-0)",
          border: `1px solid ${checked && !disabled ? "var(--accent)" : "var(--border)"}`,
          opacity: disabled ? 0.4 : 1,
        }}
      >
        {checked && !disabled && (
          <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
            <path d="M1 3.5L3.5 6L8 1" stroke="#0B0F14" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </button>
      {label}
    </label>
  );
}

export function RadioGroup<T extends string>({ options, value, onChange, compact }: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  compact?: boolean;
}) {
  return (
    <div className="flex gap-1">
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={`flex-1 rounded text-xs cursor-default transition-all ${compact ? "py-0.5" : "py-1"}`}
          style={{
            background: value === opt.id ? "var(--accent)" : "var(--bg-2)",
            color: value === opt.id ? "#0B0F14" : "var(--fg-muted)",
            border: `1px solid ${value === opt.id ? "var(--accent)" : "var(--border)"}`,
            fontWeight: value === opt.id ? 600 : 400,
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--fg-subtle)" }}>
      {children}
    </span>
  );
}

export function TextInput({
  value, onChange, placeholder, monospace, className, style,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  monospace?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className={`px-2 py-1 rounded text-xs outline-none w-full ${className ?? ""}`}
      style={{
        background: "var(--bg-0)",
        border: "1px solid var(--border)",
        color: "var(--fg-0)",
        fontFamily: monospace ? "var(--font-mono, monospace)" : undefined,
        ...style,
      }}
    />
  );
}

export function SelectInput<T extends string>({
  value, onChange, options: flatOptions, groups, className, style,
}: {
  value: T;
  onChange: (v: T) => void;
  options?: { value: T; label: string }[];
  groups?: { label: string; options: { value: T; label: string }[] }[];
  className?: string;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const allOptions: { value: T; label: string }[] = groups
    ? groups.flatMap((g) => g.options)
    : (flatOptions ?? []);

  const selected = allOptions.find((o) => o.value === value);

  const closeMenu = useCallback(() => setOpen(false), []);

  const openMenu = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const dropW = Math.max(rect.width, 120);
    const groupHeaderCount = groups?.length ?? 0;
    const dropH = Math.min(allOptions.length * 28 + groupHeaderCount * 22 + 8, 260);
    const spaceBelow = window.innerHeight - rect.bottom;
    const top = spaceBelow >= dropH + 4 ? rect.bottom + 2 : rect.top - dropH - 2;
    const left = Math.min(rect.left, window.innerWidth - dropW - 8);
    setDropPos({ top, left, width: dropW });
    setHighlightIdx(allOptions.findIndex((o) => o.value === value));
    setOpen(true);
  }, [allOptions, groups, value]);

  useEffect(() => {
    if (!open) return;

    const handleOutside = (e: MouseEvent) => {
      if (
        !triggerRef.current?.contains(e.target as Node) &&
        !listRef.current?.contains(e.target as Node)
      ) {
        closeMenu();
      }
    };


    document.addEventListener("mousedown", handleOutside, true);


    let rafId = 0;
    const handleClose = (e: Event) => {
      if (listRef.current?.contains(e.target as Node)) return;
      closeMenu();
    };
    rafId = requestAnimationFrame(() => {
      window.addEventListener("scroll", handleClose, { capture: true, passive: true });
      window.addEventListener("resize", handleClose);
    });

    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener("mousedown", handleOutside, true);
      window.removeEventListener("scroll", handleClose, true);
      window.removeEventListener("resize", handleClose);
    };
  }, [open, closeMenu]);

  useEffect(() => {
    if (!open || !listRef.current || highlightIdx < 0) return;
    const items = listRef.current.querySelectorAll<HTMLElement>("[data-opt]");
    items[highlightIdx]?.scrollIntoView({ block: "nearest" });
  }, [highlightIdx, open]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); closeMenu(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setHighlightIdx((i) => Math.min(i + 1, allOptions.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlightIdx((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightIdx >= 0 && highlightIdx < allOptions.length) {
        onChange(allOptions[highlightIdx].value);
        closeMenu();
      }
    }
  }

  function renderDropdownItems() {
    if (groups) {
      let optIdx = 0;
      return groups.map((g) => (
        <div key={g.label}>
          <div style={{
            padding: "5px 10px 3px",
            fontSize: 9,
            fontWeight: 700,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            color: "var(--fg-subtle)",
            pointerEvents: "none",
            userSelect: "none",
          }}>
            {g.label}
          </div>
          {g.options.map((o) => {
            const idx = optIdx++;
            return (
              <button key={o.value} data-opt="" type="button"
                onMouseDown={(e) => { e.preventDefault(); onChange(o.value); closeMenu(); }}
                onMouseEnter={() => setHighlightIdx(idx)}
                className="w-full text-left px-4 py-1.5 text-xs cursor-default block"
                style={{
                  background: idx === highlightIdx ? "var(--accent-soft)" : "transparent",
                  color: o.value === value ? "var(--accent)" : "var(--fg-0)",
                }}
              >
                {o.label}
              </button>
            );
          })}
        </div>
      ));
    }
    return allOptions.map((o, i) => (
      <button key={o.value} data-opt="" type="button"
        onMouseDown={(e) => { e.preventDefault(); onChange(o.value); closeMenu(); }}
        onMouseEnter={() => setHighlightIdx(i)}
        className="w-full text-left px-3 py-1.5 text-xs cursor-default block"
        style={{
          background: i === highlightIdx ? "var(--accent-soft)" : "transparent",
          color: o.value === value ? "var(--accent)" : "var(--fg-0)",
        }}
      >
        {o.label}
      </button>
    ));
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={handleKeyDown}
        className={`flex items-center justify-between gap-1 px-2 py-1 rounded text-xs cursor-default ${className ?? ""}`}
        style={{
          background: "var(--bg-0)",
          border: `1px solid ${open ? "var(--accent)" : "var(--border)"}`,
          color: "var(--fg-0)",
          minWidth: 80,
          userSelect: "none",
          ...style,
        }}
      >
        <span className="truncate flex-1 text-left">{selected?.label ?? value}</span>
        <ChevronDown
          size={10}
          style={{
            color: "var(--fg-subtle)",
            flexShrink: 0,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.15s",
          }}
        />
      </button>
      {open &&
        createPortal(
          <div
            ref={listRef}
            data-select-popup=""
            onWheel={(e) => e.stopPropagation()}
            style={{
              position: "fixed",
              top: dropPos.top,
              left: dropPos.left,
              minWidth: dropPos.width,
              maxHeight: 260,
              overflowY: "auto",
              zIndex: 99999,
              background: "var(--bg-1)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
            }}
          >
            {renderDropdownItems()}
          </div>,
          document.body,
        )}
    </>
  );
}
