import { useCallback, useEffect } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useStore } from "../../store";
import { buildErGraph, reLayoutErGraph } from "../../lib/erLayout";
import TableNode from "./TableNode";
import ErEditToolbar from "./ErEditToolbar";
import type { SchemaSnapshot } from "../../types/schema";

const nodeTypes = { tableNode: TableNode };

interface ErViewCanvasProps {
  tabId: string;
  schema: SchemaSnapshot;
  engine?: string;
}

export default function ErViewCanvas({ tabId, schema, engine }: ErViewCanvasProps) {
  const { erPositions, setErPositions, setErEditMode } = useStore();

  const toFlowNodes = (src: ReturnType<typeof buildErGraph>["nodes"]): Node[] =>
    src.map((n) => ({ ...n, data: n.data as Record<string, unknown> }));

  const { nodes: initNodes, edges: initEdges } = buildErGraph(schema, erPositions[tabId]);

  const [nodes, setNodes, onNodesChange] = useNodesState(toFlowNodes(initNodes));
  const [edges, setEdges] = useEdgesState(initEdges as unknown as Edge[]);

  useEffect(() => {
    const { nodes: newNodes, edges: newEdges } = buildErGraph(schema, erPositions[tabId]);
    setNodes(toFlowNodes(newNodes));
    setEdges(newEdges as unknown as Edge[]);
  }, [schema]);

  const onNodesChangeWithSave = useCallback(
    (changes: Parameters<typeof onNodesChange>[0]) => {
      onNodesChange(changes);
      setNodes((nds) => {
        const positions: Record<string, { x: number; y: number }> = {};
        for (const n of nds) positions[n.id] = n.position;
        setErPositions(tabId, positions);
        return nds;
      });
    },
    [onNodesChange, setErPositions, tabId],
  );

  function autoLayout() {
    const erNodes = nodes.map((n) => ({
      id: n.id,
      position: n.position,
      data: { label: String((n.data as { label?: string }).label ?? n.id) },
      type: "tableNode" as const,
    }));
    const erEdges = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? "",
      targetHandle: e.targetHandle ?? "",
      label: String((e as unknown as { label?: string }).label ?? ""),
    }));
    const relaid = reLayoutErGraph(erNodes, erEdges, schema);
    setNodes(toFlowNodes(relaid));
    const positions: Record<string, { x: number; y: number }> = {};
    for (const n of relaid) positions[n.id] = n.position;
    setErPositions(tabId, positions);
  }

  const canEdit = !engine || engine === "sqlite";

  return (
    <div className="relative h-full">
      <ErEditToolbar
        editMode={false}
        canEdit={canEdit}
        canUndo={false}
        canRedo={false}
        isDirty={false}
        onToggleMode={(on) => setErEditMode(tabId, on)}
        onUndo={() => {}}
        onRedo={() => {}}
        onDiscard={() => {}}
        onAutoLayout={autoLayout}
      />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChangeWithSave}
        fitView
        style={{ background: "var(--bg-0)" }}
      >
        <Background color="rgba(255,255,255,0.03)" variant={BackgroundVariant.Dots} />
        <Controls />
        <MiniMap
          nodeColor={() => "var(--bg-2)"}
          maskColor="rgba(0,0,0,0.4)"
          style={{ background: "var(--bg-1)", border: "1px solid var(--border)" }}
        />
      </ReactFlow>
    </div>
  );
}
