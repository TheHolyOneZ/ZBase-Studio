

export const isMac: boolean =
  typeof navigator !== "undefined" &&
  /mac/i.test(navigator.platform);

export const modKey: string = isMac ? "⌘" : "Ctrl";
export const modLabel = (key: string): string =>
  isMac ? `⌘${key}` : `Ctrl+${key}`;
