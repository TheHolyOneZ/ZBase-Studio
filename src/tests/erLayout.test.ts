import { describe, it, expect } from "vitest";
import { buildErGraph } from "../lib/erLayout";
import type { SchemaSnapshot } from "../types/schema";

const mockSchema: SchemaSnapshot = {
  tables: [
    {
      name: "users",
      columns: [{ cid: 0, name: "id", type_name: "INTEGER", notnull: true, default_value: null, pk: 1 }],
      indexes: [],
      foreign_keys: [],
      row_count_estimate: 100,
    },
    {
      name: "posts",
      columns: [
        { cid: 0, name: "id", type_name: "INTEGER", notnull: true, default_value: null, pk: 1 },
        { cid: 1, name: "user_id", type_name: "INTEGER", notnull: true, default_value: null, pk: 0 },
      ],
      indexes: [],
      foreign_keys: [{ id: 0, seq: 0, table: "users", from: "user_id", to: "id", on_update: "NO ACTION", on_delete: "CASCADE" }],
      row_count_estimate: 500,
    },
  ],
  views: [],
  triggers: [],
};

describe("buildErGraph", () => {
  it("creates nodes for each table", () => {
    const { nodes } = buildErGraph(mockSchema);
    expect(nodes.map((n) => n.id).sort()).toEqual(["posts", "users"]);
  });

  it("creates an edge for the FK relationship", () => {
    const { edges } = buildErGraph(mockSchema);
    expect(edges.length).toBe(1);
    expect(edges[0].source).toBe("posts");
    expect(edges[0].target).toBe("users");
  });

  it("uses existing positions when provided", () => {
    const existing = { users: { x: 100, y: 200 }, posts: { x: 400, y: 200 } };
    const { nodes } = buildErGraph(mockSchema, existing);
    const usersNode = nodes.find((n) => n.id === "users");
    expect(usersNode?.position).toEqual({ x: 100, y: 200 });
  });
});
