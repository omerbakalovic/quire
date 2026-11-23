import { createReadStream, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const booksRoot = join(root, "test-books");
const readerHtml = join(root, "assets/reader/index.html");
const readerJs = join(root, "assets/reader/reader.js");
const reportPath = join(root, "spike/results/device.json");
const port = 8765;
const reports = [];

function bookFile(urlPath) {
  const rel = decodeURIComponent(urlPath.replace(/^\/books\//, ""));
  if (!rel || rel.includes("\0")) return null;
  const full = resolve(booksRoot, rel);
  const prefix = booksRoot.endsWith(sep) ? booksRoot : booksRoot + sep;
  if (full !== booksRoot && !full.startsWith(prefix)) return null;
  if (!existsSync(full) || !statSync(full).isFile()) return null;
  return full;
}

function sendFile(res, path, type) {
  const data = readFileSync(path);
  res.writeHead(200, {
    "content-type": type,
    "cache-control": "no-store",
    "content-length": String(data.length),
  });
  res.end(data);
}

const server = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  if (req.method === "GET" && url.pathname === "/reader.html") {
    sendFile(res, readerHtml, "text/html; charset=utf-8");
    return;
  }
  if (req.method === "GET" && url.pathname === "/reader.js") {
    sendFile(res, readerJs, "text/javascript; charset=utf-8");
    return;
  }
  const font = /^\/fonts\/([a-z0-9-]{1,80}\.woff2)$/.exec(url.pathname);
  if (req.method === "GET" && font && existsSync(join(root, "assets/fonts", font[1]))) {
    sendFile(res, join(root, "assets/fonts", font[1]), "font/woff2");
    return;
  }
  if (req.method === "GET" && url.pathname.startsWith("/books/")) {
    const file = bookFile(url.pathname);
    if (!file) {
      res.writeHead(404);
      res.end("missing");
      return;
    }
    res.writeHead(200, {
      "content-type": "application/epub+zip",
      "cache-control": "no-store",
      "content-length": String(statSync(file).size),
    });
    createReadStream(file).pipe(res);
    return;
  }
  if (req.method === "POST" && url.pathname === "/report") {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > 1_000_000) req.destroy();
      else chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        reports.push(JSON.parse(Buffer.concat(chunks).toString("utf8")));
        mkdirSync(dirname(reportPath), { recursive: true });
        writeFileSync(reportPath, JSON.stringify(reports, null, 2));
        res.writeHead(204);
        res.end();
      } catch {
        res.writeHead(400);
        res.end("bad report");
      }
    });
    return;
  }
  res.writeHead(404);
  res.end("no");
});

server.listen(port, "127.0.0.1", () => {
  console.log(`serving books at http://127.0.0.1:${port}`);
});
