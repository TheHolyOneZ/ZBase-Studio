import type { PgDraftTrigger, PgDraftTable, PgDraftFunction } from "../../../types/pgBuilder";
import { SelectInput, Checkbox } from "../../common/FormControls";

interface Props {
  trigger: PgDraftTrigger;
  allTables: PgDraftTable[];
  allFunctions: PgDraftFunction[];
  availableSchemas: string[];
  onChange: (patch: Partial<PgDraftTrigger>) => void;
  onAddFunction: () => string;
}

const inputStyle: React.CSSProperties = {
  background: "var(--bg-0)",
  border: "1px solid var(--border)",
  color: "var(--fg-0)",
  borderRadius: 4,
  padding: "2px 6px",
  fontSize: 12,
  outline: "none",
  width: "100%",
};

const EVENTS = ["INSERT", "UPDATE", "DELETE", "TRUNCATE"] as const;

export default function PgTriggerEditor({ trigger, allTables, allFunctions, availableSchemas, onChange, onAddFunction }: Props) {
  const triggerFunctions = allFunctions.filter((f) => f.returnsTrigger);

  function toggleEvent(ev: string) {
    const events = trigger.events as string[];
    const next = events.includes(ev) ? events.filter((e) => e !== ev) : [...events, ev];
    onChange({ events: next as typeof trigger.events });
  }

  const truncateWithRow = trigger.events.includes("TRUNCATE") && trigger.forEach === "ROW";
  const insteadOfWarning = trigger.timing === "INSTEAD OF";

  return (
    <div className="px-4 py-3 flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>Schema</span>
          <SelectInput<string>
            value={trigger.schema}
            onChange={(v) => onChange({ schema: v })}
            options={availableSchemas.map((s) => ({ value: s, label: s }))}
            style={{ width: "100%" }}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>Trigger name</span>
          <input style={inputStyle} value={trigger.name} placeholder="trigger_name"
            onChange={(e) => onChange({ name: e.target.value })} />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>Timing</span>
          <SelectInput<typeof trigger.timing>
            value={trigger.timing}
            onChange={(v) => onChange({ timing: v })}
            options={[
              { value: "BEFORE", label: "BEFORE" },
              { value: "AFTER", label: "AFTER" },
              { value: "INSTEAD OF", label: "INSTEAD OF" },
            ]}
            style={{ width: "100%" }}
          />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>Table</span>
          <SelectInput<string>
            value={trigger.table}
            onChange={(v) => onChange({ table: v })}
            options={[
              { value: "", label: "— select table —" },
              ...allTables.map((t) => ({ value: t.name, label: t.schema !== "public" ? `${t.schema}.${t.name}` : t.name })),
            ]}
            style={{ width: "100%" }}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--fg-subtle)" }}>Events</span>
        <div className="flex gap-3">
          {EVENTS.map((ev) => (
            <label key={ev} className="flex items-center gap-1.5 text-xs cursor-default select-none" style={{ color: "var(--fg-muted)" }}>
              <Checkbox checked={trigger.events.includes(ev)} onChange={() => toggleEvent(ev)} />
              {ev}
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-4">
        <div className="flex flex-col gap-0.5">
          <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>FOR EACH</span>
          <div className="flex gap-2">
            {(["ROW", "STATEMENT"] as const).map((fe) => (
              <label key={fe} className="flex items-center gap-1 text-xs cursor-pointer" style={{ color: "var(--fg-muted)" }}>
                <input type="radio" checked={trigger.forEach === fe}
                  onChange={() => onChange({ forEach: fe })} />
                {fe}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="text-[10px]" style={{ color: "var(--fg-subtle)" }}>WHEN clause (optional)</span>
        <input style={inputStyle} value={trigger.whenClause ?? ""}
          placeholder="e.g. NEW.status = 'active'"
          onChange={(e) => onChange({ whenClause: e.target.value || null })} />
      </div>

      {truncateWithRow && (
        <p className="text-[11px] px-2 py-1 rounded" style={{ background: "var(--warning-soft, #3a2e00)", color: "var(--warning, #f5c542)", border: "1px solid var(--warning, #f5c542)" }}>
          TRUNCATE triggers can only fire FOR EACH STATEMENT, not FOR EACH ROW.
        </p>
      )}
      {insteadOfWarning && (
        <p className="text-[11px] px-2 py-1 rounded" style={{ background: "var(--warning-soft, #3a2e00)", color: "var(--warning, #f5c542)", border: "1px solid var(--warning, #f5c542)" }}>
          INSTEAD OF triggers can only be defined on views, not on tables.
        </p>
      )}

      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase" style={{ color: "var(--fg-subtle)" }}>Execute function</span>
          <button
            style={{ fontSize: 11, color: "var(--accent)", cursor: "default" }}
            onClick={() => {
              const id = onAddFunction();
              onChange({ functionId: id });
            }}
          >+ New function</button>
        </div>
        {triggerFunctions.length === 0 ? (
          <p className="text-[11px]" style={{ color: "var(--fg-subtle)" }}>
            No trigger functions defined yet. Add a function with "Returns TRIGGER" checked.
          </p>
        ) : (
          <SelectInput<string>
            value={trigger.functionId}
            onChange={(v) => onChange({ functionId: v })}
            options={[
              { value: "", label: "— select function —" },
              ...triggerFunctions.map((f) => ({ value: f.id, label: f.schema !== "public" ? `${f.schema}.${f.name}` : f.name })),
            ]}
            style={{ width: "100%" }}
          />
        )}
      </div>
    </div>
  );
}
