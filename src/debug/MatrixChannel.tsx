import { usePathname, useRouter } from "expo-router";
import { useEffect, useRef } from "react";
import { Dimensions, PixelRatio } from "react-native";

import { sortedBooks } from "@/domain/library";
import { getLibrary, importFiles, loadLibrary, saveSettings } from "@/library/store";
import { appendNote, takeCommands, takePendingImports } from "@/renderer/book-url";

import { parseMatrixCommand, readerDebug, type MatrixCommand } from "./matrix-command";

const POLL_MS = 100;
const READER_TIMEOUT_MS = 20000;

function answer(command: { seq: number; cmd: string }, outcome: { ok: true; result: unknown } | { ok: false; error: string }) {
  try {
    appendNote(JSON.stringify({ source: "matrix", at: Date.now(), seq: command.seq, cmd: command.cmd, ...outcome }));
  } catch {
    // Nothing to report to: the host times out and says so.
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, what: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${what} timed out after ${ms} ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function channelTimeout(command: MatrixCommand): number {
  if (command.cmd === "drain-imports") return 30 * 60000;
  if (command.cmd === "reader") {
    const requested = command.args.timeoutMs;
    return (typeof requested === "number" && requested > 0 ? Math.min(requested, 180000) : READER_TIMEOUT_MS) + 2000;
  }
  return 20000;
}

/**
 * Debug builds only: runs the phone matrix's commands (scripts/phone-matrix.mjs).
 * It reads files/quire-cmd/ a few times a second and answers in the report log.
 * Release builds never mount it, and the native side refuses outside debuggable builds.
 */
export function MatrixChannel() {
  const router = useRouter();
  const pathname = usePathname();
  const path = useRef(pathname);
  path.current = pathname;

  useEffect(() => {
    let busy = false;
    let stopped = false;

    async function run(command: MatrixCommand): Promise<unknown> {
      switch (command.cmd) {
        case "hello": {
          await loadLibrary();
          const library = getLibrary();
          return {
            route: path.current,
            flow: library.flow,
            settings: library.settings,
            books: sortedBooks(library).map((book) => ({ id: book.id, title: book.title, fraction: book.fraction, cfi: book.cfi })),
            scale: PixelRatio.get(),
            window: Dimensions.get("window"),
            screen: Dimensions.get("screen"),
          };
        }
        case "open": {
          await loadLibrary();
          if (path.current !== "/") {
            router.dismissTo("/");
            await wait(400);
          }
          router.push({ pathname: "/reader/[id]", params: { id: command.id } });
          return { route: `/reader/${command.id}` };
        }
        case "library": {
          if (path.current !== "/") router.dismissTo("/");
          await wait(400);
          return { route: path.current };
        }
        case "settings":
          await saveSettings({ tapZones: command.tapZones });
          return { settings: getLibrary().settings };
        case "drain-imports": {
          const uris = takePendingImports();
          const results = await importFiles(uris.map((uri) => ({ uri, name: uri.split("/").pop() ?? null })));
          for (const result of results) {
            appendNote(JSON.stringify({ source: "library", phase: "import", name: result.name, outcome: result.outcome }));
          }
          return {
            imported: results.map((result) => ({
              name: result.name,
              kind: result.outcome.kind,
              id: "facts" in result.outcome ? result.outcome.facts.id : "id" in result.outcome ? result.outcome.id : null,
            })),
          };
        }
        case "reader": {
          const reader = readerDebug();
          if (!reader) throw new Error("no reader screen is open");
          const requested = command.args.timeoutMs;
          const ms = typeof requested === "number" && requested > 0 ? Math.min(requested, 180000) : READER_TIMEOUT_MS;
          return withTimeout(reader.handle(command.action, command.args), ms, `reader ${command.action}`);
        }
      }
    }

    const timer = setInterval(() => {
      if (busy || stopped) return;
      busy = true;
      void (async () => {
        try {
          for (const raw of takeCommands()) {
            const command = parseMatrixCommand(raw);
            if (!command) {
              answer({ seq: -1, cmd: "invalid" }, { ok: false, error: `unreadable command: ${raw.slice(0, 200)}` });
              continue;
            }
            try {
              // Nothing may hold the channel for good: a stuck step answers with an error and the next command runs.
              answer(command, { ok: true, result: await withTimeout(run(command), channelTimeout(command), command.cmd) });
            } catch (error) {
              answer(command, { ok: false, error: error instanceof Error ? error.message : String(error) });
            }
          }
        } finally {
          busy = false;
        }
      })();
    }, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(timer);
    };
  }, [router]);

  return null;
}
