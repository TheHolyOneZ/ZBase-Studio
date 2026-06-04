import { listen } from "@tauri-apps/api/event";
import type { ExportProgress, SearchHit } from "../types/ipc";

export const onSearchHit = (jobId: string, cb: (hits: SearchHit[]) => void) =>
  listen<SearchHit[]>(`search://hit/${jobId}`, (e) => cb(e.payload));

export const onSearchDone = (jobId: string, cb: () => void) =>
  listen<void>(`search://done/${jobId}`, () => cb());

export const onSearchError = (jobId: string, cb: (msg: string) => void) =>
  listen<string>(`search://error/${jobId}`, (e) => cb(e.payload));

export const onExportProgress = (jobId: string, cb: (p: ExportProgress) => void) =>
  listen<ExportProgress>(`export://progress/${jobId}`, (e) => cb(e.payload));

export const onExportDone = (jobId: string, cb: () => void) =>
  listen<void>(`export://done/${jobId}`, () => cb());

export const onExportError = (jobId: string, cb: (msg: string) => void) =>
  listen<string>(`export://error/${jobId}`, (e) => cb(e.payload));

export const onImportProgress = (jobId: string, cb: (written: number, total: number) => void) =>
  listen<{ written: number; total: number }>(`import://progress/${jobId}`, (e) => cb(e.payload.written, e.payload.total));

export const onImportDone = (jobId: string, cb: (written: number) => void) =>
  listen<{ written: number }>(`import://done/${jobId}`, (e) => cb(e.payload.written));
