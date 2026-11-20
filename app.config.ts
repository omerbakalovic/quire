import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ConfigContext, ExpoConfig } from "expo/config";

// Expo compiles this file to CommonJS and cannot import the TypeScript re-export.
// The command is run from the project root, which is where this JSON lives.
const appIdentity = JSON.parse(
  readFileSync(join(process.cwd(), "src/config/identity.json"), "utf8"),
) as {
  name: string;
  slug: string;
  scheme: string;
  version: string;
  androidPackage: string;
  iosBundleIdentifier: string;
};

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: appIdentity.name,
  slug: appIdentity.slug,
  version: appIdentity.version,
  orientation: "default",
  icon: "./assets/images/icon.png",
  scheme: appIdentity.scheme,
  userInterfaceStyle: "automatic",
  ios: {
    bundleIdentifier: appIdentity.iosBundleIdentifier,
    icon: "./assets/expo.icon",
  },
  android: {
    package: appIdentity.androidPackage,
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
    },
    predictiveBackGestureEnabled: false,
  },
  web: {
    output: "single",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "./plugins/withLocalCleartext",
    "expo-router",
    [
      "expo-splash-screen",
      {
        backgroundColor: "#208AEF",
        image: "./assets/images/splash-icon.png",
        imageWidth: 76,
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
});
