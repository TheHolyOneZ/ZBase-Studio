import { useState } from "react";
import { Database } from "lucide-react";
import Modal from "../common/Modal";
import Button from "../common/Button";
import { openMysqlDb, getMysqlSchema } from "../../ipc/commands";
import { useStore } from "../../store";
import { extractError } from "../../lib/extractError";

interface Props {
  open: boolean;
  onClose: () => void;
  engine: "mysql" | "mariadb";
}

interface FormState {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
}

const MYSQL_DEFAULTS: FormState = {
  host: "localhost",
  port: "3306",
  user: "root",
  password: "",
  database: "mysql",
};

const MARIADB_DEFAULTS: FormState = {
  host: "localhost",
  port: "3307",
  user: "root",
  password: "",
  database: "information_schema",
};

const inputStyle: React.CSSProperties = {
  background: "var(--bg-0)",
  border: "1px solid var(--border)",
  color: "var(--fg-0)",
  padding: "5px 8px",
  borderRadius: "var(--r-sm)",
  fontSize: 12,
  width: "100%",
  outline: "none",
};

export default function MysqlConnectionDialog({ open, onClose, engine }: Props) {
  const { addTab, addRecentFile, setSchema, addToast } = useStore();
  const defaults = engine === "mariadb" ? MARIADB_DEFAULTS : MYSQL_DEFAULTS;
  const [form, setFormState] = useState<FormState>(defaults);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const title = engine === "mariadb" ? "Connect to MariaDB" : "Connect to MySQL";

  function setField(field: keyof FormState, value: string) {
    setFormState((f) => ({ ...f, [field]: value }));
    setError(null);
  }

  async function handleConnect() {
    const port = parseInt(form.port, 10);
    if (!form.host || !form.database || !form.user || isNaN(port)) {
      setError("Host, port, user, and database are required.");
      return;
    }
    setConnecting(true);
    setError(null);
    try {
      const tabId = await openMysqlDb({
        host: form.host,
        port,
        user: form.user,
        password: form.password,
        database: form.database,
        flavor: engine,
      });
      const label = `${form.database}@${form.host}`;
      addTab({ id: tabId, path: label, label, viewMode: "query", dirtyTxn: false, engine });
      addRecentFile({ path: label, label, openedAt: Date.now() });
      const schema = await getMysqlSchema(tabId);
      setSchema(tabId, schema);
      addToast({ type: "success", message: `Connected to ${label}` });
      onClose();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setConnecting(false);
    }
  }

  function focusInput(e: React.FocusEvent<HTMLInputElement>) {
    (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)";
  }
  function blurInput(e: React.FocusEvent<HTMLInputElement>) {
    (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      width={440}
      footer={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={connecting}>Cancel</Button>
          <Button variant="primary" size="sm" onClick={handleConnect} disabled={connecting}>
            {connecting ? "Connecting…" : "Connect"}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">

        <div className="flex gap-2">
          <Field label="Host" flex="1">
            <input
              style={inputStyle}
              value={form.host}
              onChange={(e) => setField("host", e.target.value)}
              onFocus={focusInput}
              onBlur={blurInput}
              placeholder="localhost"
              autoFocus
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
            />
          </Field>
          <Field label="Port" width={80}>
            <input
              style={{ ...inputStyle, width: 80 }}
              value={form.port}
              onChange={(e) => setField("port", e.target.value)}
              onFocus={focusInput}
              onBlur={blurInput}
              placeholder={engine === "mariadb" ? "3307" : "3306"}
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
            />
          </Field>
        </div>


        <Field label="Database">
          <input
            style={inputStyle}
            value={form.database}
            onChange={(e) => setField("database", e.target.value)}
            onFocus={focusInput}
            onBlur={blurInput}
            placeholder={engine === "mariadb" ? "information_schema" : "mysql"}
            onKeyDown={(e) => e.key === "Enter" && handleConnect()}
          />
        </Field>


        <div className="flex gap-2">
          <Field label="User" flex="1">
            <input
              style={inputStyle}
              value={form.user}
              onChange={(e) => setField("user", e.target.value)}
              onFocus={focusInput}
              onBlur={blurInput}
              placeholder="root"
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
            />
          </Field>
          <Field label="Password" flex="1">
            <input
              style={inputStyle}
              type="password"
              value={form.password}
              onChange={(e) => setField("password", e.target.value)}
              onFocus={focusInput}
              onBlur={blurInput}
              onKeyDown={(e) => e.key === "Enter" && handleConnect()}
            />
          </Field>
        </div>


        {error && (
          <p className="text-xs px-2 py-1.5 rounded" style={{ color: "var(--danger)", background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.2)" }}>
            {error}
          </p>
        )}


        <div className="flex items-start gap-2 p-2.5 rounded text-xs"
          style={{ background: "var(--bg-2)", color: "var(--fg-subtle)", border: "1px solid var(--border)" }}>
          <Database size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Connects to a running {engine === "mariadb" ? "MariaDB" : "MySQL"} server.
            The connection stays open for the lifetime of the tab.
          </span>
        </div>
      </div>
    </Modal>
  );
}

interface FieldProps {
  label: string;
  children: React.ReactNode;
  flex?: string;
  width?: number;
}

function Field({ label, children, flex, width }: FieldProps) {
  return (
    <div className="flex flex-col gap-1" style={flex ? { flex } : width ? { width } : {}}>
      <label className="text-xs font-medium" style={{ color: "var(--fg-muted)" }}>{label}</label>
      {children}
    </div>
  );
}
