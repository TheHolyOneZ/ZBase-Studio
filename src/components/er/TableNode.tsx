import { Handle, Position, type NodeProps } from "@xyflow/react";
import { useStore } from "../../store";
import type { SchemaSnapshot } from "../../types/schema";

interface TableNodeData {
  label: string;
  [key: string]: unknown;
}

export default function TableNode({ data, id }: NodeProps) {
  const typedData = data as TableNodeData;
  const { schemas, activeTabId } = useStore();
  const schema: SchemaSnapshot | undefined = activeTabId ? schemas[activeTabId] : undefined;
  const table = schema?.tables.find((t) => t.name === id);

  return (
    <div
      className="rounded-[var(--r-md)] overflow-hidden shadow-lg select-none"
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--border)",
        minWidth: 200,
      }}
    >
      <Handle type="target" position={Position.Left} style={{ background: "var(--accent)", border: "none", width: 8, height: 8 }} />


      <div
        className="px-3 py-2 text-xs font-bold tracking-wide"
        style={{ background: "var(--accent-soft)", color: "var(--accent)", borderBottom: "1px solid var(--border)" }}
      >
        {typedData.label}
      </div>


      {table?.columns.map((col) => (
        <div
          key={col.name}
          className="flex items-center gap-2 px-3 py-1 text-[11px]"
          style={{ borderBottom: "1px solid rgba(255,255,255,0.03)", color: "var(--fg-muted)" }}
        >
          {col.pk > 0 && (
            <span className="text-[9px] font-bold uppercase" style={{ color: "#F59E0B" }}>PK</span>
          )}
          {table.foreign_keys.some((fk) => fk.from === col.name) && (
            <span className="text-[9px] font-bold uppercase" style={{ color: "var(--accent)" }}>FK</span>
          )}
          <span className="flex-1 truncate">{col.name}</span>
          <span className="text-[9px] opacity-50 uppercase shrink-0">{col.type_name}</span>
        </div>
      ))}

      <Handle type="source" position={Position.Right} style={{ background: "var(--accent)", border: "none", width: 8, height: 8 }} />
    </div>
  );
}
