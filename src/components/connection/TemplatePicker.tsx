import { BUILTIN_TEMPLATES } from "../../lib/builderTemplates";
import Modal from "../common/Modal";
import Button from "../common/Button";
import { useStore } from "../../store";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function TemplatePicker({ open, onClose }: Props) {
  const { createBuilderTab } = useStore();

  function pick(idx: number) {
    const tpl = BUILTIN_TEMPLATES[idx];

    const draft = JSON.parse(JSON.stringify(tpl.draft));

    for (const t of draft.tables) { t.id = crypto.randomUUID(); for (const c of t.columns) c.id = crypto.randomUUID(); }
    for (const ix of draft.indexes) ix.id = crypto.randomUUID();
    for (const v of draft.views) v.id = crypto.randomUUID();
    for (const tr of draft.triggers) tr.id = crypto.randomUUID();
    createBuilderTab(draft);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} title="Start from template" width={520}>
      <div className="grid grid-cols-2 gap-3">
        {BUILTIN_TEMPLATES.map((tpl, i) => (
          <button
            key={tpl.id}
            onClick={() => pick(i)}
            className="flex flex-col gap-2 p-3 rounded-[var(--r-sm)] text-left cursor-default transition-all"
            style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; }}
          >
            <div className="flex items-center justify-between w-full">
              <p className="text-sm font-semibold" style={{ color: "var(--fg-0)" }}>{tpl.name}</p>
              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: "var(--bg-1)", color: "var(--fg-subtle)", border: "1px solid var(--border)" }}>
                {tpl.tableCount} tables
              </span>
            </div>
            <p className="text-xs" style={{ color: "var(--fg-subtle)" }}>{tpl.description}</p>
          </button>
        ))}
      </div>
      <div className="flex justify-end mt-4">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}
