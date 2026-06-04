# Changelog

All notable changes to ZBase Studio are documented here.

---

## [0.2.0] — ER Edit Mode · Full-Database Export & Import

### Added

#### Full-Database Export — PostgreSQL, MySQL, MariaDB
Right-click any PostgreSQL, MySQL, or MariaDB tab → **Export Database…** to dump the entire database to a `.sql` file.

**PostgreSQL export options**
- Toggle structure (tables + constraints + indexes), data, views (regular + materialized), functions, triggers, sequences, enums
- DROP … IF EXISTS CASCADE, IF NOT EXISTS, wrap in transaction
- Disable triggers option (`SET session_replication_role = 'replica'`) — requires superuser
- INSERT or INSERT … ON CONFLICT DO NOTHING
- Configurable batch size (1–5,000 rows); progress bar with live row counter
- SERIAL / BIGSERIAL / SMALLSERIAL shorthand emitted for sequence-backed columns (survives `DROP TABLE CASCADE` on re-import)
- FK constraints deferred to `ALTER TABLE … ADD CONSTRAINT` after all tables are created — handles FK cycles cleanly

**MySQL / MariaDB export options**
- Toggle structure, data, views, routines (procedures + functions), triggers
- DROP … IF EXISTS, IF NOT EXISTS, wrap in transaction
- `SET FOREIGN_KEY_CHECKS = 0 / 1` and `SET UNIQUE_CHECKS = 0 / 1` around the dump
- INSERT, REPLACE, or INSERT IGNORE
- `SHOW CREATE TABLE` / `SHOW CREATE VIEW` / `SHOW CREATE PROCEDURE` / `SHOW CREATE TRIGGER` used verbatim — preserves all MariaDB-specific syntax (`UUID`, `INET4`, `INVISIBLE` columns, etc.)
- Procedures and triggers wrapped in `DELIMITER // … DELIMITER ;`
- Tables emitted in FK dependency order (topological sort) — no FK constraint errors on import for non-cyclic schemas
- Blob / binary columns encoded as `0xHEX` (`X''` for empty blobs)
- `SET NAMES utf8mb4` charset header

#### Full-Database SQL Import — PostgreSQL, MySQL, MariaDB
Right-click any PostgreSQL, MySQL, or MariaDB tab → **Import SQL…** to replay a `.sql` dump against the live connection.

- Dialect-aware statement splitter: PG supports `$$`-dollar-quoting and nested `/* */`; MySQL/MariaDB supports `DELIMITER` directives, backtick identifiers, `#` line comments, and `/*!NNN …*/` conditional comments
- Transaction-control statements (`BEGIN`, `COMMIT`, `START TRANSACTION`, `SAVEPOINT`) are automatically skipped — each statement executes in auto-commit over the pool
- MySQL/MariaDB uses COM_QUERY (text protocol) via `sqlx::raw_sql` — supports `CREATE PROCEDURE`, `CREATE TRIGGER`, and all statement types rejected by the binary prepared-statement protocol
- Stop-on-error or continue modes; live progress bar; error summary with statement index, preview, and message
- Errors grouped and displayed after completion — no silent failures

#### Visual Schema Builder — ER Edit Mode
A full drag-and-drop schema editor lives inside the ER Diagram tab, toggled with a **View / Edit** segmented control in the top toolbar. Edit mode is SQLite-only; the toggle is disabled with a tooltip on all other engines.

**Canvas interactions**
- Double-click empty canvas → creates a new table with a default `id INTEGER PRIMARY KEY` column, positioned in a grid layout
- Click a node → opens the side panel for that table; click the background to dismiss
- Delete / Backspace on a selected node → confirmation modal before dropping (shows estimated row count as a data-loss warning)
- Ctrl+Z / Cmd+Z → undo; Ctrl+Shift+Z / Cmd+Shift+Z → redo (session-scoped per tab)

**Drag-to-FK**
- Every column row exposes a source handle (right, 13 × 13 px — intentionally large) and a target handle (left, 9 × 9 px)
- Drag from a source handle to any target handle → FK creation popover appears with ON DELETE / ON UPDATE dropdowns (custom themed, not native `<select>`)
- FK edges rendered with a custom Bezier edge (`FkEdge`); type-affinity mismatch shows an amber ⚠ badge; non-default ON DELETE / ON UPDATE actions show a compact badge on the edge midpoint

**Edge context menu**
- Right-click any FK edge → context menu with **Edit FK actions…** and **Delete FK**
- Edit FK actions opens a modal to change ON DELETE / ON UPDATE without re-drawing the line
- Delete FK removes the constraint from the source column and triggers auto-save

**Side panel** (`clamp(380px, 30vw, 520px)` wide — scales with screen)
- **Table tab** — full `TableEditor` (column name, type, PK / AI / NN / UQ / FK chips, DEFAULT, CHECK, COLLATE, drag-to-reorder, composite PK, table-level CHECK constraints, WITHOUT ROWID, STRICT)
- **Indexes tab** — shows all indexes on the selected table; add / remove indexes via `IndexEditor`; index count badge on the tab label
- Dropping a live column (one that exists in the DB) requires confirmation with row-count warning

**Toolbar**
- View / Edit toggle, Undo, Redo, Discard, Auto Layout — all in pill-group overlay, pointer-events isolated so the canvas stays interactive behind them
- Dirty dot on the toolbar when there are unsaved (un-discarded) edits

**Auto-save & reconciler**
- Every draft mutation is debounced 400 ms then diffed against the live schema (`diffDrafts → planToStatements`)
- Safe `ADD COLUMN` used when possible; full 12-step rebuild (`CREATE tmp → INSERT SELECT → DROP → RENAME`) used for all other column changes and FK additions
- Runs in a single Rust `apply_schema_plan` command: one pooled connection, `BEGIN IMMEDIATE … COMMIT`, `PRAGMA foreign_keys=OFF/ON` wrapping rebuild batches, per-rebuilt-table `PRAGMA foreign_key_check` before commit (avoids false rollbacks from pre-existing violations in unrelated tables)
- On failure: draft is reverted to the last known-good live schema; error toast shows a human-readable message (SQLITE_BUSY, FK constraint violation, FK integrity check with row count, UNIQUE, NOT NULL)
- On success: `draft.snapshot` is silently advanced to the new schema so Discard always goes back to the correct baseline without polluting undo history
- Concurrent-change safety: if a draft mutation arrives while an apply is in-flight, a retry is scheduled automatically so no change is silently dropped

**Schema fidelity on entry**
- `schemaToErDraft` enriches the converted draft by parsing each table's raw `CREATE TABLE` SQL from `sqlite_master`, preserving CHECK constraints, COLLATE, UNIQUE, and AUTOINCREMENT that are invisible to `PRAGMA table_info`

**State isolation**
- Separate `erDraftSlice` (cloned from `builderSliceFactory`) keeps undo/redo history per tab, capped at 50 entries, with no cross-contamination between tabs or the existing Database Builder

**Cable management**
- Drag the midpoint dot on any FK edge to reshape the curve — the edge stays connected; the path is stored per-edge in `erEdgePoints`
- Double-click the midpoint dot to reset the edge back to the default auto-routed bezier

### Changed
- `ErCanvas` is now a pure switcher; view-mode logic extracted to `ErViewCanvas`
- `ErEditToolbar` replaces the previous minimal Auto Layout overlay for both modes
- `SchemaSnapshot.tables[i].sql` now included in Rust introspection result (fetched from `sqlite_master`) — other engines return an empty string

### Fixed
- Sidebar open/close flicker: replaced `onSelectionChange` (which fired with empty selection whenever the sidebar mounted and resized the canvas) with `onNodeClick` + `onPaneClick` for selection tracking
- Tauri error serialization: errors from `invoke` come as `{ code, message }` objects; error parser now extracts `.message` before pattern-matching instead of calling `String(err)` which produced `[object Object]`
- All FK-related dropdowns use the custom `SelectInput` component (dark-themed portal dropdown) instead of native `<select>` elements
- Persistence: FK connections and column changes now survive a restart and are visible in the Schema Builder — `diffDrafts` was not triggering a rebuild for FK action changes or new FK additions; fixed type comparison (now case-insensitive), added ON DELETE/ON UPDATE comparison, and fixed WITHOUT ROWID / STRICT / composite PK detection
- Stale snapshot in auto-save: reconciler now reads `snapshotRef.current` when the debounce timer fires rather than the snapshot captured at effect registration time

---

## [0.1.0] — Initial Release

- SQLite: full schema browsing, query execution, table data viewer, Database Builder (visual schema editor with undo/redo), ER Diagram (view mode)
- DuckDB: schema browsing and query execution (view-only)
- PostgreSQL: schema browsing, query execution, Database Builder
- Multi-tab interface with per-engine tab isolation
- Dark theme with CSS design tokens throughout
