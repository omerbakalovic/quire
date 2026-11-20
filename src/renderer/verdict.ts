import type { CheckReport } from "./protocol.ts";

type TableFacts = { scrolls?: boolean; scrollWidth?: number; clientWidth?: number };
type TurnSample = { wallMs?: number };

/** What step 5 has to show on the phone. The report itself is the evidence. */
export function verdict(id: string, report: CheckReport): { pass: boolean; reason: string } {
  if (typeof report.error === "string") return { pass: false, reason: report.error };
  if (id === "scripted") {
    const pass =
      report.engineOpened === true &&
      report.scriptRan === false &&
      String(report.text ?? "").includes("SCRIPTED-BOOK-TEXT") &&
      String(report.csp ?? "").includes("script-src 'none'");
    return { pass, reason: pass ? "script did not run" : "script check failed" };
  }
  if (id === "drm") {
    const pass = report.engineOpened === false && report.kind === "drm";
    return { pass, reason: pass ? "refused before open" : "drm check failed" };
  }
  if (id === "font") {
    const pass =
      report.engineOpened === true &&
      report.kind === "font-obfuscation" &&
      String(report.text ?? "").includes("FONT-OBFUSCATION-TEXT");
    return { pass, reason: pass ? "font obfuscation opened" : "font check failed" };
  }
  if (id === "chapter") {
    const pass = report.engineOpened === true && Number(report.imageWidth) > 0 && Number(report.imageCount) > 0;
    return { pass, reason: pass ? "chapter image rendered" : "chapter check failed" };
  }
  if (id === "table") {
    const table = report.table as TableFacts | undefined;
    const pass =
      report.engineOpened === true &&
      table?.scrolls === true &&
      (table.scrollWidth ?? 0) > (table.clientWidth ?? 0);
    return { pass, reason: pass ? "table scrolls" : "table check failed" };
  }
  if (id === "large-range") {
    const turns = report.turns as TurnSample[] | undefined;
    const pass =
      report.engineOpened === true &&
      report.readMode === "range" &&
      typeof report.openMs === "number" &&
      Number(report.rangeRequests) > 0 &&
      report.fullResponses !== undefined &&
      Number(report.fullResponses) === 0 &&
      Array.isArray(turns) &&
      turns.length === 5 &&
      turns.every((turn) => typeof turn.wallMs === "number");
    return { pass, reason: pass ? "large book measured" : "large book check failed" };
  }
  if (id === "frankenstein-range") {
    const pass =
      report.engineOpened === true &&
      report.readMode === "range" &&
      typeof report.openMs === "number" &&
      Number(report.rangeRequests) > 0 &&
      Number(report.fullResponses) === 0;
    return { pass, reason: pass ? "range open measured" : "range open failed" };
  }
  if (id === "frankenstein-blob" || id === "large-blob") {
    const pass =
      report.engineOpened === true &&
      report.readMode === "blob" &&
      typeof report.openMs === "number" &&
      Number(report.rangeRequests) === 0;
    return { pass, reason: pass ? "blob open measured" : "blob open failed" };
  }
  return { pass: false, reason: "unknown check" };
}
