import { classifyEncryption } from "./drm.ts";
import type { ImportFacts } from "./library.ts";

/** What the native import returned, as far as this decision needs it. */
export type ImportReport =
  | ({ ok: true; duplicate: boolean; encryptionXml: string | null; warnings: string[] } & ImportFacts)
  | { ok: false; reason: string; detail: string | null };

export type ImportOutcome =
  | { kind: "added"; facts: ImportFacts; warnings: string[] }
  | { kind: "duplicate"; facts: ImportFacts }
  | { kind: "drm"; id: string; removeFile: boolean }
  | { kind: "not-epub"; detail: string | null };

/**
 * DRM is refused at import, and its copy is removed unless the same bytes
 * were already in the library. Font obfuscation is not DRM.
 * A duplicate is reported, and its metadata is refreshed.
 */
export function decideImport(report: ImportReport): ImportOutcome {
  if (!report.ok) return { kind: "not-epub", detail: report.detail };
  if (classifyEncryption(report.encryptionXml) === "drm") {
    return { kind: "drm", id: report.id, removeFile: !report.duplicate };
  }
  const facts: ImportFacts = {
    id: report.id,
    hash: report.hash,
    size: report.size,
    title: report.title,
    authors: report.authors,
    language: report.language,
    publisher: report.publisher,
    series: report.series,
    seriesIndex: report.seriesIndex,
    coverUri: report.coverUri,
  };
  if (report.duplicate) return { kind: "duplicate", facts };
  return { kind: "added", facts, warnings: report.warnings };
}
