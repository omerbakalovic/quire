import assert from "node:assert/strict";
import test from "node:test";

import type { CheckReport } from "./protocol.ts";
import { verdict } from "./verdict.ts";

const opened = (extra: Record<string, unknown>): CheckReport => ({ engineOpened: true, ...extra });

test("step 5 verdicts follow the phone checks", () => {
  assert.equal(
    verdict("scripted", opened({ scriptRan: false, text: "SCRIPTED-BOOK-TEXT", csp: "script-src 'none'" })).pass,
    true,
  );
  assert.equal(verdict("scripted", opened({ scriptRan: true, text: "SCRIPTED-BOOK-TEXT", csp: "script-src 'none'" })).pass, false);
  assert.equal(verdict("drm", { engineOpened: false, kind: "drm" }).pass, true);
  assert.equal(verdict("drm", opened({ kind: "drm", text: "DRM-FIXTURE-TEXT" })).pass, false);
  assert.equal(verdict("font", opened({ kind: "font-obfuscation", text: "FONT-OBFUSCATION-TEXT" })).pass, true);
  assert.equal(verdict("chapter", opened({ imageWidth: 1, imageCount: 1 })).pass, true);
  assert.equal(verdict("table", opened({ table: { scrolls: true, scrollWidth: 1200, clientWidth: 360 } })).pass, true);
  assert.equal(verdict("table", opened({ table: { scrolls: false, scrollWidth: 1200, clientWidth: 360 } })).pass, false);
  assert.equal(
    verdict("large-range", opened({
      readMode: "range",
      openMs: 40,
      rangeRequests: 6,
      fullResponses: 0,
      turns: [{ wallMs: 1 }, { wallMs: 2 }, { wallMs: 3 }, { wallMs: 4 }, { wallMs: 5 }],
    })).pass,
    true,
  );
  assert.equal(
    verdict("frankenstein-blob", opened({ readMode: "blob", openMs: 10, rangeRequests: 0 })).pass,
    true,
  );
  assert.equal(
    verdict("frankenstein-range", opened({ readMode: "range", openMs: 10, rangeRequests: 4, fullResponses: 0 })).pass,
    true,
  );
  assert.equal(
    verdict("large-blob", opened({ readMode: "blob", openMs: 10, rangeRequests: 4 })).pass,
    false,
  );
});
