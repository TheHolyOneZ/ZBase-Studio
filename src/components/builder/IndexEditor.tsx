import { useEffect, useRef } from "react";
import type { DraftIndex, DraftTable } from "../../types/builder";
import { Toggle, TextInput, SelectInput, FieldLabel } from "../common/FormControls";

interface Props {
  index: DraftIndex;
  allTables: DraftTable[];
  onChange: (patch: Partial<DraftIndex>) => void;
}

export default function IndexEditor({ index: idx, allTables, onChange }: Props) {
  const targetTable = allTables.find((t) => t.name === idx.table);
  const nameManualRef = useRef(false);


  const colKey = idx.columns.join("_");
  useEffect(() => {
    if (!nameManualRef.current && idx.table && idx.columns.length > 0 && idx.name === "") {
      onChange({ name: `idx_${idx.table}_${colKey}` });
    }
  }, [idx.table, colKey]);


  function handleTableChange(v: string) {
    nameManualRef.current = false;
    onChange({ table: v, columns: [] });
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex flex-col gap-1">
        <FieldLabel>Index name</FieldLabel>
        <TextInput
          value={idx.name}
          onChange={(v) => { nameManualRef.current = true; onChange({ name: v }); }}
          placeholder="idx_table_column"
          monospace
        />
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="flex flex-col gap-1 flex-1 min-w-40">
          <FieldLabel>On table</FieldLabel>
          <SelectInput
            value={idx.table}
            onChange={handleTableChange}
            options={allTables.map((t) => ({ value: t.name, label: t.name }))}
          />
        </div>
        <div className="flex items-end pb-0.5">
          <Toggle label="UNIQUE" checked={idx.unique} onChange={(v) => onChange({ unique: v })} />
        </div>
      </div>

      {targetTable && (
        <div className="flex flex-col gap-2">
          <FieldLabel>Columns (check to include, order matters)</FieldLabel>
          <div className="flex flex-wrap gap-2">
            {targetTable.columns.map((col) => {
              const included = idx.columns.includes(col.name);
              return (
                <Toggle
                  key={col.id}
                  label={col.name || "(unnamed)"}
                  checked={included}
                  onChange={(checked) => {
                    onChange({
                      columns: checked
                        ? [...idx.columns, col.name]
                        : idx.columns.filter((c) => c !== col.name),
                    });
                  }}
                />
              );
            })}
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <FieldLabel>WHERE clause (optional partial index)</FieldLabel>
        <TextInput
          value={idx.whereClause ?? ""}
          onChange={(v) => onChange({ whereClause: v || null })}
          placeholder="e.g. active = 1"
          monospace
        />
      </div>
    </div>
  );
}
