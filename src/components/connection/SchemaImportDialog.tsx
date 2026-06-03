import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import Modal from "../common/Modal";
import Button from "../common/Button";
import Spinner from "../common/Spinner";
import { useStore } from "../../store";
import { openDb, getDbSchema, closeDb } from "../../ipc/commands";
import { schemaToBuilderDraft } from "../../lib/schemaToDraft";
import { extractError } from "../../lib/extractError";

interface Props {
  open: boolean;
  onClose: () => void;
}

export default function SchemaImportDialog({ open: isOpen, onClose }: Props) {
  const { createBuilderTab, addToast } = useStore();
  const [loading, setLoading] = useState(false);

  async function handlePick() {
    const filePath = await open({
      multiple: false,
      filters: [{ name: "SQLite Database", extensions: ["db", "sqlite", "sqlite3"] }],
    });
    if (!filePath || typeof filePath !== "string") return;

    setLoading(true);
    try {
      const tmpTabId = await openDb(filePath);
      const snapshot = await getDbSchema(tmpTabId);
      await closeDb(tmpTabId).catch(() => {});

      const label = filePath.replace(/\\/g, "/").split("/").pop()?.replace(/\.(db|sqlite|sqlite3)$/i, "") ?? "imported";
      const { draft } = schemaToBuilderDraft(snapshot, `${label} (copy)`);
      createBuilderTab(draft);
      onClose();
    } catch (e) {
      addToast({ type: "error", message: `Failed to import schema: ${extractError(e)}` });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal open={isOpen} onClose={onClose} title="Import schema from existing DB" width={440}>
      <div className="flex flex-col gap-3">
        <p className="text-xs" style={{ color: "var(--fg-muted)" }}>
          Pick an existing SQLite database. Its schema (tables, indexes, views, triggers) will be copied into a new Builder draft — no data is transferred.
        </p>
        <Button variant="primary" size="sm" onClick={handlePick} disabled={loading}>
          {loading ? <><Spinner size={12} /> Reading schema…</> : "Choose database file…"}
        </Button>
      </div>
      <div className="flex justify-end mt-4">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}
