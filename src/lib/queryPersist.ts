const PREFIX = "zbase_q:";

let timer: ReturnType<typeof setTimeout> | null = null;

export function saveQuery(path: string, content: string): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    try {
      if (content.trim()) localStorage.setItem(PREFIX + path, content);
      else localStorage.removeItem(PREFIX + path);
    } catch {}
  }, 400);
}

export function loadQuery(path: string): string {
  try { return localStorage.getItem(PREFIX + path) ?? ""; } catch { return ""; }
}
