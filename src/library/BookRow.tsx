import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import type { LibraryBook } from "@/domain/library";
import { textOn, type LibraryLook } from "@/domain/library-look";
import { t } from "@/i18n";
import { useChrome } from "@/reader/chrome";
import { shelfInk, shelfPillColour, type Shelf } from "@/settings/shelf";

type Props = {
  book: LibraryBook;
  look: LibraryLook;
  shelf: Shelf;
  edition: string | null;
  onOpen: () => void;
  onLongPress: () => void;
};

/**
 * One book on the shelf: a plain line, or a coloured pill (C6 sets its sizes,
 * cover, text and colour). The Library tab's preview draws its sample pills
 * with this same component, so what it shows is what the shelf shows.
 */
export function BookRow({ book, look, shelf, edition, onOpen, onLongPress }: Props) {
  const strings = t().library;
  const percent = book.fraction === null ? null : Math.round(book.fraction * 100);
  const author = book.authors.join(", ") || strings.unknownAuthor;
  const c = useChrome();
  const background = shelf.pills ? shelfPillColour(shelf, look.bookColors[book.id], look.coverColors[book.id], c.pillDefault) : null;
  const inkStyle = { color: background ? shelfInk(shelf, textOn(background)) : c.appInk };
  const details = [
    shelf.showAuthor ? author : null,
    edition,
    shelf.showProgress ? (percent === null ? strings.notStarted : strings.percentRead(percent)) : null,
  ].filter(Boolean);
  return (
    <Pressable
      style={({ pressed }) => [
        shelf.pills
          ? [
              styles.pill,
              {
                paddingHorizontal: shelf.padding.horizontal,
                paddingVertical: shelf.padding.vertical,
                borderRadius: shelf.radius,
                flexDirection: shelf.cover.side === "end" ? "row-reverse" : "row",
              },
            ]
          : [styles.line, { borderBottomColor: c.divider }],
        background ? { backgroundColor: background } : null,
        pressed && styles.pressed,
      ]}
      onPress={onOpen}
      onLongPress={onLongPress}
      accessibilityRole="button"
      accessibilityLabel={`${book.title}, ${author}`}
      accessibilityHint={strings.longPressHint}
    >
      {shelf.pills && shelf.showCovers && book.coverUri ? (
        <Image
          source={{ uri: book.coverUri }}
          style={[styles.cover, { width: shelf.cover.width, height: shelf.cover.height, backgroundColor: c.divider }]}
          resizeMode="cover"
        />
      ) : null}
      <View style={styles.meta}>
        <Text style={[styles.title, inkStyle, { fontSize: shelf.title.size, fontWeight: shelf.title.weight }]} numberOfLines={shelf.title.lines}>
          {book.title}
        </Text>
        {details.length > 0 ? (
          <Text style={[styles.detail, inkStyle, { fontSize: shelf.detailSize }]} numberOfLines={1}>
            {details.join("  ·  ")}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  line: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pill: {
    alignItems: "center",
    gap: 12,
    minHeight: 56,
  },
  pressed: { opacity: 0.6 },
  cover: { borderRadius: 6 },
  meta: { flex: 1, justifyContent: "center", gap: 3 },
  title: {},
  detail: { opacity: 0.7 },
});
