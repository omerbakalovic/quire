import { getDocumentAsync } from "expo-document-picker";
import { Redirect, Stack, useRouter } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, Alert, AppState, FlatList, Image, Pressable, StyleSheet, Text, View } from "react-native";

import { sortedBooks, type LibraryBook } from "@/domain/library";
import { t } from "@/i18n";
import { importFiles, loadLibrary, removeFromLibrary, useLibrary, type ImportSummary } from "@/library/store";
import { appendNote, launchCheck, takePendingImports } from "@/renderer/book-url";

const COVER_COLORS = ["#5B6C8F", "#8F5B6C", "#6C8F5B", "#8F7A5B", "#5B8F88", "#7A5B8F"];

function fallbackColor(id: string): string {
  let sum = 0;
  for (const char of id) sum = (sum * 31 + char.charCodeAt(0)) >>> 0;
  return COVER_COLORS[sum % COVER_COLORS.length];
}

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

function BookRow({ book, onOpen, onRemove }: { book: LibraryBook; onOpen: () => void; onRemove: () => void }) {
  const strings = t().library;
  const percent = book.fraction === null ? null : Math.round(book.fraction * 100);
  return (
    <Pressable
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
      onPress={onOpen}
      onLongPress={onRemove}
      accessibilityRole="button"
      accessibilityLabel={`${book.title}, ${book.authors.join(", ") || strings.unknownAuthor}`}
    >
      {book.coverUri ? (
        <Image source={{ uri: book.coverUri }} style={styles.cover} resizeMode="cover" />
      ) : (
        <View style={[styles.cover, styles.fallback, { backgroundColor: fallbackColor(book.id) }]}>
          <Text style={styles.fallbackText} numberOfLines={4}>
            {book.title}
          </Text>
        </View>
      )}
      <View style={styles.meta}>
        <Text style={styles.title} numberOfLines={2}>
          {book.title}
        </Text>
        <Text style={styles.author} numberOfLines={1}>
          {book.authors.join(", ") || strings.unknownAuthor}
        </Text>
        <Text style={styles.progress}>{percent === null ? strings.notStarted : strings.percentRead(percent)}</Text>
      </View>
    </Pressable>
  );
}

export default function LibraryScreen() {
  const strings = t().library;
  const router = useRouter();
  const library = useLibrary();
  const [check] = useState(() => launchCheck());
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (check) return;
    void loadLibrary().then(() => setReady(true));
  }, [check]);

  // Debug builds only: books the host queued over adb are imported on launch and on return.
  useEffect(() => {
    if (check || !__DEV__) return;
    async function drain() {
      const uris = takePendingImports();
      if (uris.length === 0) return;
      setBusy(true);
      try {
        const results = await importFiles(uris.map((uri) => ({ uri, name: uri.split("/").pop() ?? null })));
        for (const result of results) {
          appendNote(JSON.stringify({ source: "library", phase: "import", name: result.name, outcome: result.outcome }));
        }
      } finally {
        setBusy(false);
      }
    }
    void drain();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void drain();
    });
    return () => subscription.remove();
  }, [check]);

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
    setBusy(true);
    try {
      const results = await importFiles(picked.assets.map((asset) => ({ uri: asset.uri, name: asset.name ?? null })));
      for (const result of results) {
        appendNote(JSON.stringify({ source: "library", phase: "pick", name: result.name, outcome: result.outcome }));
      }
      const onlyAdded = results.every((result) => result.outcome.kind === "added");
      if (!onlyAdded || results.length > 1) Alert.alert(strings.summaryTitle, summarize(results));
    } finally {
      setBusy(false);
    }
  }

  function confirmRemove(book: LibraryBook) {
    Alert.alert(strings.deleteTitle, strings.deleteBody(book.title), [
      { text: strings.cancel, style: "cancel" },
      { text: strings.deleteConfirm, style: "destructive", onPress: () => void removeFromLibrary(book.id) },
    ]);
  }

  const books = sortedBooks(library);
  return (
    <View style={styles.screen}>
      <Stack.Screen
        options={{
          title: strings.title,
          headerRight: () => (
            <View style={styles.headerButtons}>
              <Pressable onPress={() => router.push("/settings")} accessibilityRole="button" hitSlop={12}>
                <Text style={styles.importButton}>{strings.settings}</Text>
              </Pressable>
              <Pressable onPress={pick} disabled={busy} accessibilityRole="button" hitSlop={12}>
                <Text style={[styles.importButton, busy && styles.disabled]}>{busy ? strings.importing : strings.import}</Text>
              </Pressable>
            </View>
          ),
        }}
      />
      {!ready ? (
        <View style={styles.center}>
          <ActivityIndicator />
          <Text style={styles.hint}>{strings.loading}</Text>
        </View>
      ) : books.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.hint}>{strings.empty}</Text>
        </View>
      ) : (
        <FlatList
          data={books}
          keyExtractor={(book) => book.id}
          renderItem={({ item }) => (
            <BookRow
              book={item}
              onOpen={() => router.push({ pathname: "/reader/[id]", params: { id: item.id } })}
              onRemove={() => confirmRemove(item)}
            />
          )}
        />
      )}
      {busy ? (
        <View style={styles.busy} pointerEvents="none">
          <ActivityIndicator size="large" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  hint: { fontSize: 16, textAlign: "center", opacity: 0.7 },
  row: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, gap: 14, minHeight: 116 },
  pressed: { opacity: 0.6 },
  cover: { width: 64, height: 96, borderRadius: 4, backgroundColor: "#ddd" },
  fallback: { padding: 6, justifyContent: "center" },
  fallbackText: { color: "#fff", fontSize: 10, fontWeight: "600" },
  meta: { flex: 1, justifyContent: "center", gap: 4 },
  title: { fontSize: 17, fontWeight: "600" },
  author: { fontSize: 14, opacity: 0.75 },
  progress: { fontSize: 13, opacity: 0.6 },
  headerButtons: { flexDirection: "row", gap: 8 },
  importButton: { fontSize: 16, fontWeight: "600", color: "#208AEF", paddingHorizontal: 8 },
  disabled: { opacity: 0.5 },
  busy: { ...StyleSheet.absoluteFill, alignItems: "center", justifyContent: "center", backgroundColor: "#0003" },
});
