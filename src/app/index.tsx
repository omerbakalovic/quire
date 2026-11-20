import { useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { classifyEncryption } from "@/domain/drm";
import { t } from "@/i18n";
import {
  appendNote,
  bookUrl,
  hasGo,
  hasTurns,
  launchCheck,
  markFirst,
  markReady,
  readerUrl,
  registerIfPresent,
  startLoopback,
} from "@/renderer/book-url";
import { checkForLaunch, type DeviceCheck } from "@/renderer/device-checks";
import { decideOpen } from "@/renderer/open-decision";
import { parseReaderMessage, type CheckReport } from "@/renderer/protocol";
import { verdict } from "@/renderer/verdict";
import { allowReaderNavigation, READER_ORIGIN_WHITELIST } from "@/renderer/webview-allow";

const PING_ID = "bridge-1";

type ReaderWebView = WebView<object>;
type Row = { id: string; text: string };
type HermesInternal = { getInstrumentedStats?: () => { js_heapSize?: number } };

function hermesHeap(): number | null {
  const hermes = (globalThis as { HermesInternal?: HermesInternal }).HermesInternal;
  const size = hermes?.getInstrumentedStats?.().js_heapSize;
  return typeof size === "number" ? size : null;
}

function note(payload: Record<string, unknown>) {
  appendNote(JSON.stringify({ source: "rn", hermesHeap: hermesHeap(), ...payload }));
}

export default function ReaderScreen() {
  const webRef = useRef<ReaderWebView>(null);
  const strings = t().reader;
  const specRef = useRef<DeviceCheck | null>(null);
  const continued = useRef(false);
  const readyOnce = useRef(false);
  const [status, setStatus] = useState<string>(strings.serverStarting);
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const onMessageRef = useRef<(event: WebViewMessageEvent) => void>(() => {});

  function post(message: object) {
    webRef.current?.postMessage(JSON.stringify(message));
  }

  onMessageRef.current = (event) => {
    const message = parseReaderMessage(event.nativeEvent.data);
    if (!message) return;
    const spec = specRef.current;
    if (message.type === "pong" && message.id === PING_ID) {
      if (readyOnce.current) return;
      readyOnce.current = true;
      if (!spec) {
        setStatus(strings.noCheck);
        return;
      }
      markReady();
      note({ phase: "ready", check: spec.id });
      setStatus(strings.readyWait);
      return;
    }
    if (message.type === "encryption") {
      const kind = classifyEncryption(message.xml);
      post({ type: "decision", id: message.id, kind, open: decideOpen(kind) });
      return;
    }
    if (message.type === "first") {
      markFirst();
      note({ phase: "first", check: message.id, report: message.report });
      setStatus(strings.firstPage);
      return;
    }
    if (message.type === "result") {
      markFirst();
      const report = message.report as CheckReport;
      const result = verdict(message.id, report);
      note({ phase: "result", check: message.id, pass: result.pass });
      const line = `${result.pass ? "PASS" : "FAIL"} ${result.reason} ${JSON.stringify(report)}`;
      setRows((current) => [...current, { id: message.id, text: line }]);
      setStatus(strings.suiteDone);
    }
  };

  useEffect(() => {
    let cancelled = false;
    const timers: ReturnType<typeof setInterval>[] = [];
    function poll(predicate: () => boolean, onHit: () => void) {
      const timer = setInterval(() => {
        if (cancelled) {
          clearInterval(timer);
          return;
        }
        if (!predicate()) return;
        clearInterval(timer);
        onHit();
      }, 200);
      timers.push(timer);
    }

    const requested = launchCheck();
    const spec = checkForLaunch(requested);
    specRef.current = spec;
    startLoopback()
      .then(async () => {
        if (cancelled) return;
        if (!spec) {
          setPageUrl(readerUrl());
          setStatus(strings.noCheck);
          return;
        }
        const registered = await registerIfPresent(spec.bookId, spec.fileName);
        note({ phase: "books", check: spec.id, registered, fileName: spec.fileName });
        if (!registered) {
          markReady();
          setStatus(strings.missingBook);
          return;
        }
        setPageUrl(readerUrl());
        setStatus(strings.bridgeWaiting);
        poll(
          () => hasGo(),
          () => {
            const current = specRef.current;
            if (!current) return;
            setStatus(`${strings.opening} ${current.id}`);
            post({
              type: "run",
              id: current.id,
              url: bookUrl(current.bookId),
              mode: current.mode,
              read: current.read,
            });
          },
        );
        poll(
          () => hasTurns() && !continued.current,
          () => {
            const current = specRef.current;
            if (!current) return;
            continued.current = true;
            post({ type: "continue", id: current.id });
          },
        );
      })
      .catch((error: unknown) => {
        if (!cancelled) setStatus(String(error));
      });

    return () => {
      cancelled = true;
      for (const timer of timers) clearInterval(timer);
    };
  }, [strings]);

  useEffect(() => {
    if (!pageUrl) return;
    const timer = setInterval(() => post({ type: "ping", id: PING_ID }), 400);
    return () => clearInterval(timer);
  }, [pageUrl]);

  return (
    <View style={styles.screen}>
      <Text style={styles.status}>{status}</Text>
      {pageUrl ? (
        <WebView<object>
          ref={webRef}
          style={styles.web}
          originWhitelist={READER_ORIGIN_WHITELIST}
          source={{ uri: pageUrl }}
          onLoadEnd={() => post({ type: "ping", id: PING_ID })}
          onMessage={(event) => onMessageRef.current(event)}
          onShouldStartLoadWithRequest={(request) => allowReaderNavigation(request.url)}
          setSupportMultipleWindows={false}
          javaScriptEnabled
        />
      ) : null}
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
