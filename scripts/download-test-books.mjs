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
    sha256: "2809c5ba9434a4973735e160aa3d4fa2ff360297a796e3a0f4b1b8d1c1d8693f",
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

async function download(url, destination) {
  const response = await fetch(url, { headers: { "User-Agent": userAgent } });
  if (!response.ok || !response.body) {
    throw new Error(`${url} returned ${response.status}`);
  }
  const temporary = `${destination}.partial`;
  await pipeline(response.body, createWriteStream(temporary));
  await rename(temporary, destination);
}

async function main() {
  await mkdir(outDir, { recursive: true });
  let failed = false;
  for (const book of BOOKS) {
    const destination = join(outDir, book.file);
    if (await exists(destination)) {
      const have = await sha256(destination);
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
    if (have !== book.sha256) {
      console.error(`FAIL ${book.file}: sha256 ${have}`);
      failed = true;
    } else {
      console.log(`ok ${book.file}`);
    }
  }
  if (failed) process.exitCode = 1;
}

main();
