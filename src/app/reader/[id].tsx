import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, BackHandler, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { classifyEncryption } from "@/domain/drm";
import { findBook, type Flow } from "@/domain/library";
import { t } from "@/i18n";
import { flushLibrary, getLibrary, loadLibrary, saveFlow, saveOpened, savePosition, useLibrary } from "@/library/store";
import { appendNote, bookUrl, ensureLoopback, isServing, readerUrl, registerBook } from "@/renderer/book-url";
import { decideOpen } from "@/renderer/open-decision";
import { parseReaderMessage } from "@/renderer/protocol";
import { allowReaderNavigation, READER_ORIGIN_WHITELIST } from "@/renderer/webview-allow";

type ReaderWebView = WebView<object>;
type Phase = "starting" | "opening" | "reading" | "missing" | "drm" | "failed";

const PING_ID = "reader-ping";

/** One JSON line per reader event in files/quire-report.jsonl, for the phone matrix. */
function note(payload: Record<string, unknown>) {
  try {
    appendNote(JSON.stringify({ source: "reader", at: Date.now(), ...payload }));
  } catch {
    // The report file is a debugging aid. Reading never depends on it.
  }
}
const SAVE_EVERY_MS = 1500;

export default function BookScreen() {
  const strings = t().book;
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const library = useLibrary();
  const book = id ? findBook(library, id) : null;
  const webRef = useRef<ReaderWebView>(null);
  const [pageUrl, setPageUrl] = useState<string | null>(null);
  const [mount, setMount] = useState(0);
  const [phase, setPhase] = useState<Phase>("starting");
  const [controls, setControls] = useState(true);
  const [flow, setFlowState] = useState<Flow>(() => getLibrary().flow);
  const [chapter, setChapter] = useState<string | null>(null);
  const [fraction, setFraction] = useState<number | null>(book?.fraction ?? null);
  const [notice, setNotice] = useState<string | null>(null);
  const answered = useRef(false);
  const lastSaved = useRef(0);
  const pending = useRef<{ cfi: string; fraction: number | null } | null>(null);
  const latestCfi = useRef<string | null>(book?.cfi ?? null);
  const noteOpen = useRef(false);
  const tapZones = library.settings.tapZones;

  const post = useCallback((message: object) => {
    webRef.current?.postMessage(JSON.stringify(message));
  }, []);

  const flush = useCallback(() => {
    const next = pending.current;
    if (!next || !id) return;
    pending.current = null;
    lastSaved.current = Date.now();
    void savePosition(id, next.cfi, next.fraction);
  }, [id]);

  // Start (or reuse) the loopback server, register this book, and load the reader page.
  const connect = useCallback(async () => {
    if (!id) return;
    await loadLibrary();
    if (!findBook(getLibrary(), id)) {
      setPhase("missing");
      return;
    }
    await ensureLoopback();
    if (!registerBook(id)) {
      setPhase("missing");
      return;
    }
    answered.current = false;
    setPageUrl(readerUrl());
    setMount((value) => value + 1);
    setPhase("opening");
  }, [id]);

  useEffect(() => {
    void connect().catch(() => setPhase("failed"));
    if (id) void saveOpened(id);
  }, [connect, id]);

  // Until the page answers, keep pinging. Then open the book where it was left.
  useEffect(() => {
    if (!pageUrl) return;
    const timer = setInterval(() => {
      if (!answered.current) post({ type: "ping", id: PING_ID });
    }, 300);
    return () => clearInterval(timer);
  }, [pageUrl, mount, post]);

  // The process can outlive the server, and the WebView can lose its renderer.
  // Coming back to the foreground checks the server and reconnects if it is gone.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "background" || state === "inactive") {
        flush();
        void flushLibrary();
        return;
      }
      if (state === "active") note({ phase: "foreground", id, serving: isServing() });
      if (state === "active" && !isServing()) {
        setNotice(strings.reloading);
        void connect().catch(() => setPhase("failed"));
      }
    });
    return () => {
      subscription.remove();
      flush();
    };
  }, [connect, flush, strings.reloading]);

  function onMessage(event: WebViewMessageEvent) {
    const message = parseReaderMessage(event.nativeEvent.data);
    if (!message || !id) return;
    switch (message.type) {
      case "pong": {
        if (message.id !== PING_ID || answered.current) return;
        answered.current = true;
        post({
          type: "open",
          id,
          url: bookUrl(id),
          flow: getLibrary().flow,
          cfi: latestCfi.current ?? findBook(getLibrary(), id)?.cfi ?? null,
          settings: getLibrary().settings,
        });
        return;
      }
      case "encryption": {
        const kind = classifyEncryption(message.xml);
        post({ type: "decision", id: message.id, kind, open: decideOpen(kind) });
        return;
      }
      case "opened":
        note({
          phase: "opened",
          id,
          title: message.title,
          sections: message.sections,
          openMs: message.openMs,
          rangeRequests: message.rangeRequests,
          restored: message.restored,
          flow: getLibrary().flow,
        });
        setPhase("reading");
        setNotice(null);
        return;
      case "relocate": {
        note({
          phase: "relocate",
          id,
          cfi: message.cfi,
          fraction: message.fraction,
          section: message.sectionIndex,
          sinceTapMs: message.sinceTapMs,
        });
        latestCfi.current = message.cfi;
        setFraction(message.fraction);
        setChapter(message.tocLabel);
        pending.current = { cfi: message.cfi, fraction: message.fraction };
        if (Date.now() - lastSaved.current > SAVE_EVERY_MS) flush();
        return;
      }
      case "tap":
        setControls((value) => !value);
        return;
      case "note":
        noteOpen.current = message.open;
        note({ phase: "note", id, open: message.open, href: message.href, error: message.error });
        if (message.open) setControls(false);
        return;
      case "refused":
        note({ phase: "refused", id, kind: message.kind });
        setPhase("drm");
        return;
      case "failed":
        note({ phase: "failed", id, error: message.error });
        setPhase("failed");
        return;
      case "external-link":
        setNotice(strings.externalLink);
        return;
      default:
        return;
    }
  }

  // Settings changed elsewhere reach the open page.
  useEffect(() => {
    if (id && phase === "reading") post({ type: "settings", id, tapZones });
  }, [id, phase, tapZones, post]);

  // Android back closes an open note before it leaves the book.
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!noteOpen.current || !id) return false;
      post({ type: "close-note", id });
      noteOpen.current = false;
      return true;
    });
    return () => subscription.remove();
  }, [id, post]);

  // Save the position every so often while reading, not on every relocate.
  useEffect(() => {
    const timer = setInterval(flush, SAVE_EVERY_MS);
    return () => clearInterval(timer);
  }, [flush]);

  function switchFlow(next: Flow) {
    if (next === flow || !id) return;
    note({ phase: "flow", id, flow: next, cfi: latestCfi.current });
    setFlowState(next);
    void saveFlow(next);
    post({ type: "flow", id, flow: next });
  }

  const message =
    phase === "missing" ? strings.notFound : phase === "drm" ? strings.drm : phase === "failed" ? strings.failed : null;
  const percent = fraction === null ? null : Math.round(fraction * 100);

  return (
    <View style={styles.screen}>
      <Stack.Screen options={{ headerShown: false }} />
      {pageUrl && !message ? (
        <WebView<object>
          key={mount}
          ref={webRef}
          style={styles.web}
          originWhitelist={READER_ORIGIN_WHITELIST}
          source={{ uri: pageUrl }}
          onLoadEnd={() => post({ type: "ping", id: PING_ID })}
          onMessage={onMessage}
          onShouldStartLoadWithRequest={(request) => allowReaderNavigation(request.url)}
          onRenderProcessGone={() => {
            note({ phase: "render-process-gone", id });
            setNotice(strings.reloading);
            void connect().catch(() => setPhase("failed"));
          }}
          setSupportMultipleWindows={false}
          javaScriptEnabled
        />
      ) : null}
      {phase === "starting" || phase === "opening" ? (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" />
          <Text style={styles.overlayText}>{strings.opening}</Text>
        </View>
      ) : null}
      {message ? (
        <View style={styles.overlay}>
          <Text style={styles.overlayText}>{message}</Text>
          <Pressable onPress={() => router.back()} accessibilityRole="button" style={styles.button}>
            <Text style={styles.buttonText}>{strings.back}</Text>
          </Pressable>
        </View>
      ) : null}
      {controls && phase === "reading" ? (
        <>
          <View style={[styles.bar, styles.top, { paddingTop: insets.top + 6 }]}>
            <Pressable onPress={() => router.back()} accessibilityRole="button" hitSlop={10}>
              <Text style={styles.barButton}>‹ {strings.back}</Text>
            </Pressable>
            <View style={styles.titleBox}>
              <Text style={styles.barTitle} numberOfLines={1}>
                {book?.title ?? ""}
              </Text>
              {chapter ? (
                <Text style={styles.barSub} numberOfLines={1}>
                  {chapter}
                </Text>
              ) : null}
            </View>
          </View>
          <View style={[styles.bar, styles.bottom, { paddingBottom: insets.bottom + 8 }]}>
            <View style={styles.segment}>
              {(["paginated", "scrolled"] as const).map((option) => (
                <Pressable
                  key={option}
                  onPress={() => switchFlow(option)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: flow === option }}
                  style={[styles.segmentItem, flow === option && styles.segmentOn]}
                >
                  <Text style={[styles.segmentText, flow === option && styles.segmentTextOn]}>
                    {option === "paginated" ? strings.paginated : strings.scrolled}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.percent}>{percent === null ? "" : `${percent}%`}</Text>
            <View style={styles.turns}>
              <Pressable
                onPress={() => post({ type: "turn", id, dir: "prev" })}
                accessibilityRole="button"
                accessibilityLabel={strings.prev}
                style={styles.turnButton}
              >
                <Text style={styles.barButton}>‹</Text>
              </Pressable>
              <Pressable
                onPress={() => post({ type: "turn", id, dir: "next" })}
                accessibilityRole="button"
                accessibilityLabel={strings.next}
                style={styles.turnButton}
              >
                <Text style={styles.barButton}>›</Text>
              </Pressable>
            </View>
          </View>
        </>
      ) : null}
      {notice ? (
        <Pressable style={[styles.notice, { bottom: insets.bottom + 72 }]} onPress={() => setNotice(null)}>
          <Text style={styles.noticeText}>{notice}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#111" },
  web: { flex: 1, backgroundColor: "#fff" },
  overlay: {
    ...StyleSheet.absoluteFill,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    gap: 16,
    backgroundColor: "#111",
  },
  overlayText: { color: "#eee", fontSize: 16, textAlign: "center" },
  button: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8, backgroundColor: "#333" },
  buttonText: { color: "#fff", fontSize: 16 },
  bar: {
    position: "absolute",
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    backgroundColor: "#1c1c1ef2",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  top: { top: 0, paddingBottom: 10 },
  bottom: { bottom: 0, paddingTop: 8, justifyContent: "space-between" },
  titleBox: { flex: 1 },
  barTitle: { color: "#fff", fontSize: 16, fontWeight: "600" },
  barSub: { color: "#bbb", fontSize: 13 },
  barButton: { color: "#fff", fontSize: 18, paddingVertical: 6 },
  segment: { flexDirection: "row", borderRadius: 8, borderWidth: 1, borderColor: "#555", overflow: "hidden" },
  segmentItem: { paddingHorizontal: 14, paddingVertical: 10, minHeight: 44, justifyContent: "center" },
  segmentOn: { backgroundColor: "#eee" },
  segmentText: { color: "#eee", fontSize: 14 },
  segmentTextOn: { color: "#111", fontWeight: "600" },
  percent: { color: "#ccc", fontSize: 14, minWidth: 44, textAlign: "center" },
  turns: { flexDirection: "row", gap: 4 },
  turnButton: { minWidth: 44, minHeight: 44, alignItems: "center", justifyContent: "center" },
  notice: {
    position: "absolute",
    left: 16,
    right: 16,
    padding: 12,
    borderRadius: 8,
    backgroundColor: "#333e",
  },
  noticeText: { color: "#fff", fontSize: 14, textAlign: "center" },
});
