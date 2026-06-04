import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useStore } from "../../store";
import type { ErDraft } from "../../lib/erDraft";

interface EditableTableNodeData {
  label: string;
  [key: string]: unknown;
}

export default function EditableTableNode({ data, id }: NodeProps) {
  const typedData = data as EditableTableNodeData;
  const { erDrafts, activeTabId } = useStore();
  const draft: ErDraft | undefined = activeTabId ? erDrafts?.[activeTabId] : undefined;
  const table = draft?.tables.find((t) => t.name === id);

  return (


    <div
      className="select-none"
      style={{
        minWidth: 200,
        borderRadius: "var(--r-md)",
        background: "var(--bg-1)",
        border: "1px solid var(--border)",
        boxShadow: "0 0 0 1.5px var(--accent), 0 6px 28px rgba(0,0,0,0.55)",
      }}
    >

      <div
        className="px-3 py-2 text-xs font-bold tracking-wide"
        style={{
          background: "var(--accent-soft)",
          color: "var(--accent)",
          borderBottom: "1px solid var(--border)",
          borderRadius: "calc(var(--r-md) - 1px) calc(var(--r-md) - 1px) 0 0",
        }}
      >
        {typedData.label}
      </div>

      {table?.columns.map((col) => (
        <div
          key={col.id}
          className="relative flex items-center gap-2 px-3 py-1 text-[11px]"
          style={{
            borderBottom: "1px solid rgba(255,255,255,0.03)",
            color: "var(--fg-muted)",
          }}
        >

          <Handle
            type="target"
            position={Position.Left}
            id={`tgt:col:${col.name}`}
            style={{
              background: "var(--bg-0)",
              border: "2px solid var(--accent)",
              borderRadius: "50%",
              width: 10,
              height: 10,
              left: -6,
              top: "50%",
              transform: "translateY(-50%)",
              opacity: 0.75,
            }}
          />

          {col.primaryKey && (
            <span className="text-[9px] font-bold uppercase" style={{ color: "#F59E0B" }}>PK</span>
          )}
          {col.fk && (
            <span className="text-[9px] font-bold uppercase" style={{ color: "var(--accent)" }}>FK</span>
          )}
          <span className="flex-1 truncate">{col.name}</span>
          <span className="text-[9px] opacity-50 uppercase shrink-0">{col.type}</span>


          <Handle
            type="source"
            position={Position.Right}
            id={`src:col:${col.name}`}
            style={{
              background: "var(--accent)",
              border: "2.5px solid var(--bg-1)",
              borderRadius: "50%",
              width: 14,
              height: 14,
              right: -8,
              top: "50%",
              transform: "translateY(-50%)",
              cursor: "crosshair",
              boxShadow: "0 0 0 1px var(--accent), 0 0 8px rgba(34,211,238,0.45)",
            }}
          />
        </div>
      ))}
    </div>
  );
}
