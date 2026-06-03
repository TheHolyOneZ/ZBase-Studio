import { useState } from "react";
import type { PgType } from "../../../types/pgBuilder";
import { SelectInput, Checkbox } from "../../common/FormControls";

interface Props {
  value: PgType;
  onChange: (t: PgType) => void;
}

const TYPE_GROUPS = [
  { label: "Integer", types: [
    { base: "smallint", label: "SMALLINT (2B)" },
    { base: "integer", label: "INTEGER (4B)" },
    { base: "bigint", label: "BIGINT (8B)" },
  ]},
  { label: "Numeric", types: [
    { base: "numeric", label: "NUMERIC(p,s)" },
    { base: "real", label: "REAL" },
    { base: "double precision", label: "DOUBLE PRECISION" },
    { base: "money", label: "MONEY" },
  ]},
  { label: "String", types: [
    { base: "text", label: "TEXT" },
    { base: "varchar", label: "VARCHAR(n)" },
    { base: "char", label: "CHAR(n)" },
  ]},
  { label: "Date / Time", types: [
    { base: "date", label: "DATE" },
    { base: "time", label: "TIME" },
    { base: "time", label: "TIME WITH TIME ZONE", withTimezone: true },
    { base: "timestamp", label: "TIMESTAMP" },
    { base: "timestamp", label: "TIMESTAMPTZ", withTimezone: true },
    { base: "interval", label: "INTERVAL" },
  ]},
  { label: "Boolean", types: [{ base: "boolean", label: "BOOLEAN" }]},
  { label: "Binary / JSON / Other", types: [
    { base: "bytea", label: "BYTEA" },
    { base: "json", label: "JSON" },
    { base: "jsonb", label: "JSONB" },
    { base: "uuid", label: "UUID" },
    { base: "inet", label: "INET" },
    { base: "cidr", label: "CIDR" },
    { base: "macaddr", label: "MACADDR" },
  ]},
];

const SELECT_GROUPS = [
  ...TYPE_GROUPS.map((g) => ({
    label: g.label,
    options: g.types.map((t) => ({ value: `${t.base}:${t.label}`, label: t.label })),
  })),
  { label: "Custom", options: [{ value: "custom", label: "Custom type…" }] },
];

const needsLength = (base: string) => ["varchar", "character varying", "char", "bpchar"].includes(base.toLowerCase());
const needsNumeric = (base: string) => ["numeric", "decimal"].includes(base.toLowerCase());

const inputStyle: React.CSSProperties = {
  background: "var(--bg-0)",
  border: "1px solid var(--border)",
  color: "var(--fg-0)",
  borderRadius: 4,
  padding: "2px 4px",
  fontSize: 12,
  outline: "none",
};

export default function PgTypePicker({ value, onChange }: Props) {
  const [custom, setCustom] = useState(
    !TYPE_GROUPS.flatMap((g) => g.types).some((t) => t.base === value.base)
  );
  const [customStr, setCustomStr] = useState(value.base);

  function handleBaseChange(base: string, withTimezone?: boolean) {
    const next: PgType = { base };
    if (withTimezone) next.withTimezone = true;
    if (needsLength(base) && value.length) next.length = value.length;
    if (needsNumeric(base)) {
      if (value.precision) next.precision = value.precision;
      if (value.scale) next.scale = value.scale;
    }
    if (value.array) next.array = true;
    onChange(next);
  }

  const allTypes = TYPE_GROUPS.flatMap((g) => g.types);
  const matchedType = allTypes.find(
    (t) => t.base === value.base && !!(t as { withTimezone?: boolean }).withTimezone === !!value.withTimezone
  );
  const selectedKey = matchedType
    ? `${matchedType.base}:${matchedType.label}`
    : custom ? "custom" : `${value.base}:`;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {!custom ? (
        <SelectInput<string>
          value={selectedKey}
          onChange={(v) => {
            if (v === "custom") { setCustom(true); setCustomStr(value.base); return; }
            const found = allTypes.find((t) => `${t.base}:${t.label}` === v);
            if (found) handleBaseChange(found.base, (found as { withTimezone?: boolean }).withTimezone);
          }}
          groups={SELECT_GROUPS}
        />
      ) : (
        <input
          style={{ ...inputStyle, width: 120 }}
          value={customStr}
          onChange={(e) => setCustomStr(e.target.value)}
          onBlur={() => onChange({ ...value, base: customStr.trim() || value.base })}
          onKeyDown={(e) => {
            if (e.key === "Enter") onChange({ ...value, base: customStr.trim() || value.base });
            if (e.key === "Escape") setCustom(false);
          }}
          placeholder="e.g. text[]"
        />
      )}

      {needsLength(value.base) && !custom && (
        <input
          type="number"
          min={1}
          style={{ ...inputStyle, width: 56 }}
          value={value.length ?? ""}
          placeholder="len"
          onChange={(e) => onChange({ ...value, length: e.target.value ? Number(e.target.value) : undefined })}
        />
      )}

      {needsNumeric(value.base) && !custom && (
        <>
          <input
            type="number"
            min={1}
            style={{ ...inputStyle, width: 44 }}
            value={value.precision ?? ""}
            placeholder="p"
            onChange={(e) => onChange({ ...value, precision: e.target.value ? Number(e.target.value) : undefined })}
          />
          <span style={{ color: "var(--fg-subtle)", fontSize: 12 }}>,</span>
          <input
            type="number"
            min={0}
            style={{ ...inputStyle, width: 44 }}
            value={value.scale ?? ""}
            placeholder="s"
            onChange={(e) => onChange({ ...value, scale: e.target.value ? Number(e.target.value) : undefined })}
          />
        </>
      )}

      <label className="flex items-center gap-1.5 text-[11px] cursor-default select-none" style={{ color: "var(--fg-muted)" }}>
        <Checkbox checked={!!value.array} onChange={(v) => onChange({ ...value, array: v || undefined })} />
        []
      </label>
    </div>
  );
}
