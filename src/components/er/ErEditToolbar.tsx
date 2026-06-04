import { LayoutGrid, Undo2, Redo2, RotateCcw } from "lucide-react";
import { clsx } from "clsx";
import Button from "../common/Button";

interface ErEditToolbarProps {
  editMode: boolean;
  canEdit: boolean;
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  onToggleMode: (on: boolean) => void;
  onUndo: () => void;
  onRedo: () => void;
  onDiscard: () => void;
  onAutoLayout: () => void;
}

export default function ErEditToolbar({
  editMode,
  canEdit,
  canUndo,
  canRedo,
  isDirty,
  onToggleMode,
  onUndo,
  onRedo,
  onDiscard,
  onAutoLayout,
}: ErEditToolbarProps) {
  return (
    <div className="absolute top-3 left-3 right-3 z-10 flex items-start justify-between pointer-events-none">
      <div
        className="flex items-center gap-0.5 rounded-[var(--r-sm)] p-0.5 pointer-events-auto"
        style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
      >
        <button
          onClick={() => onToggleMode(false)}
          className={clsx(
            "px-2.5 py-1 rounded-[4px] text-xs font-medium transition-all cursor-default select-none",
            !editMode
              ? "text-[var(--fg-0)]"
              : "text-[var(--fg-subtle)] hover:text-[var(--fg-muted)]",
          )}
          style={!editMode ? { background: "var(--bg-0)" } : undefined}
        >
          View
        </button>
        <button
          onClick={() => onToggleMode(true)}
          disabled={!canEdit}
          title={!canEdit ? "Edit mode is only available for SQLite databases" : undefined}
          className={clsx(
            "px-2.5 py-1 rounded-[4px] text-xs font-medium transition-all cursor-default select-none disabled:opacity-40 disabled:pointer-events-none",
            editMode
              ? "text-[var(--fg-0)]"
              : "text-[var(--fg-subtle)] hover:text-[var(--fg-muted)]",
          )}
          style={editMode ? { background: "var(--bg-0)" } : undefined}
        >
          Edit
        </button>

        {editMode && (
          <>
            <div className="w-px h-4 mx-0.5 shrink-0" style={{ background: "var(--border)" }} />
            <Button
              size="sm"
              variant="ghost"
              disabled={!canUndo}
              onClick={onUndo}
              title="Undo (Ctrl+Z)"
            >
              <Undo2 size={12} />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={!canRedo}
              onClick={onRedo}
              title="Redo (Ctrl+Shift+Z)"
            >
              <Redo2 size={12} />
            </Button>
            <div className="w-px h-4 mx-0.5 shrink-0" style={{ background: "var(--border)" }} />
            <Button
              size="sm"
              variant="ghost"
              disabled={!isDirty}
              onClick={onDiscard}
              title="Discard all changes in this session"
            >
              <RotateCcw size={12} />
              Discard
            </Button>
          </>
        )}
      </div>

      <Button
        size="sm"
        variant="ghost"
        onClick={onAutoLayout}
        className="pointer-events-auto"
        style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
      >
        <LayoutGrid size={12} />
        Auto Layout
      </Button>
    </div>
  );
}
