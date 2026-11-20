import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";

import * as esbuild from "esbuild";

const pin = readFileSync(new URL("../vendor/foliate-js/PIN", import.meta.url), "utf8").trim();
if (!/^[0-9a-f]{40}$/.test(pin)) throw new Error(`foliate pin is not a commit: ${pin}`);

const dynamicImport = {
  name: "quire-dynamic-import",
  setup(build) {
    build.onLoad({ filter: /\.js$/ }, async (args) => {
      if (!args.path.includes("/vendor/foliate-js/")) return null;
      if (args.path.endsWith("/vendor/zip.js")) return null;
      let contents = await readFile(args.path, "utf8");
      contents = contents.replace(
        /import\((['"])(\.[^'"]+)\1\)/g,
        (_match, _quote, spec) => `__quireImport(${JSON.stringify(spec)})`,
      );
      return { contents, loader: "js" };
    });
  },
};

await esbuild.build({
  entryPoints: ["src/reader-page/entry.js"],
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  outfile: "assets/reader/reader.js",
  legalComments: "none",
  plugins: [dynamicImport],
  banner: {
    js: "var __quireImport = function (spec) { return Promise.reject(new Error('reader import not ready: ' + spec)); };",
  },
});

console.log(`bundled foliate-js ${pin.slice(0, 12)} to assets/reader/reader.js`);
