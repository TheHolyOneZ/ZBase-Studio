import type { TabId } from "./domain";

export type BuilderErrorKind =
  | "table" | "column" | "index" | "view" | "trigger" | "function"
  | "enum" | "global" | "constraint" | "routine" | "event" | "sequence";

export interface BuilderError {
  kind: BuilderErrorKind;
  objectId?: string;
  columnId?: string;
  message: string;
  statementIndex?: number;
}

export interface DestructiveOp {
  kind:
    | "drop_table" | "drop_column" | "drop_index" | "drop_view"
    | "drop_trigger" | "drop_function" | "drop_constraint" | "type_narrow"
    | "drop_enum" | "drop_routine" | "drop_sequence";
  objectName: string;
  message: string;
}

export type { TabId };
