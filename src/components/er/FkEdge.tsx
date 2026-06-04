import { useRef } from "react";
import { BaseEdge, EdgeLabelRenderer, getBezierPath, useReactFlow, type EdgeProps } from "@xyflow/react";
import { useStore } from "../../store";

function sqliteAffinity(type: string): string {
  const t = type.toUpperCase();
  if (t.includes("INT")) return "INTEGER";
  if (t.includes("CHAR") || t.includes("CLOB") || t.includes("TEXT")) return "TEXT";
  if (t === "BLOB" || t === "") return "BLOB";
  if (t.includes("REAL") || t.includes("FLOA") || t.includes("DOUB")) return "REAL";
  return "NUMERIC";
}

interface FkEdgeData {
  onDelete?: string;
  onUpdate?: string;
  [key: string]: unknown;
}

export default function FkEdge({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  sourceHandleId,
  targetHandleId,
}: EdgeProps) {
  const edgeData = (data ?? {}) as FkEdgeData;
  const { erDrafts, erEdgePoints, setErEdgePoint, activeTabId } = useStore();
  const { screenToFlowPosition } = useReactFlow();
  const draft = activeTabId ? erDrafts?.[activeTabId] : undefined;
  const controlPoint = activeTabId ? erEdgePoints?.[activeTabId]?.[id] : undefined;
  const dragging = useRef(false);


  let typeMismatch = false;
  if (draft && sourceHandleId && targetHandleId) {
    const srcColName = sourceHandleId.replace(/^src:col:/, "");
    const tgtColName = targetHandleId.replace(/^tgt:col:/, "");
    const srcCol = draft.tables.find((t) => t.name === source)?.columns.find((c) => c.name === srcColName);
    const tgtCol = draft.tables.find((t) => t.name === target)?.columns.find((c) => c.name === tgtColName);
    if (srcCol && tgtCol) typeMismatch = sqliteAffinity(srcCol.type) !== sqliteAffinity(tgtCol.type);
  }


  let pathD: string;
  let midX: number;
  let midY: number;

  if (controlPoint) {


    const cpX = 2 * controlPoint.x - 0.5 * (sourceX + targetX);
    const cpY = 2 * controlPoint.y - 0.5 * (sourceY + targetY);
    pathD = `M${sourceX},${sourceY} Q${cpX},${cpY} ${targetX},${targetY}`;
    midX = controlPoint.x;
    midY = controlPoint.y;
  } else {
    const [path, lx, ly] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition });
    pathD = path;
    midX = lx;
    midY = ly;
  }


  function onMidpointMouseDown(e: React.MouseEvent) {
    if (!activeTabId) return;
    e.stopPropagation();
    e.preventDefault();
    dragging.current = true;

    function onMove(me: MouseEvent) {
      if (!dragging.current) return;
      const pos = screenToFlowPosition({ x: me.clientX, y: me.clientY });
      setErEdgePoint(activeTabId!, id, pos);
    }
    function onUp() {
      dragging.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  }

  const accentColor = typeMismatch ? "var(--warning)" : "var(--accent)";
  const onDelete = edgeData.onDelete ?? "NO ACTION";
  const onUpdate = edgeData.onUpdate ?? "NO ACTION";
  const showActions = onDelete !== "NO ACTION" || onUpdate !== "NO ACTION";

  return (
    <>
      <BaseEdge
        id={id}
        path={pathD}
        style={{
          stroke: accentColor,
          strokeWidth: 1.5,
        }}
      />
      <EdgeLabelRenderer>

        <div
          className="nodrag nopan"
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${midX}px,${midY}px)`,
            pointerEvents: "all",
            cursor: dragging.current ? "grabbing" : "grab",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 3,
          }}
          onMouseDown={onMidpointMouseDown}
          onDoubleClick={(e) => {
            e.stopPropagation();
            if (activeTabId) setErEdgePoint(activeTabId, id, null);
          }}
        >

          <div
            style={{
              width: 9,
              height: 9,
              borderRadius: "50%",
              background: controlPoint ? accentColor : "var(--bg-2)",
              border: `1.5px solid ${accentColor}`,
              boxShadow: controlPoint ? `0 0 5px rgba(34,211,238,0.4)` : "none",
              opacity: controlPoint ? 1 : 0.55,
              transition: "opacity 0.1s, background 0.1s",
            }}
          />


          {(typeMismatch || showActions) && (
            <div style={{ display: "flex", gap: 2, pointerEvents: "none" }}>
              {typeMismatch && (
                <span
                  className="px-1 py-0.5 rounded font-bold"
                  style={{ background: "var(--warning)", color: "#000", fontSize: 9 }}
                  title="Type affinity mismatch"
                >
                  ⚠
                </span>
              )}
              {showActions && (
                <span
                  className="px-1 py-0.5 rounded font-mono"
                  style={{
                    background: "var(--bg-2)",
                    color: "var(--fg-muted)",
                    border: "1px solid var(--border)",
                    fontSize: 9,
                  }}
                >
                  {onDelete !== "NO ACTION" ? `DEL:${onDelete.slice(0, 3)}` : ""}
                  {onDelete !== "NO ACTION" && onUpdate !== "NO ACTION" ? " " : ""}
                  {onUpdate !== "NO ACTION" ? `UPD:${onUpdate.slice(0, 3)}` : ""}
                </span>
              )}
            </div>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  );
}
