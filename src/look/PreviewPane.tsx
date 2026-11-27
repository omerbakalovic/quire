import { Asset } from "expo-asset";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View, type LayoutChangeEvent } from "react-native";
import { WebView, type WebViewMessageEvent } from "react-native-webview";

import { classifyEncryption } from "@/domain/drm";
import { t } from "@/i18n";
import { AmbientBands } from "@/reader/AmbientBands";
import { LightVeil } from "@/reader/LightVeil";
import { lookFor, type Look } from "@/reader/look";
import { previewOpenMessage } from "@/reader/open-message";
import { appendNote, bookUrl, ensureLoopback, importBook, readerUrl, registerBook } from "@/renderer/book-url";
import { decideOpen } from "@/renderer/open-decision";
import { parseReaderMessage } from "@/renderer/protocol";
import { allowReaderNavigation, READER_ORIGIN_WHITELIST } from "@/renderer/webview-allow";
import type { UserFont } from "@/settings/fonts";
import { needsRelayout } from "@/settings/layers";
import type { Resolved } from "@/settings/registry";
import { themeFor, withAlpha } from "@/settings/themes";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const SAMPLE = require("../../assets/sample/quire-sample.epub");

/** The sample's id in app storage: the same bytes always give the same id, so this runs once per install. */
let sampleId: Promise<string> | null = null;

function ensureSample(): Promise<string> {
  sampleId ??= (async () => {
    const asset = Asset.fromModule(SAMPLE);
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    const stored = await importBook(uri.startsWith("/") ? `file://${uri}` : uri);
    if (!stored.ok) throw new Error(`sample book refused: ${stored.reason}`);
    return stored.id;
  })().catch((error: unknown) => {
    sampleId = null;
    throw error;
  });
  return sampleId;
}

const PING = "preview-ping";

/**
 * The sample page is laid out at the screen's own width, so its lines break
 * where a book's would, and drawn smaller to fit the pane: a small whole page,
 * not a close-up that would wrap differently.
 */
const PAGE_SCALE = 0.62;

function note(payload: Record<string, unknown>) {
  try {
    appendNote(JSON.stringify({ source: "preview", at: Date.now(), ...payload }));
  } catch {
    // The report file is a debugging aid only.
  }
}

type Props = {
  settings: Resolved;
  fonts: readonly UserFont[];
};

/**
 * Reading Look's live preview (docs/customization-roadmap.md, C2): the real
 * reader page, in its own WebView, opening a bundled sample chapter through
 * the reader's own open path and receiving the same look messages. The header
 * and footer lines are the reader's own component. Side taps turn the sample's
 * pages; nothing else in it leaves the preview.
 */
export function PreviewPane({ settings, fonts }: Props) {
  const strings = t().look;
  const webRef = useRef<WebView<object>>(null);
  const [id, setId] = useState<string | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const answered = useRef(false);
  const sent = useRef<Resolved | null>(null);
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSent = useRef(0);
  const openedAt = useRef(0);
  const look = useMemo(() => lookFor(settings, fonts), [settings, fonts]);
  const theme = themeFor(settings["theme.id"]);
  const screen = useWindowDimensions();

  const post = useCallback((message: object) => {
    webRef.current?.postMessage(JSON.stringify(message));
  }, []);

  useEffect(() => {
    let live = true;
    void (async () => {
      try {
        const sample = await ensureSample();
        await ensureLoopback();
        if (!registerBook(sample)) throw new Error("sample book not registered");
        if (!live) return;
        openedAt.current = Date.now();
        setId(sample);
        setUrl(readerUrl());
      } catch (error) {
        note({ phase: "failed", error: String(error) });
        if (live) setFailed(true);
      }
    })();
    return () => {
      live = false;
      if (pending.current) clearTimeout(pending.current);
    };
  }, []);

  // Keep pinging until the page answers, as the reader does.
  useEffect(() => {
    if (!url) return;
    const timer = setInterval(() => {
      if (!answered.current) post({ type: "ping", id: PING });
    }, 300);
    return () => clearInterval(timer);
  }, [url, post]);

  // Every change reaches the page. Colour changes go at once; a relayout at most every 120 ms while a slider moves.
  useEffect(() => {
    if (!ready || !id) return;
    const before = sent.current;
    if (before === settings) return;
    const relayout = before ? needsRelayout(before, settings) : false;
    const send = (value: Look, layout: boolean) => {
      sent.current = settings;
      lastSent.current = Date.now();
      post({ type: "look", id, look: value, relayout: layout });
    };
    if (pending.current) clearTimeout(pending.current);
    pending.current = null;
    const wait = relayout ? 120 - (Date.now() - lastSent.current) : 0;
    if (wait <= 0) send(look, relayout);
    else pending.current = setTimeout(() => send(look, relayout), wait);
  }, [ready, id, settings, look, post]);

  function onMessage(event: WebViewMessageEvent) {
    const message = parseReaderMessage(event.nativeEvent.data);
    if (!message || !id) return;
    switch (message.type) {
      case "pong":
        if (message.id !== PING || answered.current) return;
        answered.current = true;
        sent.current = settings;
        post(previewOpenMessage(id, bookUrl(id), look, { top: 0, bottom: 0, left: 0, right: 0 }));
        return;
      case "encryption": {
        const kind = classifyEncryption(message.xml);
        post({ type: "decision", id: message.id, kind, open: decideOpen(kind) });
        return;
      }
      case "opened":
        note({ phase: "opened", ms: Date.now() - openedAt.current });
        setReady(true);
        return;
      case "refused":
      case "failed":
        note({ phase: message.type, detail: message.type === "failed" ? message.error : message.kind });
        setFailed(true);
        return;
      default:
        // Web links, notes and actions stay inside the preview; there is nothing to leave to.
        return;
    }
  }

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    // Folded to nothing (the keyboard is up): keep the last size so the page stays loaded.
    if (height > 0) setSize({ width, height });
  };

  return (
    <View style={[styles.wrap, { backgroundColor: withAlpha(theme.ink, theme.dark ? 0.06 : 0.07) }]} onLayout={onLayout} accessibilityLabel={strings.previewLabel}>
      {size.height > 0 ? (
        <View
          style={[
            styles.page,
            {
              width: screen.width,
              height: size.height / PAGE_SCALE,
              left: (size.width - screen.width) / 2,
              top: (size.height - size.height / PAGE_SCALE) / 2,
              backgroundColor: look.page,
              transform: [{ scale: PAGE_SCALE }],
            },
          ]}
        >
          {url && !failed ? (
            <WebView<object>
              ref={webRef}
              style={[styles.web, { backgroundColor: look.page }]}
              originWhitelist={READER_ORIGIN_WHITELIST}
              source={{ uri: url }}
              onLoadEnd={() => post({ type: "ping", id: PING })}
              onMessage={onMessage}
              onShouldStartLoadWithRequest={(request) => allowReaderNavigation(request.url)}
              onRenderProcessGone={() => {
                note({ phase: "render-process-gone" });
                setFailed(true);
              }}
              setSupportMultipleWindows={false}
              nestedScrollEnabled={false}
              javaScriptEnabled
            />
          ) : null}
          {ready ? (
            <AmbientBands
              settings={settings}
              theme={theme}
              insets={{ top: 0, bottom: 0, left: 0, right: 0 }}
              scrolled={false}
              info={{
                title: strings.sampleTitle,
                author: strings.sampleAuthor,
                chapter: strings.sampleChapter,
                page: 12,
                pages: 40,
                fraction: 0.3,
                secondsLeftChapter: 14 * 60,
                secondsLeftBook: 3 * 3600 + 20 * 60,
              }}
            />
          ) : null}
          {/* The reader's own dimmer and warm veils, above the page and its bands as in the reader. */}
          {ready ? <LightVeil dimmer={settings["light.dimmer"]} warmth={settings["light.warmth"]} /> : null}
        </View>
      ) : null}
      {!ready && !failed ? (
        <View style={styles.cover} pointerEvents="none">
          <ActivityIndicator color={theme.inkMuted} />
        </View>
      ) : null}
      {failed ? (
        <View style={styles.cover}>
          <Text style={[styles.failed, { color: theme.inkMuted }]}>{strings.previewFailed}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, overflow: "hidden" },
  // Centred on the pane and scaled about its own centre (the default origin), so the scaled page fills the
  // pane's height exactly without depending on transformOrigin support.
  page: { position: "absolute", elevation: 2 },
  web: { flex: 1 },
  cover: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", padding: 16 },
  failed: { fontSize: 14, textAlign: "center" },
});
