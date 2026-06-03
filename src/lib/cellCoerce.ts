export function cellDisplay(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "object" && value !== null) {
    if ("__blob" in value) return "[BLOB]";
    return JSON.stringify(value);
  }
  return String(value);
}

export function isNull(value: unknown): boolean {
  return value === null || value === undefined;
}

export function isBlob(value: unknown): boolean {
  return typeof value === "object" && value !== null && "__blob" in value;
}

export function parseInputValue(raw: string, declType: string): unknown {
  if (raw === "" || raw.toLowerCase() === "null") return null;
  const t = declType.toUpperCase();
  if (t.includes("INT")) {
    const n = parseInt(raw, 10);
    return isNaN(n) ? raw : n;
  }
  if (t.includes("REAL") || t.includes("FLOAT") || t.includes("DOUBLE")) {
    const n = parseFloat(raw);
    return isNaN(n) ? raw : n;
  }
  return raw;
}
