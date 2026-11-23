const { withAndroidManifest, withDangerousMod, AndroidConfig } = require("expo/config-plugins");
const fs = require("fs");
const path = require("path");

const XML = `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">127.0.0.1</domain>
    <domain includeSubdomains="false">localhost</domain>
  </domain-config>
</network-security-config>
`;

// Debug builds only: an emulator reaches Metro on the computer through 10.0.2.2
// (10.0.3.2 on Genymotion), because adb reverse does not always work there.
const DEBUG_XML = XML.replace(
  "  </domain-config>",
  `    <domain includeSubdomains="false">10.0.2.2</domain>
    <domain includeSubdomains="false">10.0.3.2</domain>
  </domain-config>`,
);

/** The reader loads from loopback. Cleartext is not opened for any other host, except Metro's emulator aliases in debug builds. */
function withLocalCleartext(config) {
  config = withDangerousMod(config, [
    "android",
    (cfg) => {
      for (const [variant, xml] of [["main", XML], ["debug", DEBUG_XML]]) {
        const dir = path.join(cfg.modRequest.platformProjectRoot, `app/src/${variant}/res/xml`);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "network_security_config.xml"), xml);
      }
      return cfg;
    },
  ]);
  return withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    app.$["android:networkSecurityConfig"] = "@xml/network_security_config";
    return cfg;
  });
}

module.exports = withLocalCleartext;
