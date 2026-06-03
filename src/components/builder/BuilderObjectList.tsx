import { useState, useEffect, useRef } from "react";
import { Table2, List, Eye, Zap, Plus, Trash2, Pencil, Copy } from "lucide-react";
import type { BuilderDraft, BuilderSelection } from "../../types/builder";
import { useStore } from "../../store";

interface Props {
  draft: BuilderDraft;
  selection: BuilderSelection;
  onSelect: (sel: BuilderSelection) => void;
  onAddTable: () => void;
  onAddIndex: () => void;
  onAddView: () => void;
  onAddTrigger: () => void;
  onRemoveTable: (id: string) => void;
  onRemoveIndex: (id: string) => void;
  onRemoveView: (id: string) => void;
  onRemoveTrigger: (id: string) => void;
  onRenameTable: (id: string, name: string) => void;
  onRenameIndex: (id: string, name: string) => void;
  onRenameView: (id: string, name: string) => void;
  onRenameTrigger: (id: string, name: string) => void;
  onDuplicateTable: (id: string) => void;
  onDuplicateIndex: (id: string) => void;
  onDuplicateView: (id: string) => void;
  onDuplicateTrigger: (id: string) => void;
}

function GroupHeader({ icon, label, onAdd }: { icon: React.ReactNode; label: string; onAdd: () => void }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide" style={{ color: "var(--fg-subtle)" }}>
        {icon}
        {label}
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

function ObjectItem({
  label, active, onSelect, onRemove, onRename, onDuplicate,
  editing, onStartEdit, onFinishEdit,
}: {
  id?: string;
  label: string;
  active: boolean;
  onSelect: () => void;
  onRemove: () => void;
  onRename: (name: string) => void;
  onDuplicate: () => void;
  editing: boolean;
  onStartEdit: () => void;
  onFinishEdit: () => void;
}) {
  const { openContextMenu } = useStore();
  const [editVal, setEditVal] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setEditVal(label);
      requestAnimationFrame(() => { inputRef.current?.focus(); inputRef.current?.select(); });
    }
  }, [editing]);

  function commit() {
    onRename(editVal.trim() || label);
    onFinishEdit();
  }

  function cancel() {
    onFinishEdit();
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    openContextMenu(e.clientX, e.clientY, [
      { label: "Rename", icon: <Pencil size={12} />, action: onStartEdit },
      { label: "Duplicate", icon: <Copy size={12} />, action: onDuplicate },
      { label: "Delete", icon: <Trash2 size={12} />, danger: true, separator: true, action: onRemove },
    ]);
  }

  if (editing) {
    return (
      <div className="px-3 py-0.5">
        <input
          ref={inputRef}
          value={editVal}
          onChange={(e) => setEditVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { e.preventDefault(); cancel(); }
          }}
          className="w-full px-1.5 py-0.5 text-xs rounded outline-none"
          style={{
            background: "var(--bg-0)",
            border: "1px solid var(--accent)",
            color: "var(--fg-0)",
            fontFamily: "var(--font-mono, monospace)",
          }}
        />
      </div>
    );
  }

  return (
    <div
      className="group flex items-center px-4 py-1 cursor-default select-none"
      style={{
        background: active ? "var(--accent-soft)" : "transparent",
        color: active ? "var(--accent)" : "var(--fg-muted)",
      }}
      onClick={onSelect}
      onContextMenu={handleContextMenu}
    >
      <span className="flex-1 text-xs truncate">{label || "(unnamed)"}</span>
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

export default function BuilderObjectList({
  draft, selection, onSelect,
  onAddTable, onAddIndex, onAddView, onAddTrigger,
  onRemoveTable, onRemoveIndex, onRemoveView, onRemoveTrigger,
  onRenameTable, onRenameIndex, onRenameView, onRenameTrigger,
  onDuplicateTable, onDuplicateIndex, onDuplicateView, onDuplicateTrigger,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="flex flex-col overflow-y-auto h-full" style={{ borderRight: "1px solid var(--border)" }}>
      <div className="shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <GroupHeader icon={<Table2 size={10} />} label="Tables" onAdd={onAddTable} />
        {draft.tables.map((t) => (
          <ObjectItem
            key={t.id}
            id={t.id}
            label={t.name}
            active={selection?.kind === "table" && selection.id === t.id}
            onSelect={() => onSelect({ kind: "table", id: t.id })}
            onRemove={() => onRemoveTable(t.id)}
            onRename={(n) => onRenameTable(t.id, n)}
            onDuplicate={() => onDuplicateTable(t.id)}
            editing={editingId === t.id}
            onStartEdit={() => { onSelect({ kind: "table", id: t.id }); setEditingId(t.id); }}
            onFinishEdit={() => setEditingId(null)}
          />
        ))}
        {draft.tables.length === 0 && (
          <p className="px-4 pb-2 text-[10px]" style={{ color: "var(--fg-subtle)" }}>No tables</p>
        )}
      </div>

      <div className="shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <GroupHeader icon={<List size={10} />} label="Indexes" onAdd={onAddIndex} />
        {draft.indexes.map((ix) => (
          <ObjectItem
            key={ix.id}
            id={ix.id}
            label={ix.name}
            active={selection?.kind === "index" && selection.id === ix.id}
            onSelect={() => onSelect({ kind: "index", id: ix.id })}
            onRemove={() => onRemoveIndex(ix.id)}
            onRename={(n) => onRenameIndex(ix.id, n)}
            onDuplicate={() => onDuplicateIndex(ix.id)}
            editing={editingId === ix.id}
            onStartEdit={() => { onSelect({ kind: "index", id: ix.id }); setEditingId(ix.id); }}
            onFinishEdit={() => setEditingId(null)}
          />
        ))}
        {draft.indexes.length === 0 && (
          <p className="px-4 pb-2 text-[10px]" style={{ color: "var(--fg-subtle)" }}>No indexes</p>
        )}
      </div>

      <div className="shrink-0" style={{ borderBottom: "1px solid var(--border)" }}>
        <GroupHeader icon={<Eye size={10} />} label="Views" onAdd={onAddView} />
        {draft.views.map((v) => (
          <ObjectItem
            key={v.id}
            id={v.id}
            label={v.name}
            active={selection?.kind === "view" && selection.id === v.id}
            onSelect={() => onSelect({ kind: "view", id: v.id })}
            onRemove={() => onRemoveView(v.id)}
            onRename={(n) => onRenameView(v.id, n)}
            onDuplicate={() => onDuplicateView(v.id)}
            editing={editingId === v.id}
            onStartEdit={() => { onSelect({ kind: "view", id: v.id }); setEditingId(v.id); }}
            onFinishEdit={() => setEditingId(null)}
          />
        ))}
        {draft.views.length === 0 && (
          <p className="px-4 pb-2 text-[10px]" style={{ color: "var(--fg-subtle)" }}>No views</p>
        )}
      </div>

      <div className="shrink-0">
        <GroupHeader icon={<Zap size={10} />} label="Triggers" onAdd={onAddTrigger} />
        {draft.triggers.map((tr) => (
          <ObjectItem
            key={tr.id}
            id={tr.id}
            label={tr.name}
            active={selection?.kind === "trigger" && selection.id === tr.id}
            onSelect={() => onSelect({ kind: "trigger", id: tr.id })}
            onRemove={() => onRemoveTrigger(tr.id)}
            onRename={(n) => onRenameTrigger(tr.id, n)}
            onDuplicate={() => onDuplicateTrigger(tr.id)}
            editing={editingId === tr.id}
            onStartEdit={() => { onSelect({ kind: "trigger", id: tr.id }); setEditingId(tr.id); }}
            onFinishEdit={() => setEditingId(null)}
          />
        ))}
        {draft.triggers.length === 0 && (
          <p className="px-4 pb-2 text-[10px]" style={{ color: "var(--fg-subtle)" }}>No triggers</p>
        )}
      </div>
    </div>
  );
}
