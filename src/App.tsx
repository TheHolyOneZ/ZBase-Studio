import TitleBar from "./components/TitleBar";
import TabBar from "./components/TabBar";
import Sidebar from "./components/Sidebar";
import ViewPanel from "./components/ViewPanel";
import ToastHost from "./components/common/ToastHost";
import ContextMenu from "./components/common/ContextMenu";
import ExportDialog from "./components/export/ExportDialog";
import DatabaseExportDialog from "./components/export/DatabaseExportDialog";
import NewTabChooser from "./components/connection/NewTabChooser";
import TemplatePicker from "./components/connection/TemplatePicker";
import SchemaImportDialog from "./components/connection/SchemaImportDialog";
import CsvImporter from "./components/connection/CsvImporter";
import EditTableModal from "./components/schema/EditTableModal";
import PgConnectionDialog from "./components/connection/PgConnectionDialog";
import MysqlConnectionDialog from "./components/connection/MysqlConnectionDialog";
import { useStore } from "./store";
import { open } from "@tauri-apps/plugin-dialog";
import { openDb, openDuckDb, getDbSchema, detectFileKind, readSqlFile, executeSqlFile } from "./ipc/commands";
import { save } from "@tauri-apps/plugin-dialog";
import { extractError } from "./lib/extractError";

export default function App() {
  const {
    tableExportTarget, setTableExportTarget,
    dbExportTabId, setDbExportTabId,
    editTableTarget, setEditTableTarget,
    schemas,
    newTabChooserOpen, closeNewTabChooser,
    templatePickerOpen, setTemplatePickerOpen,
    schemaImportOpen, setSchemaImportOpen,
    csvImporterOpen, setCsvImporterOpen,
    pgConnectOpen, setPgConnectOpen,
    mysqlConnectOpen, setMysqlConnectOpen,
    mariadbConnectOpen, setMariadbConnectOpen,
    addTab, setSchema, addRecentFile, addToast, setQueryContent, setTabViewMode,
    builderDrafts, activeTabId,
  } = useStore();

  const isBuilderMode = activeTabId !== null && activeTabId in builderDrafts;

  function tauriMsg(e: unknown): string { return extractError(e); }

  async function handleOpenFile() {
    try {
      const path = await open({
        multiple: false,
        filters: [
          { name: "Database", extensions: ["db", "sqlite", "sqlite3", "duckdb"] },
          { name: "SQL Script", extensions: ["sql"] },
          { name: "All files", extensions: ["*"] },
        ],
      });
      if (!path || typeof path !== "string") return;
      await openAnyFile(path);
    } catch (e) {
      addToast({ type: "error", message: tauriMsg(e) });
    }
  }

  async function openAnyFile(path: string) {
    const label = path.replace(/\\/g, "/").split("/").pop() ?? path;
    const kind = await detectFileKind(path);
    if (kind.kind === "sqlite") {
      const tabId = await openDb(path);
      addTab({ id: tabId, path, label, viewMode: "data", dirtyTxn: false, engine: "sqlite" });
      addRecentFile({ path, label, openedAt: Date.now() });
      const schema = await getDbSchema(tabId);
      setSchema(tabId, schema);
      return;
    }
    if (kind.kind === "duckdb") {
      const tabId = await openDuckDb(path);
      addTab({ id: tabId, path, label, viewMode: "query", dirtyTxn: false, engine: "duckdb" });
      addRecentFile({ path, label, openedAt: Date.now() });
      const schema = await getDbSchema(tabId);
      setSchema(tabId, schema);
      return;
    }


    const { tabs, activeTabId } = useStore.getState();
    const activeTab = kind.fits_editor
      ? tabs.find((t) => t.id === activeTabId && t.engine !== "duckdb")
      : tabs.find((t) => t.id === activeTabId && t.engine === "sqlite");
    if (!activeTab) {
      const newDbPath = await save({
        filters: [{ name: "SQLite Database", extensions: ["db", "sqlite", "sqlite3"] }],
        defaultPath: label.replace(/\.sql$/i, ".db"),
      });
      if (!newDbPath) return;
      const tabId = await openDb(newDbPath);
      const newLabel = newDbPath.replace(/\\/g, "/").split("/").pop() ?? newDbPath;
      addTab({ id: tabId, path: newDbPath, label: newLabel, viewMode: "data", dirtyTxn: false });
      addRecentFile({ path: newDbPath, label: newLabel, openedAt: Date.now() });
      const sizeMb = (kind.size / 1_048_576).toFixed(1);
      addToast({ type: "info", message: `Importing ${label} (${sizeMb} MB)…` });
      try {
        const result = await executeSqlFile(tabId, path);
        const skipNote = result.skipped_hint > 0
          ? ` — ${result.skipped_hint} MySQL-only statements skipped${result.skipped_detail ? ` (${result.skipped_detail})` : ""}`
          : "";
        addToast({ type: "success", message: `Imported ${result.statements_hint} statements in ${result.duration_ms}ms${skipNote}` });
      } catch (importErr) {
        addToast({ type: "error", message: `Import error: ${tauriMsg(importErr)}` });
      } finally {
        const schema = await getDbSchema(tabId);
        setSchema(tabId, schema);
      }
      return;
    }
    if (kind.fits_editor) {
      const content = await readSqlFile(path);
      setQueryContent(activeTab.id, content);
      setTabViewMode(activeTab.id, "query");
      addToast({ type: "info", message: `Loaded ${label} into query editor` });
    } else {
      const sizeMb = (kind.size / 1_048_576).toFixed(1);
      addToast({ type: "info", message: `Executing ${label} (${sizeMb} MB)…` });
      const result = await executeSqlFile(activeTab.id, path);
      const skipNote = result.skipped_hint > 0
        ? ` — ${result.skipped_hint} MySQL-only statements skipped${result.skipped_detail ? ` (${result.skipped_detail})` : ""}`
        : "";
      addToast({ type: "success", message: `Done — ${result.statements_hint} statements in ${result.duration_ms}ms${skipNote}` });
      const schema = await getDbSchema(activeTab.id);
      setSchema(activeTab.id, schema);
    }
  }

  return (
    <div className="flex flex-col h-full" style={{ background: "var(--bg-0)", color: "var(--fg-0)" }}>
      <TitleBar />
      <TabBar />
      <div className="flex flex-1 overflow-hidden">
        {!isBuilderMode && <Sidebar />}
        <main className="flex-1 overflow-hidden">
          <ViewPanel />
        </main>
      </div>
      <ToastHost />
      <ContextMenu />


      <ExportDialog
        open={tableExportTarget !== null}
        onClose={() => setTableExportTarget(null)}
        tabId={tableExportTarget?.tabId ?? ""}
        table={tableExportTarget?.table ?? ""}
      />
      <DatabaseExportDialog
        open={dbExportTabId !== null}
        onClose={() => setDbExportTabId(null)}
        tabId={dbExportTabId ?? ""}
      />


      {editTableTarget && (() => {
        const tbl = schemas[editTableTarget.tabId]?.tables.find((t) => t.name === editTableTarget.table);
        return tbl ? (
          <EditTableModal
            open={true}
            onClose={() => setEditTableTarget(null)}
            tabId={editTableTarget.tabId}
            table={tbl}
          />
        ) : null;
      })()}


      <NewTabChooser
        open={newTabChooserOpen}
        onClose={closeNewTabChooser}
        onOpenFile={handleOpenFile}
      />
      <TemplatePicker
        open={templatePickerOpen}
        onClose={() => setTemplatePickerOpen(false)}
      />
      <SchemaImportDialog
        open={schemaImportOpen}
        onClose={() => setSchemaImportOpen(false)}
      />
      <CsvImporter
        open={csvImporterOpen}
        onClose={() => setCsvImporterOpen(false)}
      />
      <PgConnectionDialog
        open={pgConnectOpen}
        onClose={() => setPgConnectOpen(false)}
      />
      <MysqlConnectionDialog
        engine="mysql"
        open={mysqlConnectOpen}
        onClose={() => setMysqlConnectOpen(false)}
      />
      <MysqlConnectionDialog
        engine="mariadb"
        open={mariadbConnectOpen}
        onClose={() => setMariadbConnectOpen(false)}
      />
    </div>
  );
}
