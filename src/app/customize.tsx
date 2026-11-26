import { Redirect } from "expo-router";

/** The old Reading look route (before C1). Links and the phone matrix may still open it. */
export default function CustomizeRedirect() {
  return <Redirect href="/look" />;
}
