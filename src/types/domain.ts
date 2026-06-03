export type TabId = string;
export type JobId = string;
export type ViewMode = "data" | "query" | "er" | "stats" | "search" | "builder";

export interface OpenTab {
  id: TabId;
  path: string;
  label: string;
  viewMode: ViewMode;
  dirtyTxn: boolean;
  isDraft?: boolean;
  engine?: "sqlite" | "duckdb" | "postgres" | "mysql" | "mariadb";
}

export interface RecentEntry {
  path: string;
  label: string;
  openedAt: number;
}

export type Toast = {
  id: string;
  type: "info" | "success" | "error" | "warning";
  message: string;
};

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  action: () => void;
  danger?: boolean;
  disabled?: boolean;
  separator?: boolean;
}

export interface SortSpec {
  column: string;
  desc: boolean;
}

export interface RowFilter {
  column: string;
  op: "=" | "!=" | "<" | ">" | "<=" | ">=" | "like" | "is_null" | "not_null";
  value: unknown;
}
