import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState, type ComponentRef } from "react";
import { ActivityIndicator, AppState, BackHandler, PixelRatio, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { setReaderDebug } from "@/debug/matrix-command";
import { classifyEncryption } from "@/domain/drm";
import { findBook, type Flow, type PositionReport } from "@/domain/library";
import { adjacentChapter, currentEntry, type NavEntry } from "@/domain/navigation";
import { EMPTY_SPEED, recordTurn, speedOf, timeLeft, type Speed, type SpeedState } from "@/domain/reading-speed";
import { t } from "@/i18n";
import { flushLibrary, getLibrary, loadLibrary, saveFlow, saveOpened, savePosition, useLibrary } from "@/library/store";
import { appendNote, bookUrl, ensureLoopback, isServing, readerUrl, registerBook } from "@/renderer/book-url";
import { decideOpen } from "@/renderer/open-decision";
import { parseReaderMessage, type HostAction } from "@/renderer/protocol";
import { allowReaderNavigation, READER_ORIGIN_WHITELIST } from "@/renderer/webview-allow";
import { AmbientBands } from "@/reader/AmbientBands";
import { BackPill } from "@/reader/BackPill";
import { confirmExternalLink } from "@/reader/external-link";
import { ControlBars } from "@/reader/ControlBars";
import { confirmRemoveFont, pickFont } from "@/reader/font-import";
import { LightVeil } from "@/reader/LightVeil";
import { useBrightness } from "@/reader/useBrightness";
import { QuickPanel } from "@/reader/QuickPanel";
import { chromeFor, ChromeProvider } from "@/reader/chrome";
import { TocPanel } from "@/reader/TocPanel";
import { gestureMap } from "@/settings/gestures";
import { useLook } from "@/reader/useLook";

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
  const flowRef = useRef(flow);
  flowRef.current = flow;
  // This session's reading speed, for "time left" in the header and footer.
  const speedState = useRef<SpeedState>(EMPTY_SPEED);
  const [speed, setSpeed] = useState<Speed>(() => speedOf(EMPTY_SPEED));
  const [chapter, setChapter] = useState<string | null>(null);
  const [fraction, setFraction] = useState<number | null>(book?.fraction ?? null);
  // Where the visible page starts; `fraction` is where it ends. Chapter logic needs the start.
  const [startFraction, setStartFraction] = useState<number | null>(null);
  // Page in the chapter and the chapter's page count, for the header and footer. Null in scroll mode.
  const [pageInChapter, setPageInChapter] = useState<{ page: number | null; pages: number | null }>({ page: null, pages: null });
  const [scrubbing, setScrubbing] = useState(false);
  // Height of the bottom control bars (layout slots), so the Back pill and notices sit above them.
  const [bottomHeight, setBottomHeight] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [toc, setToc] = useState<NavEntry[]>([]);
  const [tocHref, setTocHref] = useState<string | null>(null);
  const [tocOpen, setTocOpen] = useState(false);
  const [lookOpen, setLookOpen] = useState(false);
  const lookOpenRef = useRef(false);
  const [backStack, setBackStack] = useState<{ depth: number; label: string | null }>({ depth: 0, label: null });
  const answered = useRef(false);
  const lastSaved = useRef(0);
  const pending = useRef<PositionReport | null>(null);
  const latest = useRef<PositionReport | null>(
    book?.cfi
      ? { cfi: book.cfi, fraction: book.fraction, sectionIndex: book.sectionIndex, sectionFraction: book.sectionFraction }
      : null,
  );
  const tocOpenRef = useRef(false);
  const backDepth = useRef(0);
  const noteOpen = useRef(false);
  const canGoBack = useRef(false);
  const [fixedLayout, setFixedLayout] = useState(false);
  const tapZones = library.settings.tapZones;
  const screenRef = useRef<ComponentRef<typeof View>>(null);
  const debugWaiters = useRef(new Map<string, (result: unknown) => void>());
  const debugSeq = useRef(0);

  const post = useCallback((message: object) => {
    webRef.current?.postMessage(JSON.stringify(message));
  }, []);
  const reader = useLook(library, id ?? null, phase === "reading", post);
  useBrightness(reader.settings["light.brightness"], phase === "reading");
  // A string, so the effect that sends it runs only when a gesture really changes.
  const gestures = JSON.stringify(gestureMap(reader.settings));

  const flush = useCallback(() => {
    const next = pending.current;
    if (!next || !id) return;
    pending.current = null;
    lastSaved.current = Date.now();
    void savePosition(id, next);
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
        const saved = findBook(getLibrary(), id);
        const position =
          latest.current ??
          (saved ? { cfi: saved.cfi, fraction: saved.fraction, sectionIndex: saved.sectionIndex, sectionFraction: saved.sectionFraction } : null);
        // The page starts a new back stack with every open.
        backDepth.current = 0;
        setBackStack({ depth: 0, label: null });
        reader.opened();
        post({
          type: "open",
          id,
          url: bookUrl(id),
          flow: getLibrary().flow,
          cfi: position?.cfi ?? null,
          position,
          look: reader.look,
          settings: getLibrary().settings,
          insets: { top: insets.top, bottom: insets.bottom, left: insets.left, right: insets.right },
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
          restoredFrom: message.restoredFrom,
          flow: getLibrary().flow,
        });
        setToc(message.toc);
        setFixedLayout(message.fixedLayout);
        // Every open starts an empty jump stack in the page. Match it here too, so a pill
        // from an earlier visit can never outlive the open (phone run 7b, noteref).
        backDepth.current = 0;
        setBackStack({ depth: 0, label: null });
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
          sectionFraction: message.sectionFraction,
          sinceTapMs: message.sinceTapMs,
        });
        const report: PositionReport = {
          cfi: message.cfi,
          fraction: message.fraction,
          sectionIndex: message.sectionIndex,
          sectionFraction: message.sectionFraction,
        };
        latest.current = report;
        canGoBack.current = message.canGoBack;
        setFraction(message.fraction);
        setStartFraction(message.startFraction);
        setChapter(message.tocLabel);
        setTocHref(message.tocHref);
        setPageInChapter((was) => (was.page === message.page && was.pages === message.pages ? was : { page: message.page, pages: message.pages }));
        // Scroll mode has no pages, so it gives no samples; the last speed stays.
        speedState.current = recordTurn(speedState.current, {
          at: Date.now(),
          section: message.sectionIndex,
          page: flowRef.current === "paginated" ? message.page : null,
          fraction: message.fraction,
        });
        setSpeed((was) => {
          const next = speedOf(speedState.current);
          return was.secondsPerPage === next.secondsPerPage && was.secondsPerBook === next.secondsPerBook ? was : next;
        });
        pending.current = report;
        if (Date.now() - lastSaved.current > SAVE_EVERY_MS) flush();
        return;
      }
      case "action":
        runAction(message.action);
        return;
      case "back-stack":
        if (message.id !== id) return;
        note({ phase: "back-stack", id, depth: message.depth });
        backDepth.current = message.depth;
        setBackStack({ depth: message.depth, label: message.label });
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
        note({ phase: "external-link", id, href: message.href });
        confirmExternalLink(message.href, setNotice);
        return;
      case "debug": {
        const waiter = debugWaiters.current.get(message.reqId);
        debugWaiters.current.delete(message.reqId);
        waiter?.(message.result);
        return;
      }
      default:
        return;
    }
  }

  // Settings changed elsewhere reach the open page.
  useEffect(() => {
    if (id && phase === "reading") post({ type: "settings", id, tapZones, gestures: JSON.parse(gestures) });
  }, [id, phase, tapZones, gestures, post]);

  // The system bars can change, for example on rotation. The page keeps its sheet and text clear of them.
  useEffect(() => {
    if (id && phase === "reading") post({ type: "insets", id, top: insets.top, bottom: insets.bottom, left: insets.left, right: insets.right });
  }, [id, phase, insets.top, insets.bottom, insets.left, insets.right, post]);

  // Android back closes an open note, then the contents, then steps back through jumps,
  // then returns from a note's "Go to note", then leaves the book.
  useEffect(() => {
    const subscription = BackHandler.addEventListener("hardwareBackPress", () => {
      if (!id) return false;
      if (noteOpen.current) {
        post({ type: "close-note", id });
        noteOpen.current = false;
        return true;
      }
      if (tocOpenRef.current) {
        tocOpenRef.current = false;
        setTocOpen(false);
        return true;
      }
      if (lookOpenRef.current) {
        lookOpenRef.current = false;
        setLookOpen(false);
        return true;
      }
      if (backDepth.current > 0) {
        post({ type: "back", id });
        return true;
      }
      if (canGoBack.current) {
        post({ type: "history-back", id });
        canGoBack.current = false;
        return true;
      }
      return false;
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
    note({ phase: "flow", id, flow: next, cfi: latest.current?.cfi ?? null });
    setFlowState(next);
    void saveFlow(next);
    post({ type: "flow", id, flow: next });
  }

  const at = startFraction ?? fraction;
  const current = currentEntry(toc, tocHref, at);

  function showLook(open: boolean) {
    lookOpenRef.current = open;
    setLookOpen(open);
  }

  function showToc(open: boolean) {
    tocOpenRef.current = open;
    setTocOpen(open);
  }

  function jumpTo(target: { href: string } | { fraction: number }) {
    if (!id) return;
    note({ phase: "jump", id, target, from: latest.current?.cfi ?? null });
    post({ type: "goto", id, target });
  }

  /** A gesture's action (docs/customization.md, 3.5): the same thing the matching control does. */
  function runAction(action: HostAction) {
    note({ phase: "gesture", id, action });
    switch (action) {
      case "bars":
        setControls((value) => !value);
        return;
      case "contents":
        showToc(true);
        return;
      case "look":
        if (!fixedLayout) showLook(true);
        return;
      case "prevChapter":
      case "nextChapter":
        stepChapter(action === "prevChapter" ? "prev" : "next");
        return;
      case "flow":
        if (!fixedLayout) switchFlow(flow === "paginated" ? "scrolled" : "paginated");
        return;
      case "back":
        router.back();
        return;
    }
  }

  function stepChapter(dir: "prev" | "next") {
    const index = adjacentChapter(toc, current, dir, at);
    const href = index >= 0 ? toc[index].href : null;
    if (href) jumpTo({ href });
  }

  // Debug builds: the phone matrix (scripts/phone-matrix.mjs) drives and measures this screen.
  async function handleDebug(action: string, args: Record<string, unknown>): Promise<unknown> {
    const screen = await new Promise<{ x: number; y: number; width: number; height: number } | null>((resolve) => {
      const node = screenRef.current;
      if (!node) {
        resolve(null);
        return;
      }
      node.measureInWindow((x, y, width, height) => resolve({ x, y, width, height }));
    });
    const native = { screen, scale: PixelRatio.get(), controls, phase, flow, noteOpen: noteOpen.current };
    switch (action) {
      case "layout":
        return { native };
      case "flow": {
        const next: Flow = args.flow === "scrolled" ? "scrolled" : "paginated";
        switchFlow(next);
        return { native: { ...native, flow: next } };
      }
      case "turn":
        post({ type: "turn", id, dir: args.dir === "prev" ? "prev" : "next" });
        return { native };
      case "controls":
        setControls(args.show === true);
        return { native: { ...native, controls: args.show === true } };
      default: {
        const reqId = `debug-${++debugSeq.current}`;
        const page = await new Promise<unknown>((resolve) => {
          debugWaiters.current.set(reqId, resolve);
          post({ ...args, type: "debug", id, reqId, action });
        });
        return { native, page };
      }
    }
  }
  const debugRef = useRef(handleDebug);
  useEffect(() => {
    debugRef.current = handleDebug;
  });
  useEffect(() => {
    if (!__DEV__ || !id || phase !== "reading") return;
    return setReaderDebug(id, (action, args) => debugRef.current(action, args));
  }, [id, phase]);

  const message =
    phase === "missing" ? strings.notFound : phase === "drm" ? strings.drm : phase === "failed" ? strings.failed : null;

  const chrome = chromeFor(reader.chrome);
  return (
    <ChromeProvider chrome={chrome}>
      <View ref={screenRef} style={[styles.screen, { backgroundColor: reader.look.page }]} collapsable={false}>
        <StatusBar style={chrome.dark ? "light" : "dark"} />
        <Stack.Screen options={{ headerShown: false }} />
        {pageUrl && !message ? (
          <WebView<object>
            key={mount}
            ref={webRef}
            style={[styles.web, { backgroundColor: reader.look.page }]}
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
        {phase === "reading" && !fixedLayout ? (
          <AmbientBands
            settings={reader.settings}
            theme={reader.theme}
            insets={insets}
            scrolled={flow === "scrolled"}
            info={{
              title: book?.title ?? null,
              author: book?.authors?.[0] ?? null,
              chapter,
              page: pageInChapter.page,
              pages: pageInChapter.pages,
              fraction,
              ...secondsLeft(timeLeft(speed, { page: pageInChapter.page, pages: pageInChapter.pages, fraction })),
            }}
          />
        ) : null}
        {phase === "reading" ? <LightVeil dimmer={reader.settings["light.dimmer"]} warmth={reader.settings["light.warmth"]} /> : null}
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
          <ControlBars
            settings={reader.settings}
            insets={insets}
            title={book?.title ?? ""}
            chapter={chapter}
            fraction={fraction}
            toc={toc}
            flow={flow}
            fixedLayout={fixedLayout}
            onBack={() => router.back()}
            onFlow={switchFlow}
            onContents={() => showToc(true)}
            onChapter={stepChapter}
            onSeek={(value) => jumpTo({ fraction: value })}
            onScrub={setScrubbing}
            onLook={() => showLook(true)}
            onBottomHeight={setBottomHeight}
          />
        ) : null}
        {phase === "reading" && !tocOpen && !lookOpen && !scrubbing ? (
          <BackPill
            depth={backStack.depth}
            label={backStack.label}
            bottom={controls ? Math.max(bottomHeight, insets.bottom) + 8 : insets.bottom + 24}
            onBack={() => post({ type: "back", id })}
            onDismiss={() => post({ type: "back", id, clear: true })}
          />
        ) : null}
        {lookOpen ? (
          <QuickPanel
            settings={reader.settings}
            chrome={reader.chrome}
            scope={reader.scope}
            profileName={reader.profileName}
            overridden={reader.overridden}
            bottomInset={insets.bottom}
            userFonts={library.custom.fonts}
            onAddFont={() => void pickFont((font) => reader.change("type.fontFamily", font.id))}
            onRemoveFont={confirmRemoveFont}
            onScope={reader.setScope}
            onChange={reader.change}
            onLayout={reader.layout}
            onReset={reader.reset}
            onClose={() => showLook(false)}
          />
        ) : null}
        {tocOpen ? (
          <TocPanel
            toc={toc}
            current={current}
            topInset={insets.top}
            bottomInset={insets.bottom}
            onClose={() => showToc(false)}
            onSelect={(entry) => {
              showToc(false);
              if (entry.href) jumpTo({ href: entry.href });
            }}
          />
        ) : null}
        {notice ? (
          <Pressable style={[styles.notice, { bottom: controls ? Math.max(bottomHeight, insets.bottom) + 8 : insets.bottom + 72 }]} onPress={() => setNotice(null)}>
            <Text style={styles.noticeText}>{notice}</Text>
          </Pressable>
        ) : null}
      </View>
    </ChromeProvider>
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

function secondsLeft(left: { chapter: number | null; book: number | null }) {
  return { secondsLeftChapter: left.chapter, secondsLeftBook: left.book };
}
