import { Database } from "lucide-react";
import SchemaTree from "./schema/SchemaTree";
import { useStore, useActiveTab } from "../store";
import EmptyState from "./common/EmptyState";

export default function Sidebar() {
  const { schemas } = useStore();
  const activeTab = useActiveTab();
  const schema = activeTab ? schemas[activeTab.id] : undefined;

  return (
    <div
      className="flex flex-col overflow-y-auto"
      style={{
        width: 240,
        minWidth: 180,
        maxWidth: 360,
        borderRight: "1px solid var(--border)",
        background: "rgba(17,22,29,0.7)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
      }}
    >
      {activeTab && schema ? (
        <>
          <div
            className="px-3 py-2 text-[10px] font-semibold uppercase tracking-widest shrink-0"
            style={{ borderBottom: "1px solid var(--border)", color: "var(--fg-subtle)" }}
          >
            Schema
          </div>
          <SchemaTree tabId={activeTab.id} schema={schema} />
        </>
      ) : (
        <EmptyState
          icon={<Database size={32} strokeWidth={1} />}
          title="No database open"
          description="Click + to open a .db file"
        />
      )}
    </div>
  );
}
