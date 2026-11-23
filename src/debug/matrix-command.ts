/**
 * Commands the phone matrix (scripts/phone-matrix.mjs) sends to a debug build
 * through files/quire-cmd/. Each one is answered with one line in
 * files/quire-report.jsonl: { source: "matrix", seq, cmd, ok, result | error }.
 */
export type MatrixCommand =
  | { seq: number; cmd: "hello" }
  | { seq: number; cmd: "open"; id: string }
  | { seq: number; cmd: "library" }
  | { seq: number; cmd: "settings"; tapZones: "reading" | "screen" }
  | { seq: number; cmd: "drain-imports" }
  | { seq: number; cmd: "add-font"; path: string }
  | { seq: number; cmd: "reader"; action: string; args: Record<string, unknown> };

const BOOK_ID = /^[A-Za-z0-9_-]{1,80}$/;
const ACTION = /^[a-z][a-z-]{0,39}$/;
/**
 * A font the host copied into the app's own files/quire-cmd-fonts/ with run-as.
 * The system picker can't be driven by the matrix's taps, so this stands in
 * for picking the file; the import after it is the real one.
 */
const FONT_PATH = /^\/data\/(?:user\/\d{1,4}|data)\/[A-Za-z0-9_.]{1,120}\/files\/quire-cmd-fonts\/[A-Za-z0-9_-]{1,60}\.(?:ttf|otf|woff2?|ttc|bin)$/;

export function parseMatrixCommand(raw: string): MatrixCommand | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const command = value as Record<string, unknown>;
  const seq = command.seq;
  if (typeof seq !== "number" || !Number.isInteger(seq) || seq < 0) return null;
  switch (command.cmd) {
    case "hello":
    case "library":
    case "drain-imports":
      return { seq, cmd: command.cmd };
    case "add-font":
      return typeof command.path === "string" && FONT_PATH.test(command.path) ? { seq, cmd: "add-font", path: command.path } : null;
    case "open":
      return typeof command.id === "string" && BOOK_ID.test(command.id) ? { seq, cmd: "open", id: command.id } : null;
    case "settings":
      return command.tapZones === "reading" || command.tapZones === "screen"
        ? { seq, cmd: "settings", tapZones: command.tapZones }
        : null;
    case "reader": {
      if (typeof command.action !== "string" || !ACTION.test(command.action)) return null;
      const args = command.args && typeof command.args === "object" && !Array.isArray(command.args) ? command.args : {};
      return { seq, cmd: "reader", action: command.action, args: args as Record<string, unknown> };
    }
    default:
      return null;
  }
}

export type ReaderDebugHandler = (action: string, args: Record<string, unknown>) => Promise<unknown>;

let reader: { id: string; handle: ReaderDebugHandler } | null = null;

/** The open reader screen registers here, so reader commands reach its page. */
export function setReaderDebug(id: string, handle: ReaderDebugHandler): () => void {
  const entry = { id, handle };
  reader = entry;
  return () => {
    if (reader === entry) reader = null;
  };
}

export function readerDebug(): { id: string; handle: ReaderDebugHandler } | null {
  return reader;
}
