import type { DraftTrigger, DraftTable } from "../../types/builder";
import { TextInput, SelectInput, FieldLabel } from "../common/FormControls";
import MonacoEditor from "@monaco-editor/react";
import { defineMonacoTheme } from "../../lib/monacoSqlite";
import type * as Monaco from "monaco-editor";

interface Props {
  trigger: DraftTrigger;
  allTables: DraftTable[];
  onChange: (patch: Partial<DraftTrigger>) => void;
}

export default function TriggerEditor({ trigger: trig, allTables, onChange }: Props) {
  return (
    <div className="flex flex-col gap-4 p-4 h-full">
      <div className="flex flex-col gap-1">
        <FieldLabel>Trigger name</FieldLabel>
        <TextInput value={trig.name} onChange={(v) => onChange({ name: v })} placeholder="trg_table_action" monospace />
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="flex flex-col gap-1">
          <FieldLabel>Timing</FieldLabel>
          <SelectInput<DraftTrigger["timing"]>
            value={trig.timing}
            onChange={(v) => onChange({ timing: v })}
            options={[
              { value: "BEFORE", label: "BEFORE" },
              { value: "AFTER", label: "AFTER" },
              { value: "INSTEAD OF", label: "INSTEAD OF" },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1">
          <FieldLabel>Event</FieldLabel>
          <SelectInput<DraftTrigger["event"]>
            value={trig.event}
            onChange={(v) => onChange({ event: v })}
            options={[
              { value: "INSERT", label: "INSERT" },
              { value: "UPDATE", label: "UPDATE" },
              { value: "DELETE", label: "DELETE" },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-40">
          <FieldLabel>On table</FieldLabel>
          <SelectInput
            value={trig.table}
            onChange={(v) => onChange({ table: v })}
            options={allTables.map((t) => ({ value: t.name, label: t.name }))}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <FieldLabel>WHEN clause (optional)</FieldLabel>
        <TextInput
          value={trig.whenClause ?? ""}
          onChange={(v) => onChange({ whenClause: v || null })}
          placeholder="e.g. NEW.active = 1"
          monospace
        />
      </div>

      <div className="flex flex-col gap-1 flex-1 min-h-0">
        <FieldLabel>BEGIN … END body</FieldLabel>
        <div className="flex-1 rounded overflow-hidden" style={{ border: "1px solid var(--border)", minHeight: 160, background: "#0B0F14" }}>
          <MonacoEditor
            height="100%"
            language="sql"
            theme="zbase-dark"
            value={trig.body}
            onChange={(v) => onChange({ body: v ?? "" })}
            beforeMount={(monaco: typeof Monaco) => defineMonacoTheme(monaco)}
            options={{
              fontSize: 12,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              lineNumbers: "on",
              wordWrap: "on",
            }}
          />
        </div>
      </div>
    </div>
  );
}
