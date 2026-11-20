const { withAppBuildGradle } = require("expo/config-plugins");

const MARKER = "copyQuireReaderAssets";

const SNIPPET = `
def quireReaderSrc = new File(rootDir, "../assets/reader")
tasks.register("copyQuireReaderAssets", Copy) {
    from(new File(quireReaderSrc, "index.html")) {
        rename { "reader.html" }
    }
    from(new File(quireReaderSrc, "reader.js"))
    into("src/main/assets/quire-reader")
}
tasks.named("preBuild").configure { dependsOn("copyQuireReaderAssets") }
`;

/** Copy the reader page into the APK on every build. reader.js is generated and gitignored. */
function withReaderAssets(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (!cfg.modResults.contents.includes(MARKER)) {
      cfg.modResults.contents += `\n${SNIPPET}\n`;
    }
    return cfg;
  });
}

module.exports = withReaderAssets;
