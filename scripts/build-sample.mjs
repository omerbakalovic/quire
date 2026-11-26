/**
 * Builds assets/sample/quire-sample.epub, the book Reading Look's live preview
 * opens (docs/customization-roadmap.md, section 4). One short chapter with the
 * things a reading look changes: headings, paragraphs, emphasis, links, a
 * footnote, lists, a quotation, a poem, a table, a figure with a border and
 * caption, and a little publisher styling of its own. The text is original,
 * written for Quire, so it carries no licence beyond the app's own.
 *
 * Run with `npm run sample`; the output is committed so builds don't need zip.
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "assets", "sample", "quire-sample.epub");

/** A small PNG drawn here: a dusk sky, the sea, and a lighthouse with its beam. */
function lighthousePng(width = 480, height = 300) {
  const rows = [];
  for (let y = 0; y < height; y++) {
    const row = Buffer.alloc(1 + width * 3);
    for (let x = 0; x < width; x++) {
      const t = y / height;
      let r = Math.round(46 + 160 * t);
      let g = Math.round(64 + 90 * t);
      let b = Math.round(110 + 40 * t);
      if (y > height * 0.68) {
        const wave = Math.sin(x / 9 + y / 3) * 6;
        r = 28 + wave;
        g = 70 + wave;
        b = 98 + wave;
      }
      const tower = x > 300 && x < 330 && y > 90 && y < height * 0.7;
      const band = tower && Math.floor((y - 90) / 22) % 2 === 0;
      if (tower) [r, g, b] = band ? [196, 54, 48] : [236, 232, 222];
      const lamp = Math.hypot(x - 315, y - 82) < 12;
      if (lamp) [r, g, b] = [255, 226, 120];
      const beam = x < 315 && Math.abs(y - 82 - (x - 315) * 0.12) < (315 - x) * 0.08 && !tower;
      if (beam) [r, g, b] = [Math.min(255, r + 70), Math.min(255, g + 60), Math.min(255, b + 20)];
      row[1 + x * 3] = r;
      row[2 + x * 3] = g;
      row[3 + x * 3] = b;
    }
    rows.push(row);
  }
  const chunk = (type, data) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([length, body, crc]);
  };
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8;
  header[9] = 2;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(Buffer.concat(rows), { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function crc32(buffer) {
  let crc = ~0;
  for (const byte of buffer) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return ~crc >>> 0;
}

const chapter = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head><title>The Lighthouse</title><link rel="stylesheet" href="styles.css"/></head>
<body>
<section epub:type="chapter">
<h1 id="top">Chapter 3<br/><span class="subtitle">The Lighthouse</span></h1>
<p class="first">The keeper climbed the hundred and twelve steps every evening at a quarter to six, whatever the weather, and he never once counted them. He knew the place where the iron rail went cold, the window that rattled in an east wind, and the step near the top that rang like a bell under a heavy boot.</p>
<p>On this evening the sea was the colour of slate, and the light from the lamp room fell <em>far</em> out across the water before it reached anything at all. It was, he thought, <strong>a good night for reading</strong>, if one had the time, and a better one for staying awake.<a id="ref-1" epub:type="noteref" href="#note-1">1</a></p>
<h2>The log book</h2>
<p>Every keeper kept a log. His held the date, the wind, the state of the glass, and anything that passed: a coaster heading north, a gull on the rail, the <span class="smallcaps">Harbour Board</span> inspector, who came twice a year and stayed for tea. Some entries were longer. The one he liked best, from a winter long ago, read simply:</p>
<blockquote>
<p>Fog all day. Lamp lit at four. Heard the bell buoy and nothing else. Wrote to my sister. Bread rose well.</p>
</blockquote>
<p>He kept to the same few rules his first keeper had taught him, written inside the cover:</p>
<ol>
<li>Light the lamp before the sun touches the water.</li>
<li>Wind the clockwork every four hours.</li>
<li>Write down what you see, not what you expect.</li>
</ol>
<p>And on the facing page, in another hand, a shorter list of things to bring up from the store:</p>
<ul>
<li>oil, wicks and a clean cloth;</li>
<li>a pencil, sharpened at both ends;</li>
<li>something to read.</li>
</ul>
<h3>A verse on the wall</h3>
<div class="poem">
<p class="line">The tide goes out, the tide comes in,</p>
<p class="line indent">and leaves the stones a little thin;</p>
<p class="line">the light goes round, the light comes back,</p>
<p class="line indent">and finds the boats along the track.</p>
</div>
<figure id="figure-1">
<img src="lighthouse.png" alt="A red and white lighthouse at dusk, its beam crossing the sea"/>
<figcaption>Figure 1. The light at dusk, from the harbour wall.</figcaption>
</figure>
<p class="callout">Keepers were relieved every six weeks, weather permitting. In a long winter, they sometimes waited ten.</p>
<table>
<caption>Watches kept in October</caption>
<thead><tr><th>Week</th><th>Nights</th><th>Fog</th></tr></thead>
<tbody>
<tr><td>First</td><td>7</td><td>2</td></tr>
<tr><td>Second</td><td>7</td><td>0</td></tr>
<tr><td>Third</td><td>6</td><td>4</td></tr>
</tbody>
</table>
<p>The full list of lights on this coast is kept at <a href="https://example.org/lights">example.org</a>, and the figure above is described again in <a href="#figure-1">Figure 1</a>.</p>
<p>When the morning came he wrote the time the lamp went out, closed the book, and went down the hundred and twelve steps to make his breakfast.</p>
<aside id="note-1" epub:type="footnote">
<p>The lamp burned paraffin, and the keeper was not allowed to sleep while it was lit.</p>
</aside>
</section>
</body>
</html>
`;

// A little publisher styling, so "Use the book's own styles" and book colours visibly do something.
const css = `body { margin: 0 4%; }
h1 { font-size: 26px; text-align: center; margin: 1.4em 0 1em; }
h1 .subtitle { display: block; font-size: 0.75em; font-style: italic; font-weight: normal; margin-top: 0.3em; }
h2 { font-size: 1.25em; margin: 1.4em 0 0.5em; }
h3 { font-size: 1.05em; margin: 1.2em 0 0.4em; }
p { margin: 0; text-indent: 1.4em; }
p.first, h2 + p, h3 + p, blockquote p, li p { text-indent: 0; }
.smallcaps { font-variant: small-caps; }
blockquote { margin: 1em 1.6em; font-style: italic; }
ol, ul { margin: 0.8em 0 0.8em 1.6em; padding: 0; }
.poem { margin: 1em 1.6em; }
.poem .line { text-indent: 0; }
.poem .indent { padding-left: 1.6em; }
figure { margin: 1.2em 0; text-align: center; }
figure img { max-width: 100%; border: 3px solid #6b5a43; padding: 4px; box-sizing: border-box; }
figcaption { font-size: 0.85em; font-style: italic; margin-top: 0.4em; }
.callout { background: #f3e6c4; color: #4a3a1c; border-left: 4px solid #b0873a; padding: 0.6em 0.8em; margin: 1em 0; text-indent: 0; }
table { border-collapse: collapse; margin: 1em auto; font-size: 0.9em; }
caption { font-style: italic; margin-bottom: 0.3em; }
th, td { border: 1px solid #999; padding: 0.25em 0.8em; text-align: center; }
aside { font-size: 0.9em; }
`;

const opf = `<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="en">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:quire:sample-page:1</dc:identifier>
    <dc:title>The Lighthouse</dc:title>
    <dc:creator>Quire</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-11-26T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="chapter" href="chapter.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="styles.css" media-type="text/css"/>
    <item id="image" href="lighthouse.png" media-type="image/png"/>
  </manifest>
  <spine>
    <itemref idref="chapter"/>
  </spine>
</package>
`;

const nav = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head><title>Contents</title></head>
<body><nav epub:type="toc"><ol><li><a href="chapter.xhtml">Chapter 3: The Lighthouse</a></li></ol></nav></body>
</html>
`;

const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
`;

const dir = mkdtempSync(join(tmpdir(), "quire-sample-"));
const files = {
  mimetype: "application/epub+zip",
  "META-INF/container.xml": container,
  "OEBPS/content.opf": opf,
  "OEBPS/nav.xhtml": nav,
  "OEBPS/chapter.xhtml": chapter,
  "OEBPS/styles.css": css,
  "OEBPS/lighthouse.png": lighthousePng(),
};
for (const [path, data] of Object.entries(files)) {
  mkdirSync(dirname(join(dir, path)), { recursive: true });
  writeFileSync(join(dir, path), data);
}
mkdirSync(dirname(out), { recursive: true });
rmSync(out, { force: true });
// Fixed timestamps, so the same input always gives the same bytes (and the same book id).
execFileSync("find", [".", "-exec", "touch", "-t", "202611260000", "{}", "+"], { cwd: dir });
execFileSync("zip", ["-X0", out, "mimetype"], { cwd: dir });
execFileSync("zip", ["-Xr", out, "META-INF", "OEBPS"], { cwd: dir });
rmSync(dir, { recursive: true, force: true });
console.log(`wrote ${out}`);
