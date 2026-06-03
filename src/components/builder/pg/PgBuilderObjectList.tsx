import { useState, useEffect, useRef } from "react";
import { Table2, List, Eye, Zap, Plus, Trash2, Pencil, Code2, Tag } from "lucide-react";
import type { PgBuilderDraft, PgBuilderSelection } from "../../../types/pgBuilder";
import { useStore } from "../../../store";

interface Props {
  draft: PgBuilderDraft;
  selection: PgBuilderSelection;
  onSelect: (sel: PgBuilderSelection) => void;
  onAddTable: () => void;
  onAddIndex: () => void;
  onAddView: () => void;
  onAddFunction: () => void;
  onAddTrigger: () => void;
  onAddEnum: () => void;
  onRemoveTable: (id: string) => void;
  onRemoveIndex: (id: string) => void;
  onRemoveView: (id: string) => void;
  onRemoveFunction: (id: string) => void;
  onRemoveTrigger: (id: string) => void;
  onRemoveEnum: (id: string) => void;
  onRenameTable: (id: string, name: string) => void;
  onRenameIndex: (id: string, name: string) => void;
  onRenameView: (id: string, name: string) => void;
  onRenameFunction: (id: string, name: string) => void;
  onRenameTrigger: (id: string, name: string) => void;
  onRenameEnum: (id: string, name: string) => void;
}

function GroupHeader({ icon, label, onAdd }: { icon: React.ReactNode; label: string; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--fg-subtle)" }}>
        {icon}{label}
      </div>
      <button
        onClick={onAdd}
        className="w-4 h-4 flex items-center justify-center rounded cursor-default transition-all opacity-50 hover:opacity-100"
        style={{ color: "var(--accent)" }}
      >
        <Plus size={10} />
      </button>
    </div>
  );
}

function ObjectItem({ label, active, isNew, onSelect, onRemove, onRename }: {
  label: string; active: boolean; isNew: boolean;
  onSelect: () => void; onRemove: () => void; onRename: (n: string) => void;
}) {
  const { openContextMenu } = useStore();
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(label);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) { setVal(label); requestAnimationFrame(() => { ref.current?.focus(); ref.current?.select(); }); }
  }, [editing]);

  function commit() { onRename(val.trim() || label); setEditing(false); }

  if (editing) {
    return (
      <div className="px-3 py-0.5">
        <input ref={ref} value={val} onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
          className="w-full px-1.5 py-0.5 text-xs rounded outline-none"
          style={{ background: "var(--bg-0)", border: "1px solid var(--accent)", color: "var(--fg-0)", fontFamily: "var(--font-mono, monospace)" }}
        />
      </div>
    );
  }

  return (
    <div
      className="group flex items-center px-4 py-1 cursor-default select-none"
      style={{ background: active ? "var(--accent-soft)" : "transparent", color: active ? "var(--accent)" : "var(--fg-muted)" }}
      onClick={onSelect}
      onContextMenu={(e) => {
        e.preventDefault();
        openContextMenu(e.clientX, e.clientY, [
          { label: "Rename", icon: <Pencil size={12} />, action: () => setEditing(true) },
          { label: "Delete", icon: <Trash2 size={12} />, danger: true, separator: true, action: onRemove },
        ]);
      }}
    >
      <span className="flex-1 text-xs truncate">{label || "(unnamed)"}</span>
      {isNew && (
        <span className="text-[9px] px-1 rounded" style={{ background: "var(--accent-soft)", color: "var(--accent)", border: "1px solid var(--accent)" }}>new</span>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
        className="opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity cursor-default"
        style={{ color: "var(--danger)" }}
      >
        <Trash2 size={10} />
      </button>
    </div>
  );
}

export default function PgBuilderObjectList({
  draft, selection, onSelect,
  onAddTable, onAddIndex, onAddView, onAddFunction, onAddTrigger, onAddEnum,
  onRemoveTable, onRemoveIndex, onRemoveView, onRemoveFunction, onRemoveTrigger, onRemoveEnum,
  onRenameTable, onRenameIndex, onRenameView, onRenameFunction, onRenameTrigger, onRenameEnum,
}: Props) {
  return (
    <div className="flex flex-col overflow-y-auto h-full" style={{ borderRight: "1px solid var(--border)" }}>
      <div className="shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <GroupHeader icon={<Table2 size={10} />} label="Tables" onAdd={onAddTable} />
        {draft.tables.map((t) => (
          <ObjectItem key={t.id} label={t.name} isNew={!t.serverId}
            active={selection?.kind === "table" && selection.id === t.id}
            onSelect={() => onSelect({ kind: "table", id: t.id })}
            onRemove={() => onRemoveTable(t.id)}
            onRename={(n) => onRenameTable(t.id, n)} />
        ))}
        {draft.tables.length === 0 && <p className="px-4 pb-2 text-[10px]" style={{ color: "var(--fg-subtle)" }}>No tables</p>}
      </div>

      <div className="shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <GroupHeader icon={<List size={10} />} label="Indexes" onAdd={onAddIndex} />
        {draft.indexes.map((ix) => (
          <ObjectItem key={ix.id} label={ix.name} isNew={!ix.serverId}
            active={selection?.kind === "index" && selection.id === ix.id}
            onSelect={() => onSelect({ kind: "index", id: ix.id })}
            onRemove={() => onRemoveIndex(ix.id)}
            onRename={(n) => onRenameIndex(ix.id, n)} />
        ))}
        {draft.indexes.length === 0 && <p className="px-4 pb-2 text-[10px]" style={{ color: "var(--fg-subtle)" }}>No indexes</p>}
      </div>

      <div className="shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <GroupHeader icon={<Eye size={10} />} label="Views" onAdd={onAddView} />
        {draft.views.map((v) => (
          <ObjectItem key={v.id} label={v.name} isNew={!v.serverId}
            active={selection?.kind === "view" && selection.id === v.id}
            onSelect={() => onSelect({ kind: "view", id: v.id })}
            onRemove={() => onRemoveView(v.id)}
            onRename={(n) => onRenameView(v.id, n)} />
        ))}
        {draft.views.length === 0 && <p className="px-4 pb-2 text-[10px]" style={{ color: "var(--fg-subtle)" }}>No views</p>}
      </div>

      <div className="shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <GroupHeader icon={<Code2 size={10} />} label="Functions" onAdd={onAddFunction} />
        {draft.functions.map((f) => (
          <ObjectItem key={f.id} label={f.name} isNew={!f.serverId}
            active={selection?.kind === "function" && selection.id === f.id}
            onSelect={() => onSelect({ kind: "function", id: f.id })}
            onRemove={() => onRemoveFunction(f.id)}
            onRename={(n) => onRenameFunction(f.id, n)} />
        ))}
        {draft.functions.length === 0 && <p className="px-4 pb-2 text-[10px]" style={{ color: "var(--fg-subtle)" }}>No functions</p>}
      </div>

      <div className="shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <GroupHeader icon={<Zap size={10} />} label="Triggers" onAdd={onAddTrigger} />
        {draft.triggers.map((tr) => (
          <ObjectItem key={tr.id} label={tr.name} isNew={!tr.serverId}
            active={selection?.kind === "trigger" && selection.id === tr.id}
            onSelect={() => onSelect({ kind: "trigger", id: tr.id })}
            onRemove={() => onRemoveTrigger(tr.id)}
            onRename={(n) => onRenameTrigger(tr.id, n)} />
        ))}
        {draft.triggers.length === 0 && <p className="px-4 pb-2 text-[10px]" style={{ color: "var(--fg-subtle)" }}>No triggers</p>}
      </div>

      <div className="shrink-0">
        <GroupHeader icon={<Tag size={10} />} label="Types" onAdd={onAddEnum} />
        {(draft.enums ?? []).map((e) => (
          <ObjectItem key={e.id} label={e.name} isNew={!e.serverId}
            active={selection?.kind === "enum" && selection.id === e.id}
            onSelect={() => onSelect({ kind: "enum", id: e.id })}
            onRemove={() => onRemoveEnum(e.id)}
            onRename={(n) => onRenameEnum(e.id, n)} />
        ))}
        {(draft.enums ?? []).length === 0 && <p className="px-4 pb-2 text-[10px]" style={{ color: "var(--fg-subtle)" }}>No enum types</p>}
      </div>
    </div>
  );
}
