import { useCallback, useEffect, useRef, useState } from "react";
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
  type Connection,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useStore } from "../../store";
import { buildEditErGraph, reLayoutEditErGraph } from "../../lib/erLayout";
import EditableTableNode from "./EditableTableNode";
import FkEdge from "./FkEdge";
import ErEditToolbar from "./ErEditToolbar";
import ConfirmDropModal from "./ConfirmDropModal";
import ErSidePanel from "./ErSidePanel";
import FkPopover from "./FkPopover";
import FkEditModal from "./FkEditModal";
import EdgeContextMenu from "./EdgeContextMenu";
import { useErAutoApply } from "../../lib/erAutoApply";
import type { SchemaSnapshot } from "../../types/schema";
import type { DraftColumn, DraftTable, FkAction } from "../../types/builder";

const nodeTypes = { editableTableNode: EditableTableNode };
const edgeTypes = { fkEdge: FkEdge };

interface ErEditCanvasProps {
  tabId: string;
  schema: SchemaSnapshot;
}

function makePkColumn(): DraftColumn {
  return {
    id: crypto.randomUUID(),
    name: "id",
    type: "INTEGER",
    primaryKey: true,
    autoincrement: false,
    notNull: false,
    unique: false,
    defaultExpr: null,
    check: null,
    collate: null,
    fk: null,
  };
}

function makeNewTable(existingCount: number): DraftTable & { position: { x: number; y: number } } {
  const name = `new_table_${existingCount + 1}`;
  return {
    id: crypto.randomUUID(),
    name,
    columns: [makePkColumn()],
    compositePk: null,
    tableChecks: [],
    withoutRowid: false,
    strict: false,
    position: {
      x: 80 + (existingCount % 4) * 280,
      y: 80 + Math.floor(existingCount / 4) * 220,
    },
  };
}

export default function ErEditCanvas({ tabId, schema }: ErEditCanvasProps) {
  const {
    erPositions,
    setErPositions,
    setErEditMode,
    erDrafts,
    erDraftHistory,
    erDraftFuture,
    initErDraft,
    updateErDraft,
    undoErDraft,
    redoErDraft,
    discardErDraft,
    setErEdgePoint,
    schemas,
  } = useStore();

  const draft = erDrafts?.[tabId];
  const liveSnapshot = schemas[tabId] ?? schema;


  useEffect(() => {
    if (!erDrafts?.[tabId]) {
      initErDraft(tabId, liveSnapshot);
    }
  }, [tabId]);


  useErAutoApply(tabId);

  const toFlowNodes = (src: ReturnType<typeof buildEditErGraph>["nodes"]): Node[] =>
    src.map((n) => ({ ...n, data: n.data as Record<string, unknown> }));

  const initGraph = draft
    ? buildEditErGraph(draft, erPositions[tabId])
    : { nodes: [], edges: [] };

  const [nodes, setNodes, onNodesChange] = useNodesState(toFlowNodes(initGraph.nodes));
  const [edges, setEdges] = useEdgesState(initGraph.edges as unknown as Edge[]);


  useEffect(() => {
    if (!draft) return;
    const { nodes: newNodes, edges: newEdges } = buildEditErGraph(draft, erPositions[tabId]);
    setNodes(toFlowNodes(newNodes));
    setEdges(newEdges as unknown as Edge[]);
  }, [draft]);

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


  const lastPaneClickTime = useRef(0);
  const onPaneClick = useCallback(
    (_event: React.MouseEvent) => {
      const now = Date.now();
      if (now - lastPaneClickTime.current < 300) {
        lastPaneClickTime.current = 0;
        const count = draft?.tables.length ?? 0;
        const newTableData = makeNewTable(count);
        const { position, ...newTable } = newTableData;
        updateErDraft(tabId, (d) => ({ ...d, tables: [...d.tables, newTable] }));
        setErPositions(tabId, {
          ...(erPositions[tabId] ?? {}),
          [newTable.name]: position,
        });
      } else {
        lastPaneClickTime.current = now;
        setSelectedNodeId(null);
      }
    },
    [draft, tabId, updateErDraft, setErPositions, erPositions],
  );


  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ name: string; rowCount?: number | null } | null>(null);

  const onNodeClick = useCallback((_e: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);


  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      const inInput = target.tagName === "INPUT" || target.tagName === "TEXTAREA";


      if ((e.ctrlKey || e.metaKey) && e.key === "z" && !inInput) {
        e.preventDefault();
        if (e.shiftKey) {
          redoErDraft(tabId);
        } else {
          undoErDraft(tabId);
        }
        return;
      }


      if ((e.key === "Delete" || e.key === "Backspace") && selectedNodeId && !inInput) {
        e.preventDefault();
        const tableSnap = liveSnapshot.tables.find((t) => t.name === selectedNodeId);
        setDropTarget({
          name: selectedNodeId,
          rowCount: tableSnap?.row_count_estimate ?? null,
        });
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedNodeId, liveSnapshot, undoErDraft, redoErDraft, tabId]);

  function confirmDrop() {
    if (!dropTarget) return;
    const name = dropTarget.name;
    updateErDraft(tabId, (d) => ({
      ...d,
      tables: d.tables.filter((t) => t.name !== name),
      indexes: d.indexes.filter((i) => i.table !== name),
    }));
    setDropTarget(null);
    setSelectedNodeId(null);
  }


  const [pendingConnection, setPendingConnection] = useState<Connection | null>(null);

  const onConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target || !connection.sourceHandle || !connection.targetHandle) return;
    setPendingConnection(connection);
  }, []);

  function confirmFk(connection: Connection, onDelete: FkAction, onUpdate: FkAction) {
    const srcColName = (connection.sourceHandle ?? "").replace(/^src:col:/, "");
    updateErDraft(tabId, (d) => ({
      ...d,
      tables: d.tables.map((t) => {
        if (t.name !== connection.source) return t;
        return {
          ...t,
          columns: t.columns.map((c) => {
            if (c.name !== srcColName) return c;
            const tgtColName = (connection.targetHandle ?? "").replace(/^tgt:col:/, "");
            return { ...c, fk: { table: connection.target!, column: tgtColName, onDelete, onUpdate } };
          }),
        };
      }),
    }));
    setPendingConnection(null);
  }


  type EdgeCtx = { x: number; y: number; edgeId: string; label: string };
  const [edgeCtx, setEdgeCtx] = useState<EdgeCtx | null>(null);
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);

  const onEdgeContextMenu = useCallback((e: React.MouseEvent, edge: Edge) => {
    e.preventDefault();
    setEdgeCtx({
      x: e.clientX,
      y: e.clientY,
      edgeId: edge.id,
      label: String((edge as unknown as { label?: string }).label ?? edge.id),
    });
  }, []);

  function parseEdgeId(edgeId: string): { srcTable: string; srcCol: string } {

    const parts = edgeId.split("__");
    return { srcTable: parts[1] ?? "", srcCol: parts[2] ?? "" };
  }

  function deleteFkEdge(edgeId: string) {
    const { srcTable, srcCol } = parseEdgeId(edgeId);
    updateErDraft(tabId, (d) => ({
      ...d,
      tables: d.tables.map((t) =>
        t.name !== srcTable ? t : {
          ...t,
          columns: t.columns.map((c) => c.name !== srcCol ? c : { ...c, fk: null }),
        },
      ),
    }));
    setErEdgePoint(tabId, edgeId, null);
  }

  function saveFkEdit(onDelete: FkAction, onUpdate: FkAction) {
    if (!editingEdgeId) return;
    const { srcTable, srcCol } = parseEdgeId(editingEdgeId);
    updateErDraft(tabId, (d) => ({
      ...d,
      tables: d.tables.map((t) =>
        t.name !== srcTable ? t : {
          ...t,
          columns: t.columns.map((c) =>
            c.name !== srcCol || !c.fk ? c : { ...c, fk: { ...c.fk, onDelete, onUpdate } },
          ),
        },
      ),
    }));
    setEditingEdgeId(null);
  }

  function autoLayout() {
    if (!draft) return;
    const erNodes = nodes.map((n) => ({
      id: n.id,
      position: n.position,
      data: { label: String((n.data as { label?: string }).label ?? n.id) },
      type: "editableTableNode" as const,
    }));
    const erEdges = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle ?? "",
      targetHandle: e.targetHandle ?? "",
      label: String((e as unknown as { label?: string }).label ?? ""),
    }));
    const relaid = reLayoutEditErGraph(erNodes, erEdges, draft);
    setNodes(toFlowNodes(relaid));
    const positions: Record<string, { x: number; y: number }> = {};
    for (const n of relaid) positions[n.id] = n.position;
    setErPositions(tabId, positions);
  }

  const historyLen = erDraftHistory?.[tabId]?.length ?? 0;
  const futureLen = erDraftFuture?.[tabId]?.length ?? 0;

  return (
    <div className="flex h-full">
      <div className="relative flex-1 min-w-0">
        <ErEditToolbar
          editMode={true}
          canEdit={true}
          canUndo={historyLen > 0}
          canRedo={futureLen > 0}
          isDirty={historyLen > 0}
          onToggleMode={(on) => { if (!on) setErEditMode(tabId, false); }}
          onUndo={() => undoErDraft(tabId)}
          onRedo={() => redoErDraft(tabId)}
          onDiscard={() => discardErDraft(tabId)}
          onAutoLayout={autoLayout}
        />

        <ConfirmDropModal
          open={!!dropTarget}
          kind="table"
          name={dropTarget?.name ?? ""}
          rowCount={dropTarget?.rowCount}
          onConfirm={confirmDrop}
          onCancel={() => setDropTarget(null)}
        />

      {pendingConnection && (
        <FkPopover
          connection={pendingConnection}
          onConfirm={confirmFk}
          onCancel={() => setPendingConnection(null)}
        />
      )}


      {edgeCtx && (
        <EdgeContextMenu
          x={edgeCtx.x}
          y={edgeCtx.y}
          edgeLabel={edgeCtx.label}
          onEdit={() => setEditingEdgeId(edgeCtx.edgeId)}
          onDelete={() => deleteFkEdge(edgeCtx.edgeId)}
          onClose={() => setEdgeCtx(null)}
        />
      )}


      {editingEdgeId && (() => {
        const { srcTable, srcCol } = parseEdgeId(editingEdgeId);
        const srcTableDraft = draft?.tables.find((t) => t.name === srcTable);
        const col = srcTableDraft?.columns.find((c) => c.name === srcCol);
        if (!col?.fk) return null;
        return (
          <FkEditModal
            sourceTable={srcTable}
            sourceCol={srcCol}
            targetTable={col.fk.table}
            targetCol={col.fk.column}
            initialOnDelete={col.fk.onDelete}
            initialOnUpdate={col.fk.onUpdate}
            onConfirm={saveFkEdit}
            onCancel={() => setEditingEdgeId(null)}
          />
        );
      })()}

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChangeWithSave}
        onNodeClick={onNodeClick}
        onConnect={onConnect}
        onPaneClick={onPaneClick}
        onEdgeContextMenu={onEdgeContextMenu}
        nodesConnectable={true}
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

      {selectedNodeId && (
        <ErSidePanel
          tabId={tabId}
          tableName={selectedNodeId}
          liveSnapshot={liveSnapshot}
          onClose={() => setSelectedNodeId(null)}
        />
      )}
    </div>
  );
}
