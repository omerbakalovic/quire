import { requireNativeModule } from "expo";

export type NativeImport =
  | {
      ok: true;
      id: string;
      hash: string;
      size: number;
      duplicate: boolean;
      title: string | null;
      authors: string[];
      language: string | null;
      publisher: string | null;
      description: string | null;
      series: string | null;
      seriesIndex: string | null;
      encryptionXml: string | null;
      coverUri: string | null;
      warnings: string[];
    }
  | { ok: false; reason: "not-epub"; detail: string | null };

type NativeLoopback = {
  start(): Promise<{ port: number; token: string }>;
  ensureStarted(): Promise<{ port: number; token: string }>;
  isServing(): boolean;
  importBook(source: string): Promise<NativeImport>;
  registerBook(id: string): boolean;
  takePendingImports(): string[];
  deleteBook(id: string): Promise<boolean>;
  readLibrary(): Promise<string | null>;
  writeLibrary(json: string): Promise<void>;
  registerIfPresent(id: string, fileName: string): Promise<boolean>;
  bookUrl(id: string): string;
  readerUrl(): string;
  launchCheck(): string | null;
  markReady(): void;
  markFirst(): void;
  hasGo(): boolean;
  hasTurns(): boolean;
  appendNote(line: string): void;
};

const native = requireNativeModule("QuireLoopback") as NativeLoopback;

export function startLoopback(): Promise<{ port: number; token: string }> {
  return native.start();
}

/** Keeps a live server and its token. Only a dead server is replaced. */
export function ensureLoopback(): Promise<{ port: number; token: string }> {
  return native.ensureStarted();
}

export function isServing(): boolean {
  return native.isServing();
}

/** Copies a picked file (content:// or file://) into app storage and reads its package document. */
export function importBook(source: string): Promise<NativeImport> {
  return native.importBook(source);
}

/** Debug seam: file:// URIs the host queued in files/quire-import. Consumed once. */
export function takePendingImports(): string[] {
  return native.takePendingImports();
}

/** Makes an imported book reachable at bookUrl(id). */
export function registerBook(id: string): boolean {
  return native.registerBook(id);
}

export function deleteBook(id: string): Promise<boolean> {
  return native.deleteBook(id);
}

export function readLibrary(): Promise<string | null> {
  return native.readLibrary();
}

export function writeLibrary(json: string): Promise<void> {
  return native.writeLibrary(json);
}

export function registerIfPresent(id: string, fileName: string): Promise<boolean> {
  return native.registerIfPresent(id, fileName);
}

/** The only name the rest of the app uses for a book. */
export function bookUrl(id: string): string {
  return native.bookUrl(id);
}

export function readerUrl(): string {
  return native.readerUrl();
}

export function launchCheck(): string | null {
  return native.launchCheck();
}

export function markReady(): void {
  native.markReady();
}

export function markFirst(): void {
  native.markFirst();
}

export function hasGo(): boolean {
  return native.hasGo();
}

export function hasTurns(): boolean {
  return native.hasTurns();
}

export function appendNote(line: string): void {
  native.appendNote(line);
}
