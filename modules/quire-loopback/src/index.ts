import { requireNativeModule } from "expo";

type NativeLoopback = {
  start(): Promise<{ port: number; token: string }>;
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
