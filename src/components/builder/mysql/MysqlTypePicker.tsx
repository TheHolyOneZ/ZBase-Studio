import type { MysqlDraftColumn } from "../../../types/mysqlBuilder";
import { SelectInput } from "../../common/FormControls";

interface Props {
  col: MysqlDraftColumn;
  flavor: "mysql" | "mariadb";
  onChange: (patch: Partial<MysqlDraftColumn>) => void;
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg-0)",
  border: "1px solid var(--border)",
  color: "var(--fg-0)",
  borderRadius: 4,
  padding: "2px 4px",
  fontSize: 12,
  outline: "none",
};

const BASE_GROUPS = [
  { label: "Integer", types: ["TINYINT", "SMALLINT", "MEDIUMINT", "INT", "BIGINT"] },
  { label: "Decimal", types: ["DECIMAL", "FLOAT", "DOUBLE"] },
  { label: "String", types: ["CHAR", "VARCHAR", "TINYTEXT", "TEXT", "MEDIUMTEXT", "LONGTEXT"] },
  { label: "Binary", types: ["BINARY", "VARBINARY", "TINYBLOB", "BLOB", "MEDIUMBLOB", "LONGBLOB"] },
  { label: "Date / Time", types: ["DATE", "TIME", "DATETIME", "TIMESTAMP", "YEAR"] },
  { label: "Boolean", types: ["TINYINT(1)"] },
  { label: "Other", types: ["BIT", "JSON", "ENUM", "SET"] },
  { label: "Geometry", types: ["GEOMETRY", "POINT", "LINESTRING", "POLYGON"] },
];

const MARIADB_EXTRA = { label: "MariaDB", types: ["UUID", "INET4", "INET6"] };

const needsLength = (dt: string) => ["VARCHAR", "CHAR", "BINARY", "VARBINARY", "BIT"].includes(dt);
const needsPrecisionScale = (dt: string) => ["DECIMAL", "NUMERIC"].includes(dt);
const needsPrecision = (dt: string) => ["FLOAT", "DOUBLE"].includes(dt);
const needsFsp = (dt: string) => ["DATETIME", "TIMESTAMP", "TIME"].includes(dt);
const needsEnumValues = (dt: string) => dt === "ENUM";
const needsSetValues = (dt: string) => dt === "SET";

export default function MysqlTypePicker({ col, flavor, onChange }: Props) {
  const dt = col.dataType.toUpperCase();

  const groups = [...BASE_GROUPS, ...(flavor === "mariadb" ? [MARIADB_EXTRA] : [])];

  const allTypes = groups.flatMap((g) => g.types);
  const knownType = allTypes.includes(dt === "TINYINT" && col.length === 1 ? "TINYINT(1)" : dt)
    ? (dt === "TINYINT" && col.length === 1 ? "TINYINT(1)" : dt)
    : null;

  function selectType(v: string) {
    if (v === "TINYINT(1)") {
      onChange({ dataType: "TINYINT", length: 1, unsigned: false, precision: null, scale: null, fsp: null, enumValues: [], setValues: [] });
      return;
    }
    onChange({ dataType: v, length: null, precision: null, scale: null, fsp: null, enumValues: [], setValues: [] });
  }

  return (
    <div className="flex flex-wrap items-center gap-1">
      <SelectInput<string>
        value={knownType ?? dt}
        onChange={selectType}
        groups={groups.map((g) => ({ label: g.label, options: g.types.map((t) => ({ value: t, label: t })) }))}
        style={{ minWidth: 120 }}
      />

      {needsLength(dt) && (
        <input type="number" min={1} style={{ ...inputStyle, width: 60 }}
          value={col.length ?? ""} placeholder="len"
          onChange={(e) => onChange({ length: e.target.value ? Number(e.target.value) : null })} />
      )}

      {needsPrecisionScale(dt) && (
        <>
          <input type="number" min={1} style={{ ...inputStyle, width: 44 }}
            value={col.precision ?? ""} placeholder="p"
            onChange={(e) => onChange({ precision: e.target.value ? Number(e.target.value) : null })} />
          <span style={{ color: "var(--fg-subtle)", fontSize: 12 }}>,</span>
          <input type="number" min={0} style={{ ...inputStyle, width: 44 }}
            value={col.scale ?? ""} placeholder="s"
            onChange={(e) => onChange({ scale: e.target.value ? Number(e.target.value) : null })} />
        </>
      )}

      {needsPrecision(dt) && (
        <input type="number" min={1} style={{ ...inputStyle, width: 44 }}
          value={col.precision ?? ""} placeholder="p"
          onChange={(e) => onChange({ precision: e.target.value ? Number(e.target.value) : null })} />
      )}

      {needsFsp(dt) && (
        <input type="number" min={0} max={6} style={{ ...inputStyle, width: 44 }}
          value={col.fsp ?? ""} placeholder="fsp"
          onChange={(e) => onChange({ fsp: e.target.value ? Number(e.target.value) : null })} />
      )}

      {needsEnumValues(dt) && (
        <input style={{ ...inputStyle, width: 160 }}
          value={col.enumValues.join(",")}
          placeholder="val1,val2,val3"
          onChange={(e) => onChange({ enumValues: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
      )}

      {needsSetValues(dt) && (
        <input style={{ ...inputStyle, width: 160 }}
          value={col.setValues.join(",")}
          placeholder="val1,val2,val3"
          onChange={(e) => onChange({ setValues: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} />
      )}
    </div>
  );
}
