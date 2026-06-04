import dagre from "dagre";
import type { SchemaSnapshot } from "../types/schema";
import type { BuilderDraft } from "../types/builder";

export interface ErNode {
  id: string;
  position: { x: number; y: number };
  data: { label: string };
  type: string;
}

export interface ErEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
  label: string;
  type?: string;
  data?: Record<string, unknown>;
}

export interface ErGraph {
  nodes: ErNode[];
  edges: ErEdge[];
}

export function buildErGraph(schema: SchemaSnapshot, existingPositions?: Record<string, { x: number; y: number }>): ErGraph {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", ranksep: 80, nodesep: 40 });

  const NODE_W = 240;
  const NODE_H_BASE = 48;
  const ROW_H = 22;

  const nodes: ErNode[] = schema.tables.map((t) => {
    const h = NODE_H_BASE + t.columns.length * ROW_H;
    g.setNode(t.name, { width: NODE_W, height: h });
    return {
      id: t.name,
      type: "tableNode" as const,
      position: existingPositions?.[t.name] ?? { x: 0, y: 0 },
      data: { label: t.name },
    };
  });

  const edges: ErEdge[] = [];
  for (const table of schema.tables) {
    for (const fk of table.foreign_keys) {
      const edgeId = `${table.name}__${fk.from}__${fk.table}__${fk.to}`;
      g.setEdge(table.name, fk.table, { label: `${fk.from} → ${fk.to}` });
      edges.push({
        id: edgeId,
        source: table.name,
        target: fk.table,
        sourceHandle: fk.from,
        targetHandle: fk.to,
        label: `${fk.from} → ${fk.to}`,
      });
    }
  }

  if (!existingPositions) {
    dagre.layout(g);
    for (const node of nodes) {
      const pos = g.node(node.id);
      if (pos) {
        node.position = { x: pos.x - NODE_W / 2, y: pos.y - (NODE_H_BASE + schema.tables.find((t) => t.name === node.id)!.columns.length * ROW_H) / 2 };
      }
    }
  }

  return { nodes, edges };
}

export function buildEditErGraph(
  draft: BuilderDraft,
  existingPositions?: Record<string, { x: number; y: number }>,
): ErGraph {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", ranksep: 80, nodesep: 40 });

  const NODE_W = 240;
  const NODE_H_BASE = 48;
  const ROW_H = 22;

  const nodes: ErNode[] = draft.tables.map((t) => {
    const h = NODE_H_BASE + t.columns.length * ROW_H;
    g.setNode(t.name, { width: NODE_W, height: h });
    return {
      id: t.name,
      type: "editableTableNode" as const,
      position: existingPositions?.[t.name] ?? { x: 0, y: 0 },
      data: { label: t.name },
    };
  });

  const edges: ErEdge[] = [];
  for (const table of draft.tables) {
    for (const col of table.columns) {
      if (col.fk) {
        const edgeId = `fk__${table.name}__${col.name}`;
        g.setEdge(table.name, col.fk.table, { label: `${col.name} → ${col.fk.column}` });
        edges.push({
          id: edgeId,
          source: table.name,
          target: col.fk.table,
          sourceHandle: `src:col:${col.name}`,
          targetHandle: `tgt:col:${col.fk.column}`,
          label: `${col.name} → ${col.fk.column}`,
          type: "fkEdge",
          data: { onDelete: col.fk.onDelete, onUpdate: col.fk.onUpdate },
        });
      }
    }
  }

  if (!existingPositions) {
    dagre.layout(g);
    for (const node of nodes) {
      const pos = g.node(node.id);
      const t = draft.tables.find((tb) => tb.name === node.id);
      if (pos && t) {
        node.position = {
          x: pos.x - NODE_W / 2,
          y: pos.y - (NODE_H_BASE + t.columns.length * ROW_H) / 2,
        };
      }
    }
  }

  return { nodes, edges };
}

export function reLayoutEditErGraph(
  nodes: ErNode[],
  edges: ErEdge[],
  draft: BuilderDraft,
): ErNode[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", ranksep: 80, nodesep: 40 });

  const NODE_W = 240;
  const NODE_H_BASE = 48;
  const ROW_H = 22;

  for (const node of nodes) {
    const t = draft.tables.find((tb) => tb.name === node.id);
    const h = t ? NODE_H_BASE + t.columns.length * ROW_H : 120;
    g.setNode(node.id, { width: NODE_W, height: h });
  }
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    const t = draft.tables.find((tb) => tb.name === n.id);
    const h = t ? NODE_H_BASE + t.columns.length * ROW_H : 120;
    return pos ? { ...n, position: { x: pos.x - NODE_W / 2, y: pos.y - h / 2 } } : n;
  });
}

export function reLayoutErGraph(nodes: ErNode[], edges: ErEdge[], schema: SchemaSnapshot): ErNode[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: "LR", ranksep: 80, nodesep: 40 });

  const NODE_W = 240;
  const NODE_H_BASE = 48;
  const ROW_H = 22;

  for (const node of nodes) {
    const t = schema.tables.find((tb) => tb.name === node.id);
    const h = t ? NODE_H_BASE + t.columns.length * ROW_H : 120;
    g.setNode(node.id, { width: NODE_W, height: h });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    const t = schema.tables.find((tb) => tb.name === n.id);
    const h = t ? NODE_H_BASE + t.columns.length * ROW_H : 120;
    return pos ? { ...n, position: { x: pos.x - NODE_W / 2, y: pos.y - h / 2 } } : n;
  });
}
