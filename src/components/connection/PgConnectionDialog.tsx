import { useState } from "react";
import { Database } from "lucide-react";
import Modal from "../common/Modal";
import Button from "../common/Button";
import { SelectInput } from "../common/FormControls";
import { openPgDb, getPgSchema } from "../../ipc/commands";
import { useStore } from "../../store";
import { extractError } from "../../lib/extractError";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface FormState {
  host: string;
  port: string;
  user: string;
  password: string;
  database: string;
  sslMode: "disable" | "prefer" | "require";
}

const DEFAULTS: FormState = {
  host: "localhost",
  port: "5432",
  user: "postgres",
  password: "",
  database: "postgres",
  sslMode: "prefer",
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

export default function PgConnectionDialog({ open, onClose }: Props) {
  const { addTab, addRecentFile, setSchema, addToast } = useStore();
  const [form, setFormState] = useState<FormState>(DEFAULTS);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const tabId = await openPgDb({
        host: form.host,
        port,
        user: form.user,
        password: form.password,
        database: form.database,
        sslMode: form.sslMode,
      });
      const label = `${form.database}@${form.host}`;
      addTab({ id: tabId, path: label, label, viewMode: "query", dirtyTxn: false, engine: "postgres" });
      addRecentFile({ path: label, label, openedAt: Date.now() });
      const schema = await getPgSchema(tabId);
      setSchema(tabId, schema);
      addToast({ type: "success", message: `Connected to ${label}` });
      onClose();
    } catch (e) {
      setError(extractError(e));
    } finally {
      setConnecting(false);
    }
  }

  function focusInput(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    (e.currentTarget as HTMLElement).style.borderColor = "var(--accent)";
  }
  function blurInput(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    (e.currentTarget as HTMLElement).style.borderColor = "var(--border)";
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Connect to PostgreSQL"
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
              placeholder="5432"
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
            placeholder="postgres"
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
              placeholder="postgres"
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


        <Field label="SSL mode">
          <SelectInput<FormState["sslMode"]>
            value={form.sslMode}
            onChange={(v) => setField("sslMode", v)}
            options={[
              { value: "prefer", label: "Prefer (auto)" },
              { value: "require", label: "Require" },
              { value: "disable", label: "Disable" },
            ]}
            style={{ width: "100%" }}
          />
        </Field>


        {error && (
          <p className="text-xs px-2 py-1.5 rounded" style={{ color: "var(--danger)", background: "rgba(255,80,80,0.08)", border: "1px solid rgba(255,80,80,0.2)" }}>
            {error}
          </p>
        )}


        <div className="flex items-start gap-2 p-2.5 rounded text-xs"
          style={{ background: "var(--bg-2)", color: "var(--fg-subtle)", border: "1px solid var(--border)" }}>
          <Database size={14} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>Connects to a running PostgreSQL server. The connection stays open for the lifetime of the tab.</span>
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
