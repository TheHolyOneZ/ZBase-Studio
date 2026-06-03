import { FolderOpen, HardDrive, LayoutTemplate, Database, FileInput, Server } from "lucide-react";
import Modal from "../common/Modal";
import { useStore } from "../../store";
import Button from "../common/Button";

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenFile: () => void;
}

export default function NewTabChooser({ open, onClose, onOpenFile }: Props) {
  const {
    createBuilderTab, setTemplatePickerOpen, setSchemaImportOpen,
    setCsvImporterOpen, closeNewTabChooser, setPgConnectOpen,
    setMysqlConnectOpen, setMariadbConnectOpen,
  } = useStore();

  function handlePick(action: () => void) {
    closeNewTabChooser();
    action();
  }

  return (
    <Modal open={open} onClose={onClose} title="New tab" width={560}>
      <div className="grid grid-cols-1 gap-2">


        <Card
          icon={<FolderOpen size={20} />}
          title="Open existing file"
          desc=".db  ·  .sqlite  ·  .sqlite3  ·  .duckdb  ·  .sql"
          onClick={() => handlePick(onOpenFile)}
        />


        <Card
          icon={<HardDrive size={20} />}
          title="SQLite Database Builder"
          desc="Design a new SQLite database from scratch with a visual schema editor"
          onClick={() => handlePick(() => createBuilderTab())}
        />


        <Card
          icon={<Server size={20} />}
          title="Connect to PostgreSQL"
          desc="Connect to a running PostgreSQL server over TCP"
          onClick={() => handlePick(() => setPgConnectOpen(true))}
        />
        <Card
          icon={<Server size={20} />}
          title="Connect to MySQL"
          desc="Connect to a running MySQL 8+ server over TCP"
          onClick={() => handlePick(() => setMysqlConnectOpen(true))}
        />
        <Card
          icon={<Server size={20} />}
          title="Connect to MariaDB"
          desc="Connect to a running MariaDB 10.3+ server over TCP"
          onClick={() => handlePick(() => setMariadbConnectOpen(true))}
        />


        <div className="grid grid-cols-3 gap-2">
          <Card
            icon={<LayoutTemplate size={18} />}
            title="From template…"
            desc="Blog, E-commerce, Inventory, Tasks"
            small
            onClick={() => handlePick(() => setTemplatePickerOpen(true))}
          />
          <Card
            icon={<Database size={18} />}
            title="From existing schema…"
            desc="Clone the schema of an existing .db"
            small
            onClick={() => handlePick(() => setSchemaImportOpen(true))}
          />
          <Card
            icon={<FileInput size={18} />}
            title="From CSV…"
            desc="Auto-detect types and create a table"
            small
            onClick={() => handlePick(() => setCsvImporterOpen(true))}
          />
        </div>
      </div>

      <div className="flex justify-end mt-3">
        <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
      </div>
    </Modal>
  );
}

interface CardProps {
  icon: React.ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
  small?: boolean;
}

function Card({ icon, title, desc, onClick, small }: CardProps) {
  return (
    <button
      onClick={onClick}
      className="flex items-start gap-3 p-3 rounded-[var(--r-sm)] text-left cursor-default transition-all w-full"
      style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--fg-subtle)"; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)"; }}
    >
      <span style={{ color: "var(--fg-subtle)", flexShrink: 0, marginTop: 1 }}>{icon}</span>
      <div className="min-w-0">
        <p className={`font-medium leading-tight ${small ? "text-xs" : "text-sm"}`} style={{ color: "var(--fg-0)" }}>
          {title}
        </p>
        <p className={`mt-0.5 ${small ? "text-[10px]" : "text-xs"}`} style={{ color: "var(--fg-subtle)" }}>
          {desc}
        </p>
      </div>
    </button>
  );
}
