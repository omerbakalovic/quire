import { Asset } from "expo-asset";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import readerHtml from "../../assets/reader/index.html";
import { t } from "@/i18n";
import { parseReaderMessage } from "@/renderer/protocol";

const PING_ID = "bridge-1";

// The package's default type argument is `undefined`, and `WebViewProps & undefined` is `never`.
type ReaderWebView = WebView<object>;

export default function ReaderScreen() {
  const webRef = useRef<ReaderWebView>(null);
  const strings = t().reader;
  const [uri, setUri] = useState<string | null>(null);
  const [status, setStatus] = useState<string>(strings.bridgeWaiting);

  useEffect(() => {
    let cancelled = false;
    const asset = Asset.fromModule(readerHtml);
    asset
      .downloadAsync()
      .then(() => {
        if (!cancelled) setUri(asset.localUri ?? asset.uri);
      })
      .catch(() => {
        if (!cancelled) setStatus(strings.bridgeFailed);
      });
    return () => {
      cancelled = true;
    };
  }, [strings.bridgeFailed]);

  function sendPing() {
    webRef.current?.postMessage(JSON.stringify({ type: "ping", id: PING_ID }));
  }

  function onMessage(event: WebViewMessageEvent) {
    const message = parseReaderMessage(event.nativeEvent.data);
    if (message?.id === PING_ID) setStatus(strings.bridgeOk);
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.status}>{status}</Text>
      {uri ? (
        <WebView<object>
          ref={webRef}
          style={styles.web}
          originWhitelist={["*"]}
          source={{ uri }}
          allowFileAccess
          allowingReadAccessToURL={uri}
          onLoadEnd={sendPing}
          onMessage={onMessage}
          setSupportMultipleWindows={false}
          javaScriptEnabled
        />
      ) : (
        <ActivityIndicator />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  status: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  web: {
    flex: 1,
  },
});
