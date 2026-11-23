const { withAndroidManifest, AndroidConfig } = require("expo/config-plugins");

const EPUB = "application/epub+zip";

function filter(action, extraData = []) {
  return {
    action: [{ $: { "android:name": action } }],
    category: [{ $: { "android:name": "android.intent.category.DEFAULT" } }],
    data: [...extraData, { $: { "android:mimeType": EPUB } }],
  };
}

/**
 * Quire shows up under "Open with" for EPUB files and in the share sheet.
 * The module (QuireLoopbackModule.takeIncomingBooks) reads the URIs, and the
 * library screen imports them as if they were picked.
 */
function withOpenBooks(config) {
  return withAndroidManifest(config, (cfg) => {
    const activity = AndroidConfig.Manifest.getMainActivityOrThrow(cfg.modResults);
    const filters = (activity["intent-filter"] = activity["intent-filter"] ?? []);
    const already = filters.some((entry) => (entry.data ?? []).some((data) => data.$?.["android:mimeType"] === EPUB));
    if (!already) {
      filters.push(
        filter("android.intent.action.VIEW", [{ $: { "android:scheme": "content" } }, { $: { "android:scheme": "file" } }]),
        filter("android.intent.action.SEND"),
        filter("android.intent.action.SEND_MULTIPLE"),
      );
    }
    return cfg;
  });
}

module.exports = withOpenBooks;
