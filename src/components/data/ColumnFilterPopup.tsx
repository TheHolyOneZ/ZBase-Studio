import { useEffect, useRef, useState } from "react";
import { SelectInput } from "../common/FormControls";
import type { RowFilter } from "../../types/domain";

type Op = RowFilter["op"];

const OPS: { value: Op; label: string; noValue?: boolean }[] = [
  { value: "=",       label: "=" },
  { value: "!=",      label: "!=" },
  { value: "<",       label: "<" },
  { value: "<=",      label: "<=" },
  { value: ">",       label: ">" },
  { value: ">=",      label: ">=" },
  { value: "like",    label: "LIKE" },
  { value: "is_null", label: "IS NULL",     noValue: true },
  { value: "not_null",label: "IS NOT NULL", noValue: true },
];

interface Props {
  column: string;
  current: RowFilter | null;
  anchor: { top: number; left: number };
  onApply: (f: RowFilter) => void;
  onClear: () => void;
  onClose: () => void;
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg-0)",
  border: "1px solid var(--border)",
  color: "var(--fg-0)",
  borderRadius: 4,
  padding: "3px 7px",
  fontSize: 12,
  outline: "none",
  width: "100%",
};

export default function ColumnFilterPopup({ column, current, anchor, onApply, onClear, onClose }: Props) {
  const [op, setOp] = useState<Op>(current?.op ?? "=");
  const [value, setValue] = useState<string>(
    current && current.value !== null && current.value !== undefined ? String(current.value) : ""
  );
  const ref = useRef<HTMLDivElement>(null);

  const noValue = OPS.find((o) => o.value === op)?.noValue ?? false;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      const target = e.target as Element | null;
      if (target?.closest("[data-select-popup]")) return;
      if (ref.current && !ref.current.contains(target)) onClose();
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [onClose]);

  function handleApply() {
    onApply({ column, op, value: noValue ? null : (value || null) });
  }

  return (
    <div
      ref={ref}
      style={{
        position: "fixed",
        top: anchor.top,
        left: anchor.left,
        zIndex: 9999,
        background: "var(--bg-1)",
        border: "1px solid var(--border)",
        borderRadius: 6,
        padding: "10px 12px",
        width: 220,
        boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ fontSize: 10, fontWeight: 600, color: "var(--fg-subtle)", textTransform: "uppercase" }}>
        {column}
      </div>

      <div className="flex flex-col gap-0.5">
        <span style={{ fontSize: 10, color: "var(--fg-subtle)" }}>Operator</span>
        <SelectInput<Op>
          value={op}
          onChange={setOp}
          options={OPS.map((o) => ({ value: o.value, label: o.label }))}
        />
      </div>

      {!noValue && (
        <div className="flex flex-col gap-0.5">
          <span style={{ fontSize: 10, color: "var(--fg-subtle)" }}>Value</span>
          <input
            style={inputStyle}
            value={value}
            placeholder="filter value…"
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") handleApply(); if (e.key === "Escape") onClose(); }}
            autoFocus
          />
        </div>
      )}

      <div className="flex items-center gap-2 justify-end">
        <button
          onClick={onClear}
          style={{ fontSize: 11, color: "var(--fg-subtle)", cursor: "default" }}
        >Clear</button>
        <button
          onClick={handleApply}
          style={{
            fontSize: 11, padding: "3px 10px", borderRadius: 4, cursor: "default",
            background: "var(--accent)", color: "#0B0F14",
          }}
        >Apply</button>
      </div>
    </div>
  );
}
