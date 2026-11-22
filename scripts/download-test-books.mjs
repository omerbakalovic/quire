import { createHash } from "node:crypto";
import { createWriteStream } from "node:fs";
import { access, mkdir, readFile, rename } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "test-books/downloaded");
const userAgent = "Mozilla/5.0 (X11; Linux x86_64; rv:149.0) Gecko/20100101 Firefox/149.0";

// Public-domain texts. These files are gitignored. Hand-built fixtures are separate.
const BOOKS = [
  {
    file: "se-frankenstein.epub",
    url: "https://standardebooks.org/ebooks/mary-shelley/frankenstein/downloads/mary-shelley_frankenstein.epub?source=download",
    // Re-pinned 2026-11-22: Standard Ebooks rebuilt the file after M1a.
    sha256: "4cb9f313382570a470a7055b4696ec63068dfea304a0c7ef878890d2b4e3c3e2",
  },
  {
    file: "pg1342.epub",
    url: "https://gutenberg.pglaf.org/cache/epub/1342/pg1342.epub",
    sha256: "cb0d439ee71c4a14f18249759ad5bf1f753b201a298ccb0b10b53536bf5818b6",
  },
  {
    file: "pg2600.epub",
    url: "https://gutenberg.pglaf.org/cache/epub/2600/pg2600.epub",
    sha256: "5d361cf994b5846958aed0f0ee3edcaa732dfc26670a483545b8129aceadc19e",
  },
  {
    file: "pg1184-images.epub",
    url: "https://gutenberg.pglaf.org/cache/epub/1184/pg1184-images.epub",
    sha256: "87d728576f727eeed0d92e75ccc354d51c532c0e615b1a988041ecbb8e8dcbf1",
  },
];

// IDPF/W3C EPUB 3 samples for the M1b matrix. All six are CC-BY-SA 3.0: the
// samples table lists no other license for them (checked 2026-11-22).
// Release 20230704. The repository was archived on 2026-11-09, so this tag is final.
// Hashes pinned from the copies downloaded on the M1b test PC on 2026-11-22.
const IDPF = "https://github.com/IDPF/epub3-samples/releases/download/20230704";
const SAMPLES = [
  ["moby-dick.epub", "81bc079841a38e91a02a7776d04786a2fc311cfd300064e9fc533ce7c54cf7b4"],
  ["wasteland.epub", "1653b9fbe225b89a008f980744d6b89940504a4533b9036821f9d99daf8f6c9c"],
  ["georgia-cfi.epub", "85d17e1ee1d39d3e9f59ee959e92a808456c5c371036cba560634c01292c5e06"],
  ["regime-anticancer-arabic.epub", "5d10bf6a73f461b7b23294b6e34b72f2a1184c9543a424b4a0f737ed33967e96"],
  ["kusamakura-japanese-vertical-writing.epub", "6d4d4ed5eda3f612e3263c54fa0f74ccfa87260f43e81bb58ea658636e52eeb7"],
  ["sous-le-vent.epub", "1ac68b0a334d19ac97338574d6ad0d7a30723315c668c6d74021540b6b3f816d"],
].map(([file, sha256]) => ({ file, url: `${IDPF}/${file}`, sha256 }));
BOOKS.push(...SAMPLES);

async function sha256(path) {
  const digest = createHash("sha256");
  digest.update(await readFile(path));
  return digest.digest("hex");
}

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

const STALL_MS = 60_000;

/** A connection that sends nothing for STALL_MS is aborted, so one stalled host cannot hang the run. */
async function download(url, destination) {
  const controller = new AbortController();
  let timer = setTimeout(() => controller.abort(new Error("stalled")), STALL_MS);
  const touch = () => {
    clearTimeout(timer);
    timer = setTimeout(() => controller.abort(new Error(`no data for ${STALL_MS / 1000} s`)), STALL_MS);
  };
  try {
    const response = await fetch(url, { headers: { "User-Agent": userAgent }, signal: controller.signal });
    if (!response.ok || !response.body) {
      throw new Error(`${url} returned ${response.status}`);
    }
    const temporary = `${destination}.partial`;
    const watch = new TransformStream({
      transform(chunk, sink) {
        touch();
        sink.enqueue(chunk);
      },
    });
    await pipeline(response.body.pipeThrough(watch), createWriteStream(temporary), { signal: controller.signal });
    await rename(temporary, destination);
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  await mkdir(outDir, { recursive: true });
  let failed = false;
  for (const book of BOOKS) {
    const destination = join(outDir, book.file);
    if (await exists(destination)) {
      const have = await sha256(destination);
      if (book.sha256 === null) {
        console.log(`unpinned ${book.file} sha256 ${have}`);
        continue;
      }
      if (have === book.sha256) {
        console.log(`ok ${book.file}`);
        continue;
      }
      console.log(`checksum mismatch, downloading ${book.file} again`);
    } else {
      console.log(`downloading ${book.file}`);
    }
    try {
      await download(book.url, destination);
    } catch (error) {
      console.error(`FAIL ${book.file}: ${error.message}`);
      failed = true;
      continue;
    }
    const have = await sha256(destination);
    if (book.sha256 === null) {
      console.log(`unpinned ${book.file} sha256 ${have}`);
    } else if (have !== book.sha256) {
      console.error(`FAIL ${book.file}: sha256 ${have}`);
      failed = true;
    } else {
      console.log(`ok ${book.file}`);
    }
  }
  if (failed) process.exitCode = 1;
}

main();
