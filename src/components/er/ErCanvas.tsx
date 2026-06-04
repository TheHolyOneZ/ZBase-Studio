import { useStore } from "../../store";
import ErViewCanvas from "./ErViewCanvas";
import ErEditCanvas from "./ErEditCanvas";
import type { SchemaSnapshot } from "../../types/schema";

interface ErCanvasProps {
  tabId: string;
  schema: SchemaSnapshot;
  engine?: string;
}

export default function ErCanvas({ tabId, schema, engine }: ErCanvasProps) {
  const { erEditMode } = useStore();
  const editMode = !!erEditMode[tabId];
  const canEdit = !engine || engine === "sqlite";

  if (editMode && canEdit) {
    return <ErEditCanvas tabId={tabId} schema={schema} />;
  }
  return <ErViewCanvas tabId={tabId} schema={schema} engine={engine} />;
}
