const { withAppBuildGradle, withDangerousMod } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const MARKER = "// quire: debug builds install beside the app";

const STRINGS = `<?xml version="1.0" encoding="utf-8"?>
<resources>
  <string name="app_name">Quire Dev</string>
</resources>
`;

/**
 * Debug builds (Metro, the phone matrix) install as app.quire.reader.dev, named
 * "Quire Dev". The release APK keeps app.quire.reader, so the everyday app and
 * its library are never replaced or cleared by a test run.
 */
function withDevVariant(config) {
  config = withAppBuildGradle(config, (cfg) => {
    const contents = cfg.modResults.contents;
    if (contents.includes(MARKER)) return cfg;
    const anchor = /buildTypes\s*\{\s*debug\s*\{/;
    if (!anchor.test(contents)) throw new Error("withDevVariant: no buildTypes.debug block in app/build.gradle");
    cfg.modResults.contents = contents.replace(
      anchor,
      (match) => `${match}\n            ${MARKER}\n            applicationIdSuffix ".dev"`,
    );
    return cfg;
  });
  return withDangerousMod(config, [
    "android",
    (cfg) => {
      const dir = path.join(cfg.modRequest.platformProjectRoot, "app/src/debug/res/values");
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, "strings.xml"), STRINGS);
      return cfg;
    },
  ]);
}

module.exports = withDevVariant;
