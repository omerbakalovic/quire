import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const srcRoot = join(root, "test-books/src");
const outRoot = join(root, "test-books/fixtures");

const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

const container = `<?xml version="1.0" encoding="UTF-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>
`;

function writeTree(name, files) {
  const dir = join(srcRoot, name);
  rmSync(dir, { recursive: true, force: true });
  for (const [path, data] of Object.entries(files)) {
    const full = join(dir, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, data);
  }
  const epub = join(outRoot, `${name}.epub`);
  mkdirSync(outRoot, { recursive: true });
  rmSync(epub, { force: true });
  execFileSync("zip", ["-X0", epub, "mimetype"], { cwd: dir });
  execFileSync("zip", ["-Xr", epub, "META-INF", "OEBPS"], { cwd: dir });
}

const head = (title) => `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head><title>${title}</title><link rel="stylesheet" href="styles.css"/></head>
<body>
`;

const foot = `</body></html>
`;

const padding = (label, count) =>
  Array.from({ length: count }, (_, index) => {
    const n = String(index + 1).padStart(2, "0");
    return `<p>${label} padding paragraph ${n}. The sentence is repeated so the chapter is long enough to paginate on a phone-sized viewport. The sentence is repeated so the chapter is long enough to paginate on a phone-sized viewport.</p>`;
  }).join("\n");

const noterefChapter1 = `${head("Chapter 1")}
<h1 id="chapter-1">Chapter 1</h1>
<p>CHAPTER-ONE-START A semantic note <a id="ref-fn1" epub:type="noteref" href="#fn1">1</a> sits in this sentence.</p>
<p>A role note <a id="ref-role" role="doc-noteref" href="#fn-role">*</a> uses the doc-noteref role.</p>
<p>A cross-file endnote <a id="ref-en1" epub:type="noteref" href="endnotes.xhtml#en1">2</a> leaves this file.</p>
<p>A rich endnote <a id="ref-rich" epub:type="noteref" href="endnotes.xhtml#en-rich">†</a> contains a link and an image.</p>
<p>A nested note <a id="ref-nested" epub:type="noteref" href="endnotes.xhtml#en-nested">‡</a> points at a note that itself has a noteref.</p>
<p>A plain superscript <sup><a id="ref-plain" href="endnotes.xhtml#en-plain">4</a></sup> has no epub type.</p>
<p>An empty-anchor note, semantic <a id="ref-empty-sem" epub:type="noteref" href="endnotes.xhtml#en-empty">5</a> and plain <sup><a id="ref-empty-sup" href="endnotes.xhtml#en-empty">6</a></sup>.</p>
<p>Item <a id="ref-not-a-note" href="chapter-2.xhtml#item-3">3</a> is a numbered section, not a note.</p>
<p><a id="ref-chapter" href="chapter-2.xhtml">Chapter 2</a> is an ordinary chapter link.</p>
<p id="section">An image in the chapter: <img src="note.png" alt="Red swatch in the chapter"/>.</p>
<aside id="fn1" epub:type="footnote">
  <p>First paragraph of the same-file footnote.</p>
  <p>Second paragraph with <em>italics</em>.</p>
  <a epub:type="backlink" href="#ref-fn1">↩</a>
</aside>
<aside id="fn-role" role="doc-footnote">
  <p>Role-based footnote.</p>
  <a role="doc-backlink" href="#ref-role">↩</a>
</aside>
${padding("Chapter one", 8)}
<p>CHAPTER-ONE-END</p>
${foot}`;

const noterefChapter2 = `${head("Chapter 2")}
<h1>Chapter 2</h1>
<p>CHAPTER-TWO-START</p>
<h2 id="item-3">Item 3</h2>
<p>This numbered section is the target of a numeric link and must not be treated as a note.</p>
<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" role="img" aria-label="Blue circle"><circle cx="20" cy="20" r="16" fill="blue"/></svg>
<table>
  <tr><th>One</th><th>Two</th><th>Three</th><th>Four</th><th>Five</th><th>Six</th><th>Seven</th><th>Eight</th></tr>
  <tr><td>alpha</td><td>bravo</td><td>charlie</td><td>delta</td><td>echo</td><td>foxtrot</td><td>golf</td><td>hotel</td></tr>
</table>
${padding("Chapter two", 8)}
<p>CHAPTER-TWO-END</p>
${foot}`;

const noterefChapter3 = `${head("Chapter 3")}
<h1>Chapter 3</h1>
<p>CHAPTER-THREE-START This short chapter exists so a scroll at the end of chapter 2 has somewhere to go.</p>
${foot}`;

const endnotes = `${head("Endnotes")}
<section epub:type="endnotes">
  <h1>Endnotes</h1>
  <ol>
    <li id="en1" epub:type="endnote">
      <p>Endnote in another file, with <em>italics</em>.</p>
      <a epub:type="backlink" href="chapter-1.xhtml#ref-en1">↩</a>
    </li>
    <li id="en-rich" epub:type="endnote">
      <p>A link inside the note: <a href="https://example.com/quire-note">example</a>.</p>
      <p><img src="note.png" alt="Red swatch"/></p>
      <a epub:type="backlink" href="chapter-1.xhtml#ref-rich">↩</a>
    </li>
    <li id="en-nested" epub:type="endnote">
      <p>This note points at another <a epub:type="noteref" href="#en-rich">note</a>.</p>
    </li>
    <li id="en-plain">
      <p>Plain endnote reached by a superscript link with no epub type.</p>
      <a href="chapter-1.xhtml#ref-plain">↩</a>
    </li>
  </ol>
  <a id="en-empty"></a>
  <p id="en-empty-body">This paragraph follows an empty anchor.</p>
</section>
${foot}`;

const nav = `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">
<head><title>Contents</title></head>
<body>
<nav epub:type="toc" id="toc">
  <ol>
    <li><a href="chapter-1.xhtml">Chapter 1</a>
      <ol><li><a href="chapter-1.xhtml#section">A section</a></li></ol>
    </li>
    <li><a href="chapter-2.xhtml">Chapter 2</a></li>
    <li><a href="chapter-3.xhtml">Chapter 3</a></li>
    <li><a href="endnotes.xhtml">Endnotes</a></li>
  </ol>
</nav>
</body>
</html>
`;

const ncx = `<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <head><meta name="dtb:uid" content="urn:uuid:quire-noteref-fixture"/></head>
  <docTitle><text>Quire Noteref Fixture</text></docTitle>
  <navMap>
    <navPoint id="c1"><navLabel><text>Chapter 1</text></navLabel><content src="chapter-1.xhtml"/></navPoint>
    <navPoint id="c2"><navLabel><text>Chapter 2</text></navLabel><content src="chapter-2.xhtml"/></navPoint>
    <navPoint id="c3"><navLabel><text>Chapter 3</text></navLabel><content src="chapter-3.xhtml"/></navPoint>
  </navMap>
</ncx>
`;

const css = `body { font-family: "Courier New", monospace !important; color: rgb(200, 0, 0); }
table { width: 4000px; border-collapse: collapse; }
td, th { border: 1px solid black; padding: 4px; }
`;

const noterefOpf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid" xml:lang="en">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:quire-noteref-fixture</dc:identifier>
    <dc:title>Quire Noteref Fixture</dc:title>
    <dc:creator>Quire</dc:creator>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-11-19T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
    <item id="css" href="styles.css" media-type="text/css"/>
    <item id="c1" href="chapter-1.xhtml" media-type="application/xhtml+xml"/>
    <item id="c2" href="chapter-2.xhtml" media-type="application/xhtml+xml"/>
    <item id="c3" href="chapter-3.xhtml" media-type="application/xhtml+xml"/>
    <item id="notes" href="endnotes.xhtml" media-type="application/xhtml+xml"/>
    <item id="img" href="note.png" media-type="image/png"/>
  </manifest>
  <spine toc="ncx">
    <itemref idref="c1"/>
    <itemref idref="c2"/>
    <itemref idref="c3"/>
    <itemref idref="notes"/>
  </spine>
</package>
`;

writeTree("noteref", {
  mimetype: "application/epub+zip",
  "META-INF/container.xml": container,
  "OEBPS/content.opf": noterefOpf,
  "OEBPS/nav.xhtml": nav,
  "OEBPS/toc.ncx": ncx,
  "OEBPS/styles.css": css,
  "OEBPS/chapter-1.xhtml": noterefChapter1,
  "OEBPS/chapter-2.xhtml": noterefChapter2,
  "OEBPS/chapter-3.xhtml": noterefChapter3,
  "OEBPS/endnotes.xhtml": endnotes,
  "OEBPS/note.png": PNG,
});

const readable = (title, marker) => `${head(title)}
<h1>${title}</h1>
<p>${marker}</p>
${foot}`;

writeTree("malformed", {
  mimetype: "application/epub+zip",
  "META-INF/container.xml": container,
  "OEBPS/content.opf": `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:quire-malformed-fixture</dc:identifier>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-11-19T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="c1" href="chapter-1.xhtml" media-type="application/xhtml+xml"/>
    <item id="missing" href="does-not-exist.xhtml" media-type="application/xhtml+xml"/>
    <item id="cover" href="missing-cover.png" media-type="image/jpeg" properties="cover-image"/>
  </manifest>
  <spine>
    <itemref idref="c1"/>
    <itemref idref="missing"/>
  </spine>
</package>
`,
  "OEBPS/nav.xhtml": `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<body><nav epub:type="toc"><ol>
  <li><a href="chapter-1.xhtml">Readable</a></li>
  <li><a href="does-not-exist.xhtml#nowhere">Broken</a></li>
</ol></nav></body></html>
`,
  "OEBPS/chapter-1.xhtml": readable("Malformed", "READABLE-CHAPTER This malformed book still has one readable chapter."),
});

writeTree("drm", {
  mimetype: "application/epub+zip",
  "META-INF/container.xml": container,
  "META-INF/encryption.xml": `<?xml version="1.0" encoding="UTF-8"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
  <enc:EncryptedData>
    <enc:EncryptionMethod Algorithm="http://www.w3.org/2001/04/xmlenc#aes128-cbc"/>
    <enc:CipherData>
      <enc:CipherReference URI="OEBPS/chapter-1.xhtml"/>
    </enc:CipherData>
  </enc:EncryptedData>
</encryption>
`,
  "OEBPS/content.opf": `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:quire-drm-fixture</dc:identifier>
    <dc:title>Quire DRM Fixture</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-11-19T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="c1" href="chapter-1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="c1"/></spine>
</package>
`,
  "OEBPS/chapter-1.xhtml": readable("DRM", "DRM-FIXTURE-TEXT The bytes are still plaintext. Detection must happen before render."),
});

writeTree("scripted", {
  mimetype: "application/epub+zip",
  "META-INF/container.xml": container,
  "OEBPS/content.opf": `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:quire-scripted-fixture</dc:identifier>
    <dc:title>Quire Scripted Fixture</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-11-19T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="c1" href="chapter-1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine><itemref idref="c1"/></spine>
</package>
`,
  "OEBPS/chapter-1.xhtml": `<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" lang="en">
<head><title>Scripted</title></head>
<body>
<script>document.documentElement.setAttribute("data-script-ran", "yes");</script>
<p>SCRIPTED-BOOK-TEXT</p>
</body></html>
`,
});

writeTree("font-obfuscation", {
  mimetype: "application/epub+zip",
  "META-INF/container.xml": container,
  "META-INF/encryption.xml": `<?xml version="1.0" encoding="UTF-8"?>
<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container" xmlns:enc="http://www.w3.org/2001/04/xmlenc#">
  <enc:EncryptedData>
    <enc:EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/>
    <enc:CipherData>
      <enc:CipherReference URI="OEBPS/fonts/dummy.ttf"/>
    </enc:CipherData>
  </enc:EncryptedData>
</encryption>
`,
  "OEBPS/content.opf": `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="uid">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="uid">urn:uuid:quire-font-obfuscation</dc:identifier>
    <dc:title>Quire Font Obfuscation Fixture</dc:title>
    <dc:language>en</dc:language>
    <meta property="dcterms:modified">2026-11-19T00:00:00Z</meta>
  </metadata>
  <manifest>
    <item id="c1" href="chapter-1.xhtml" media-type="application/xhtml+xml"/>
    <item id="font" href="fonts/dummy.ttf" media-type="font/ttf"/>
  </manifest>
  <spine><itemref idref="c1"/></spine>
</package>
`,
  "OEBPS/chapter-1.xhtml": readable(
    "Font obfuscation",
    "FONT-OBFUSCATION-TEXT The font file is the only encrypted resource. This chapter is plaintext.",
  ),
  "OEBPS/fonts/dummy.ttf": "quire-font-placeholder",
});

console.log("Built fixtures in test-books/fixtures");
