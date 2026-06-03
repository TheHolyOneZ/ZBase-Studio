import type { BuilderDraft, DraftTable, DraftIndex } from "../types/builder";

function col(
  name: string,
  type: string,
  opts: Partial<{
    pk: boolean; ai: boolean; nn: boolean; uq: boolean;
    fkTable: string; fkCol: string; onDelete: "CASCADE" | "SET NULL" | "RESTRICT" | "NO ACTION";
    def: string;
  }> = {},
): import("../types/builder").DraftColumn {
  return {
    id: crypto.randomUUID(),
    name,
    type,
    primaryKey: opts.pk ?? false,
    autoincrement: opts.ai ?? false,
    notNull: opts.nn ?? false,
    unique: opts.uq ?? false,
    defaultExpr: opts.def ?? null,
    check: null,
    collate: null,
    fk: opts.fkTable ? {
      table: opts.fkTable,
      column: opts.fkCol ?? "id",
      onDelete: opts.onDelete ?? "NO ACTION",
      onUpdate: "NO ACTION",
    } : null,
  };
}

function tbl(name: string, columns: ReturnType<typeof col>[], checks: string[] = []): DraftTable {
  return {
    id: crypto.randomUUID(),
    name,
    columns,
    compositePk: null,
    tableChecks: checks,
    withoutRowid: false,
    strict: false,
  };
}

function idx(name: string, table: string, columns: string[], unique = false): DraftIndex {
  return { id: crypto.randomUUID(), name, table, columns, unique, whereClause: null };
}

export interface BuiltinTemplate {
  id: string;
  name: string;
  description: string;
  tableCount: number;
  draft: BuilderDraft;
}

export const BUILTIN_TEMPLATES: BuiltinTemplate[] = [
  {
    id: "blog",
    name: "Blog",
    description: "Users, posts, and comments with FK relationships",
    tableCount: 3,
    draft: {
      label: "Blog Database",
      tables: [
        tbl("users", [
          col("id", "INTEGER", { pk: true, ai: true }),
          col("username", "TEXT", { nn: true, uq: true }),
          col("email", "TEXT", { nn: true, uq: true }),
          col("created_at", "TEXT", { nn: true, def: "CURRENT_TIMESTAMP" }),
        ]),
        tbl("posts", [
          col("id", "INTEGER", { pk: true, ai: true }),
          col("user_id", "INTEGER", { nn: true, fkTable: "users", fkCol: "id", onDelete: "CASCADE" }),
          col("title", "TEXT", { nn: true }),
          col("body", "TEXT", { nn: true }),
          col("created_at", "TEXT", { nn: true, def: "CURRENT_TIMESTAMP" }),
        ]),
        tbl("comments", [
          col("id", "INTEGER", { pk: true, ai: true }),
          col("post_id", "INTEGER", { nn: true, fkTable: "posts", fkCol: "id", onDelete: "CASCADE" }),
          col("user_id", "INTEGER", { nn: true, fkTable: "users", fkCol: "id", onDelete: "CASCADE" }),
          col("body", "TEXT", { nn: true }),
          col("created_at", "TEXT", { nn: true, def: "CURRENT_TIMESTAMP" }),
        ]),
      ],
      indexes: [
        idx("idx_posts_user_id", "posts", ["user_id"]),
        idx("idx_comments_post_id", "comments", ["post_id"]),
      ],
      views: [],
      triggers: [],
    },
  },
  {
    id: "ecommerce",
    name: "E-Commerce",
    description: "Customers, products, orders, and line items",
    tableCount: 4,
    draft: {
      label: "E-Commerce Database",
      tables: [
        tbl("customers", [
          col("id", "INTEGER", { pk: true, ai: true }),
          col("name", "TEXT", { nn: true }),
          col("email", "TEXT", { nn: true, uq: true }),
          col("created_at", "TEXT", { nn: true, def: "CURRENT_TIMESTAMP" }),
        ]),
        tbl("products", [
          col("id", "INTEGER", { pk: true, ai: true }),
          col("name", "TEXT", { nn: true }),
          col("price", "REAL", { nn: true }),
          col("stock", "INTEGER", { nn: true, def: "0" }),
        ]),
        tbl("orders", [
          col("id", "INTEGER", { pk: true, ai: true }),
          col("customer_id", "INTEGER", { nn: true, fkTable: "customers", fkCol: "id", onDelete: "RESTRICT" }),
          col("total", "REAL", { nn: true, def: "0" }),
          col("created_at", "TEXT", { nn: true, def: "CURRENT_TIMESTAMP" }),
        ]),
        tbl("order_items", [
          col("id", "INTEGER", { pk: true, ai: true }),
          col("order_id", "INTEGER", { nn: true, fkTable: "orders", fkCol: "id", onDelete: "CASCADE" }),
          col("product_id", "INTEGER", { nn: true, fkTable: "products", fkCol: "id", onDelete: "RESTRICT" }),
          col("quantity", "INTEGER", { nn: true }),
          col("unit_price", "REAL", { nn: true }),
        ]),
      ],
      indexes: [
        idx("idx_orders_customer_id", "orders", ["customer_id"]),
        idx("idx_order_items_order_id", "order_items", ["order_id"]),
      ],
      views: [],
      triggers: [],
    },
  },
  {
    id: "inventory",
    name: "Inventory",
    description: "Items, locations, suppliers, and stock levels",
    tableCount: 4,
    draft: {
      label: "Inventory Database",
      tables: [
        tbl("suppliers", [
          col("id", "INTEGER", { pk: true, ai: true }),
          col("name", "TEXT", { nn: true }),
          col("contact_email", "TEXT"),
        ]),
        tbl("items", [
          col("id", "INTEGER", { pk: true, ai: true }),
          col("sku", "TEXT", { nn: true, uq: true }),
          col("name", "TEXT", { nn: true }),
          col("supplier_id", "INTEGER", { fkTable: "suppliers", fkCol: "id", onDelete: "SET NULL" }),
        ]),
        tbl("locations", [
          col("id", "INTEGER", { pk: true, ai: true }),
          col("name", "TEXT", { nn: true, uq: true }),
        ]),
        tbl("stock_levels", [
          col("id", "INTEGER", { pk: true, ai: true }),
          col("item_id", "INTEGER", { nn: true, fkTable: "items", fkCol: "id", onDelete: "CASCADE" }),
          col("location_id", "INTEGER", { nn: true, fkTable: "locations", fkCol: "id", onDelete: "CASCADE" }),
          col("quantity", "INTEGER", { nn: true, def: "0" }),
        ], ["quantity >= 0"]),
      ],
      indexes: [
        { id: crypto.randomUUID(), name: "uq_stock_levels_item_location", table: "stock_levels", columns: ["item_id", "location_id"], unique: true, whereClause: null },
      ],
      views: [],
      triggers: [],
    },
  },
  {
    id: "tasks",
    name: "Task Tracker",
    description: "Projects, tasks, tags, and many-to-many assignments",
    tableCount: 5,
    draft: {
      label: "Task Tracker Database",
      tables: [
        tbl("projects", [
          col("id", "INTEGER", { pk: true, ai: true }),
          col("name", "TEXT", { nn: true }),
          col("created_at", "TEXT", { nn: true, def: "CURRENT_TIMESTAMP" }),
        ]),
        tbl("tasks", [
          col("id", "INTEGER", { pk: true, ai: true }),
          col("project_id", "INTEGER", { nn: true, fkTable: "projects", fkCol: "id", onDelete: "CASCADE" }),
          col("title", "TEXT", { nn: true }),
          col("done", "INTEGER", { nn: true, def: "0" }),
          col("created_at", "TEXT", { nn: true, def: "CURRENT_TIMESTAMP" }),
        ]),
        tbl("tags", [
          col("id", "INTEGER", { pk: true, ai: true }),
          col("name", "TEXT", { nn: true, uq: true }),
        ]),
        {
          id: crypto.randomUUID(),
          name: "task_tags",
          columns: [
            col("task_id", "INTEGER", { nn: true, fkTable: "tasks", fkCol: "id", onDelete: "CASCADE" }),
            col("tag_id", "INTEGER", { nn: true, fkTable: "tags", fkCol: "id", onDelete: "CASCADE" }),
          ],
          compositePk: ["task_id", "tag_id"],
          tableChecks: [],
          withoutRowid: false,
          strict: false,
        },
        tbl("users", [
          col("id", "INTEGER", { pk: true, ai: true }),
          col("name", "TEXT", { nn: true }),
        ]),
      ],
      indexes: [
        idx("idx_tasks_project_id", "tasks", ["project_id"]),
      ],
      views: [],
      triggers: [],
    },
  },
];
