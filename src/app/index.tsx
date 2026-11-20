import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { classifyEncryption } from "@/domain/drm";
import { t } from "@/i18n";
import { BOOK_SERVER, DEVICE_CHECKS } from "@/renderer/device-checks";
import { decideOpen } from "@/renderer/open-decision";
import { parseReaderMessage, type CheckReport } from "@/renderer/protocol";
import { verdict } from "@/renderer/verdict";
import { allowReaderNavigation } from "@/renderer/webview-allow";

const PING_ID = "bridge-1";
const READER_URL = `${BOOK_SERVER}/reader.html`;

type ReaderWebView = WebView<object>;
type Row = { id: string; text: string };

export default function ReaderScreen() {
  const webRef = useRef<ReaderWebView>(null);
  const strings = t().reader;
  const [status, setStatus] = useState<string>(strings.bridgeWaiting);
  const [rows, setRows] = useState<Row[]>([]);
  const nextIndex = useRef(0);
  const started = useRef(false);
  const bridgeOk = useRef(false);
  const onMessageRef = useRef<(event: WebViewMessageEvent) => void>(() => {});

  function post(message: object) {
    webRef.current?.postMessage(JSON.stringify(message));
  }

  function sendRun(index: number) {
    const check = DEVICE_CHECKS[index];
    if (!check) {
      setStatus(strings.suiteDone);
      return;
    }
    setStatus(`${strings.suiteRunning} ${check.id}`);
    post({
      type: "run",
      id: check.id,
      url: `${BOOK_SERVER}/books/${check.file}`,
      mode: check.mode,
    });
  }

  onMessageRef.current = (event) => {
    const message = parseReaderMessage(event.nativeEvent.data);
    if (!message) return;
    if (message.type === "pong" && message.id === PING_ID) {
      bridgeOk.current = true;
      setStatus(strings.bridgeOk);
      if (!started.current) {
        started.current = true;
        nextIndex.current = 0;
        sendRun(0);
      }
      return;
    }
    if (message.type === "encryption") {
      const kind = classifyEncryption(message.xml);
      post({ type: "decision", id: message.id, kind, open: decideOpen(kind) });
      return;
    }
    if (message.type === "result") {
      const report = message.report as CheckReport;
      const result = verdict(message.id, report);
      const line = `${result.pass ? "PASS" : "FAIL"} ${result.reason} ${JSON.stringify(report)}`;
      setRows((current) => [...current, { id: message.id, text: line }]);
      nextIndex.current += 1;
      sendRun(nextIndex.current);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      if (bridgeOk.current) {
        clearInterval(timer);
        return;
      }
      post({ type: "ping", id: PING_ID });
    }, 400);
    return () => clearInterval(timer);
  }, []);

  return (
    <View style={styles.screen}>
      <Text style={styles.status}>{status}</Text>
      <WebView<object>
        ref={webRef}
        style={styles.web}
        originWhitelist={["http://127.0.0.1:8765", "http://localhost:8765", "blob:*"]}
        source={{ uri: READER_URL }}
        onLoadEnd={() => post({ type: "ping", id: PING_ID })}
        onMessage={(event) => onMessageRef.current(event)}
        onShouldStartLoadWithRequest={(request) => allowReaderNavigation(request.url)}
        setSupportMultipleWindows={false}
        javaScriptEnabled
      />
      <ScrollView style={styles.report}>
        {rows.map((row) => (
          <Text key={row.id} selectable style={styles.row}>
            {row.id}: {row.text}
          </Text>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  status: { paddingHorizontal: 16, paddingVertical: 8 },
  web: { flex: 1 },
  report: { maxHeight: 220, paddingHorizontal: 12 },
  row: { fontSize: 12, paddingVertical: 4 },
});
