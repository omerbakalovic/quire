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

export type FontImport =
  | { ok: true; file: string; name: string | null }
  | { ok: false; reason: "unreadable" | "not-font" | "too-large" | "bad-id" };

export type IncomingBook = { uri: string; name: string | null };

type NativeLoopback = {
  takeIncomingBooks(): IncomingBook[];
  averageColor(coverUri: string): Promise<string | null>;
  addListener(event: "onIncomingBooks", listener: (event: { count: number }) => void): { remove(): void };
  start(): Promise<{ port: number; token: string }>;
  ensureStarted(): Promise<{ port: number; token: string }>;
  isServing(): boolean;
  importBook(source: string): Promise<NativeImport>;
  registerBook(id: string): boolean;
  takePendingImports(): string[];
  takeCommands(): string[];
  deleteBook(id: string): Promise<boolean>;
  readLibrary(): Promise<string | null>;
  writeLibrary(json: string): Promise<void>;
  registerIfPresent(id: string, fileName: string): Promise<boolean>;
  importFont(source: string, id: string): Promise<FontImport>;
  deleteFont(file: string): Promise<boolean>;
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

/** The average colour (#RRGGBB) of a stored cover, or null. */
export function averageColor(coverUri: string): Promise<string | null> {
  return native.averageColor(coverUri);
}

/** EPUBs another app handed to Quire ("Open with", "Share"), each returned once. */
export function takeIncomingBooks(): IncomingBook[] {
  return native.takeIncomingBooks();
}

/** Called when another app hands Quire books while it is running. Then call takeIncomingBooks(). */
export function onIncomingBooks(listener: () => void): () => void {
  const subscription = native.addListener("onIncomingBooks", () => listener());
  return () => subscription.remove();
}

/** Debug seam: file:// URIs the host queued in files/quire-import. Consumed once. */
export function takePendingImports(): string[] {
  return native.takePendingImports();
}

/** Debug seam: JSON commands the phone matrix queued in files/quire-cmd/. Consumed once. Debug builds only. */
export function takeCommands(): string[] {
  return native.takeCommands();
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

/** Copy a picked font file into app storage as <id>.<ext>. The extension comes from the file's signature. */
export function importFont(source: string, id: string): Promise<FontImport> {
  return native.importFont(source, id);
}

export function deleteFont(file: string): Promise<boolean> {
  return native.deleteFont(file);
}
