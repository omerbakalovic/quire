import { getDocumentAsync } from "expo-document-picker";
import { Redirect, Stack, useRouter } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, AppState, FlatList, Image, Modal, Pressable, StyleSheet, Text, View } from "react-native";

import { sortedBooks, type LibraryBook } from "@/domain/library";
import { editionLabels, PALETTE, pillColor, textOn, type LibraryLook } from "@/domain/library-look";
import { t } from "@/i18n";
import { useChrome } from "@/reader/chrome";
import { confirm } from "@/ui/confirm";
import {
  importFiles,
  loadLibrary,
  measureMissingCovers,
  removeFromLibrary,
  saveBookColor,
  useLibrary,
  type ImportSummary,
} from "@/library/store";
import {
  appendNote,
  launchCheck,
  onIncomingBooks,
  takeIncomingBooks,
  takePendingImports,
  type IncomingBook,
} from "@/renderer/book-url";

type ImportSource = "pick" | "incoming" | "import";

function summarize(results: ImportSummary[]): string {
  const strings = t().library;
  const count = (kind: string) => results.filter((result) => result.outcome.kind === kind).length;
  const lines = [
    count("added") ? strings.added(count("added")) : null,
    count("duplicate") ? strings.duplicates(count("duplicate")) : null,
    count("drm") ? strings.drm(count("drm")) : null,
    count("not-epub") ? strings.notEpub(count("not-epub")) : null,
    count("error") ? strings.failed(count("error")) : null,
  ];
  const failures = results
    .filter((result) => result.outcome.kind !== "added" && result.outcome.kind !== "duplicate")
    .map((result) => `• ${result.name}`);
  return [...lines.filter(Boolean), ...failures].join("\n");
}

function BookRow({
  book,
  look,
  edition,
  onOpen,
  onLongPress,
}: {
  book: LibraryBook;
  look: LibraryLook;
  edition: string | null;
  onOpen: () => void;
  onLongPress: () => void;
}) {
  const strings = t().library;
  const percent = book.fraction === null ? null : Math.round(book.fraction * 100);
  const author = book.authors.join(", ") || strings.unknownAuthor;
  const c = useChrome();
  const pills = look.style === "pills";
  const background = pills ? pillColor(look, book.id, c.pillDefault) : null;
  const inkStyle = { color: background ? textOn(background) : c.appInk };
  const details = [
    look.showAuthor ? author : null,
    edition,
    look.showProgress ? (percent === null ? strings.notStarted : strings.percentRead(percent)) : null,
  ].filter(Boolean);
  return (
    <Pressable
      style={({ pressed }) => [
        pills ? styles.pill : [styles.line, { borderBottomColor: c.divider }],
        background ? { backgroundColor: background } : null,
        pressed && styles.pressed,
      ]}
      onPress={onOpen}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${book.title}, ${author}`}
      accessibilityHint={strings.longPressHint}
    >
      {pills && look.showCovers && book.coverUri ? (
        <Image source={{ uri: book.coverUri }} style={[styles.cover, { backgroundColor: c.divider }]} resizeMode="cover" />
      ) : null}
      <View style={styles.meta}>
        <Text style={[styles.title, inkStyle]} numberOfLines={2}>
          {book.title}
        </Text>
        {details.length > 0 ? (
          <Text style={[styles.detail, inkStyle]} numberOfLines={1}>
            {details.join("  ·  ")}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/** Long-press on a book: its pill colour and removal. */
function BookSheet({
  book,
  look,
  onClose,
  onRemove,
}: {
  book: LibraryBook | null;
  look: LibraryLook;
  onClose: () => void;
  onRemove: (book: LibraryBook) => void;
}) {
  const strings = t().library;
  const c = useChrome();
  if (!book) return null;
  const chosen = look.bookColors[book.id] ?? null;
  const cover = look.coverColors[book.id] ?? null;
  return (
    <Modal transparent animationType="fade" visible onRequestClose={onClose}>
      <Pressable style={[styles.scrim, { backgroundColor: c.shade }]} onPress={onClose} accessibilityLabel={strings.cancel}>
        <Pressable style={[styles.sheet, { backgroundColor: c.sheet }]} onPress={() => {}}>
          <Text style={[styles.sheetTitle, { color: c.sheetInk }]} numberOfLines={2}>
            {book.title}
          </Text>
          {look.style === "pills" ? (
            <>
              <Text style={[styles.sheetLabel, { color: c.sheetMuted }]}>{strings.colour}</Text>
              <View style={styles.swatches}>
                <Pressable
                  onPress={() => void saveBookColor(book.id, null)}
                  accessibilityRole="button"
                  accessibilityLabel={strings.coverColour}
                  accessibilityState={{ selected: chosen === null }}
                  style={[
                    styles.swatch,
                    styles.coverSwatch,
                    { backgroundColor: cover ?? c.pillDefault, borderColor: c.line },
                    chosen === null && [styles.swatchOn, { borderColor: c.accent }],
                  ]}
                >
                  <Text style={[styles.swatchText, { color: textOn(cover ?? c.pillDefault) }]}>{strings.coverShort}</Text>
                </Pressable>
                {PALETTE.map((color) => (
                  <Pressable
                    key={color}
                    onPress={() => void saveBookColor(book.id, color)}
                    accessibilityRole="button"
                    accessibilityLabel={color}
                    accessibilityState={{ selected: chosen === color }}
                    style={[styles.swatch, { backgroundColor: color, borderColor: c.line }, chosen === color && [styles.swatchOn, { borderColor: c.accent }]]}
                  />
                ))}
              </View>
            </>
          ) : (
            <Text style={[styles.sheetHint, { color: c.sheetMuted }]}>{strings.colourNeedsPills}</Text>
          )}
          <Pressable onPress={() => onRemove(book)} accessibilityRole="button" style={styles.sheetRow}>
            <Text style={[styles.removeText, { color: c.danger }]}>{strings.removeBook}</Text>
          </Pressable>
          <Pressable onPress={onClose} accessibilityRole="button" style={styles.sheetRow}>
            <Text style={[styles.sheetDone, { color: c.accent }]}>{strings.done}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function LibraryScreen() {
  const strings = t().library;
  const c = useChrome();
  const router = useRouter();
  const library = useLibrary();
  const [check] = useState(() => launchCheck());
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sheetFor, setSheetFor] = useState<string | null>(null);
  // Imports run one batch at a time, whether picked, shared in, or queued over adb.
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const runImport = useCallback(
    (files: IncomingBook[], source: ImportSource): Promise<ImportSummary[]> => {
      const run = queue.current.then(async () => {
        setBusy(true);
        try {
          const results = await importFiles(files);
          for (const result of results) {
            appendNote(JSON.stringify({ source: "library", phase: source, name: result.name, outcome: result.outcome }));
          }
          return results;
        } finally {
          setBusy(false);
        }
      });
      queue.current = run.catch(() => undefined);
      return run;
    },
    [],
  );

  useEffect(() => {
    if (check) return;
    void loadLibrary().then(() => {
      setReady(true);
      void measureMissingCovers();
    });
  }, [check]);

  // Books another app handed over ("Open with Quire", "Share"): at launch, and while running.
  // One book opens straight away, as a file manager's "Open with" expects. More go to the shelf.
  useEffect(() => {
    if (check) return;
    async function receive() {
      const files = takeIncomingBooks();
      if (files.length === 0) return;
      const results = await runImport(files, "incoming");
      const opened = results.length === 1 ? results[0].outcome : null;
      if (opened && (opened.kind === "added" || opened.kind === "duplicate")) {
        router.push({ pathname: "/reader/[id]", params: { id: opened.facts.id } });
        return;
      }
      const onlyAdded = results.every((result) => result.outcome.kind === "added");
      if (!onlyAdded || results.length > 1) confirm({ title: strings.summaryTitle, body: summarize(results), buttons: [{ text: strings.ok }] });
    }
    void receive();
    const stop = onIncomingBooks(() => void receive());
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void receive();
    });
    return () => {
      stop();
      subscription.remove();
    };
  }, [check, runImport, router, strings]);

  // Debug builds only: books the host queued over adb are imported on launch and on return.
  useEffect(() => {
    if (check || !__DEV__) return;
    function drain() {
      const uris = takePendingImports();
      if (uris.length === 0) return;
      void runImport(
        uris.map((uri) => ({ uri, name: uri.split("/").pop() ?? null })),
        "import",
      );
    }
    drain();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") drain();
    });
    return () => subscription.remove();
  }, [check, runImport]);

  // A launch that names a device check goes to the harness, as M1a did.
  if (check) return <Redirect href="/checks" />;

  async function pick() {
    if (busy) return;
    const picked = await getDocumentAsync({
      type: ["application/epub+zip", "application/octet-stream", "*/*"],
      multiple: true,
      copyToCacheDirectory: false,
    });
    if (picked.canceled || picked.assets.length === 0) return;
    const results = await runImport(
      picked.assets.map((asset) => ({ uri: asset.uri, name: asset.name ?? null })),
      "pick",
    );
    const onlyAdded = results.every((result) => result.outcome.kind === "added");
    if (!onlyAdded || results.length > 1) confirm({ title: strings.summaryTitle, body: summarize(results), buttons: [{ text: strings.ok }] });
  }

  function confirmRemove(book: LibraryBook) {
    setSheetFor(null);
    confirm({
      title: strings.deleteTitle,
      body: strings.deleteBody(book.title),
      buttons: [
        { text: strings.cancel, style: "cancel" },
        { text: strings.deleteConfirm, style: "destructive", onPress: () => void removeFromLibrary(book.id) },
      ],
    });
  }

  const books = sortedBooks(library);
  const look = library.look;
  const editions = editionLabels(books, look);
  const sheetBook = sheetFor ? (books.find((book) => book.id === sheetFor) ?? null) : null;
  return (
    <View style={[styles.screen, { backgroundColor: c.background }]}>
      <Stack.Screen
        options={{
          title: strings.title,
          headerRight: () => (
            <View style={styles.headerButtons}>
              <Pressable onPress={() => router.push("/settings")} accessibilityRole="button" hitSlop={12}>
                <Text style={[styles.importButton, { color: c.accent }]}>{strings.settings}</Text>
              </Pressable>
              <Pressable onPress={pick} disabled={busy} accessibilityRole="button" hitSlop={12}>
                <Text style={[styles.importButton, { color: c.accent }, busy && styles.disabled]}>{busy ? strings.importing : strings.import}</Text>
              </Pressable>
            </View>
          ),
        }}
      />
      {!ready ? (
        <View style={styles.center}>
          <ActivityIndicator color={c.appMuted} />
          <Text style={[styles.hint, { color: c.appInk }]}>{strings.loading}</Text>
        </View>
      ) : books.length === 0 ? (
        <View style={styles.center}>
          <Text style={[styles.welcome, { color: c.appInk }]}>{strings.welcomeTitle}</Text>
          <Text style={[styles.hint, { color: c.appInk }]}>{strings.empty}</Text>
          <Pressable
            onPress={pick}
            disabled={busy}
            accessibilityRole="button"
            style={({ pressed }) => [styles.addButton, { backgroundColor: c.controlOn }, (pressed || busy) && styles.pressed]}
          >
            <Text style={[styles.addButtonText, { color: c.controlOnInk }]}>{strings.addBooks}</Text>
          </Pressable>
          <Text style={[styles.small, { color: c.appInk }]}>{strings.openWithHint}</Text>
        </View>
      ) : (
        <FlatList
          data={books}
          keyExtractor={(book) => book.id}
          contentContainerStyle={look.style === "pills" ? styles.pillList : null}
          renderItem={({ item }) => (
            <BookRow
              book={item}
              look={look}
              edition={editions.get(item.id) ?? null}
              onOpen={() => router.push({ pathname: "/reader/[id]", params: { id: item.id } })}
              onLongPress={() => setSheetFor(item.id)}
            />
          )}
          ListFooterComponent={<Text style={[styles.footer, { color: c.appInk }]}>{strings.removeHint}</Text>}
        />
      )}
      <BookSheet book={sheetBook} look={look} onClose={() => setSheetFor(null)} onRemove={confirmRemove} />
      {busy ? (
        <View style={[styles.busy, { backgroundColor: c.shade }]} pointerEvents="none">
          <ActivityIndicator size="large" color={c.ink} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  hint: { fontSize: 16, textAlign: "center", opacity: 0.7, lineHeight: 22 },
  welcome: { fontSize: 22, fontWeight: "700", textAlign: "center" },
  small: { fontSize: 13, textAlign: "center", opacity: 0.55, lineHeight: 18, maxWidth: 320 },
  addButton: { paddingHorizontal: 28, paddingVertical: 14, borderRadius: 24, marginVertical: 8 },
  addButtonText: { fontSize: 17, fontWeight: "600" },
  footer: { fontSize: 13, textAlign: "center", opacity: 0.5, padding: 20 },
  line: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pillList: { padding: 12, gap: 10 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderRadius: 28,
    minHeight: 56,
  },
  pressed: { opacity: 0.6 },
  cover: { width: 40, height: 60, borderRadius: 6 },
  meta: { flex: 1, justifyContent: "center", gap: 3 },
  title: { fontSize: 17, fontWeight: "600" },
  detail: { fontSize: 13, opacity: 0.7 },
  scrim: { flex: 1, justifyContent: "flex-end" },
  sheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32, gap: 12 },
  sheetTitle: { fontSize: 18, fontWeight: "700" },
  sheetLabel: { fontSize: 13, fontWeight: "600", textTransform: "uppercase", opacity: 0.6 },
  sheetHint: { fontSize: 14, opacity: 0.7 },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 1 },
  coverSwatch: { width: 64, alignItems: "center", justifyContent: "center" },
  swatchText: { fontSize: 12, fontWeight: "600" },
  swatchOn: { borderWidth: 3 },
  sheetRow: { minHeight: 48, justifyContent: "center" },
  removeText: { fontSize: 16, fontWeight: "600" },
  sheetDone: { fontSize: 16, fontWeight: "600" },
  headerButtons: { flexDirection: "row", gap: 8 },
  importButton: { fontSize: 16, fontWeight: "600", paddingHorizontal: 8 },
  disabled: { opacity: 0.5 },
  busy: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center" },
});
