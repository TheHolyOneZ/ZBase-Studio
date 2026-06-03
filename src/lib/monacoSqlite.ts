import type * as Monaco from "monaco-editor";
import type { SchemaSnapshot } from "../types/schema";

const SQLITE_KEYWORDS = [
  "ABORT", "ACTION", "ADD", "AFTER", "ALL", "ALTER", "ALWAYS", "ANALYZE",
  "AND", "AS", "ASC", "ATTACH", "AUTOINCREMENT", "BEFORE", "BEGIN", "BETWEEN",
  "BY", "CASCADE", "CASE", "CAST", "CHECK", "COLLATE", "COLUMN", "COMMIT",
  "CONFLICT", "CONSTRAINT", "CREATE", "CROSS", "CURRENT", "CURRENT_DATE",
  "CURRENT_TIME", "CURRENT_TIMESTAMP", "DATABASE", "DEFAULT", "DEFERRABLE",
  "DEFERRED", "DELETE", "DESC", "DETACH", "DISTINCT", "DO", "DROP", "EACH",
  "ELSE", "END", "ESCAPE", "EXCEPT", "EXCLUDE", "EXCLUSIVE", "EXISTS",
  "EXPLAIN", "FAIL", "FILTER", "FIRST", "FOLLOWING", "FOR", "FOREIGN",
  "FROM", "FULL", "GENERATED", "GLOB", "GROUP", "GROUPS", "HAVING", "IF",
  "IGNORE", "IMMEDIATE", "IN", "INDEX", "INDEXED", "INITIALLY", "INNER",
  "INSERT", "INSTEAD", "INTERSECT", "INTO", "IS", "ISNULL", "JOIN", "KEY",
  "LAST", "LEFT", "LIKE", "LIMIT", "MATCH", "MATERIALIZED", "NATURAL",
  "NO", "NOT", "NOTHING", "NOTNULL", "NULL", "NULLS", "OF", "OFFSET", "ON",
  "OR", "ORDER", "OTHERS", "OUTER", "OVER", "PARTITION", "PLAN", "PRAGMA",
  "PRECEDING", "PRIMARY", "QUERY", "RAISE", "RANGE", "RECURSIVE", "REFERENCES",
  "REGEXP", "REINDEX", "RELEASE", "RENAME", "REPLACE", "RESTRICT", "RETURNING",
  "RIGHT", "ROLLBACK", "ROW", "ROWS", "SAVEPOINT", "SELECT", "SET", "TABLE",
  "TEMP", "TEMPORARY", "THEN", "TIES", "TO", "TRANSACTION", "TRIGGER",
  "UNBOUNDED", "UNION", "UNIQUE", "UPDATE", "USING", "VACUUM", "VALUES",
  "VIEW", "VIRTUAL", "WHEN", "WHERE", "WINDOW", "WITH", "WITHOUT",
];

const SQLITE_FUNCTIONS = [
  "abs", "avg", "ceil", "changes", "char", "coalesce", "count", "date",
  "datetime", "floor", "format", "glob", "group_concat", "hex", "ifnull",
  "instr", "json", "json_array", "json_extract", "json_object", "julianday",
  "last_insert_rowid", "length", "like", "lower", "ltrim", "max", "min",
  "mod", "nullif", "printf", "quote", "random", "randomblob", "replace",
  "round", "rtrim", "sign", "soundex", "sqlite_source_id", "sqlite_version",
  "strftime", "substr", "substring", "sum", "time", "total", "total_changes",
  "trim", "typeof", "unicode", "unlikely", "upper", "zeroblob",
];

export function defineMonacoTheme(monaco: typeof Monaco) {
  monaco.editor.defineTheme("zbase-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "keyword.sql", foreground: "22D3EE", fontStyle: "bold" },
      { token: "string.sql", foreground: "D4A76A" },
      { token: "comment", foreground: "4A5568", fontStyle: "italic" },
      { token: "number", foreground: "7DD3FC" },
      { token: "operator.sql", foreground: "A78BFA" },
    ],
    colors: {
      "editor.background": "#0B0F14",
      "editor.foreground": "#E6EDF3",
      "editor.lineHighlightBackground": "#11161D",
      "editorCursor.foreground": "#22D3EE",
      "editor.selectionBackground": "#22D3EE33",
      "editorLineNumber.foreground": "#4A5568",
      "editorLineNumber.activeForeground": "#8A94A6",
      "editor.inactiveSelectionBackground": "#22D3EE1A",
    },
  });
}

export function registerSqliteCompletions(
  monaco: typeof Monaco,
  getSchema: () => SchemaSnapshot | undefined,
): Monaco.IDisposable {
  return monaco.languages.registerCompletionItemProvider("sql", {
    triggerCharacters: [" ", ".", "("],
    provideCompletionItems(model, position) {
      const schema = getSchema();
      const wordInfo = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: wordInfo.startColumn,
        endColumn: wordInfo.endColumn,
      };

      const suggestions: Monaco.languages.CompletionItem[] = [];

      for (const kw of SQLITE_KEYWORDS) {
        suggestions.push({
          label: kw,
          kind: monaco.languages.CompletionItemKind.Keyword,
          insertText: kw,
          range,
        });
      }

      for (const fn of SQLITE_FUNCTIONS) {
        suggestions.push({
          label: fn,
          kind: monaco.languages.CompletionItemKind.Function,
          insertText: `${fn}($1)`,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
        });
      }

      if (schema) {
        for (const t of schema.tables) {
          suggestions.push({
            label: t.name,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: t.name,
            range,
          });
          for (const c of t.columns) {
            suggestions.push({
              label: `${t.name}.${c.name}`,
              kind: monaco.languages.CompletionItemKind.Field,
              insertText: c.name,
              detail: `${t.name} · ${c.type_name}`,
              range,
            });
          }
        }
        for (const v of schema.views) {
          suggestions.push({
            label: v.name,
            kind: monaco.languages.CompletionItemKind.Interface,
            insertText: v.name,
            range,
          });
        }
      }

      return { suggestions };
    },
  });
}
