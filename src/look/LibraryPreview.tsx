import { ScrollView, StyleSheet, View } from "react-native";

import { sortedBooks, type Library, type LibraryBook } from "@/domain/library";
import { editionLabels, setBookColor, setCoverColor, type LibraryLook } from "@/domain/library-look";
import { t } from "@/i18n";
import { BookRow } from "@/library/BookRow";
import { ChromeProvider, chromeFor } from "@/reader/chrome";
import { appThemeId } from "@/settings/customization";
import type { Resolved } from "@/settings/registry";
import { shelfOf } from "@/settings/shelf";
import { themeFor } from "@/settings/themes";

type Props = {
  /** The library settings as they would be after the change (the editor's preview values). */
  settings: Resolved;
  library: Library;
};

// Sample colours for the preview's stand-in books, as a cover's average and a picked colour would be.
const SAMPLE_COVER = "#5B6C8F"; // colour-ok: a sample cover colour
const SAMPLE_CHOSEN = "#C98B6B"; // colour-ok: a sample picked colour

function sample(id: string, title: string, author: string, fraction: number | null): LibraryBook {
  return {
    id,
    hash: id,
    size: 0,
    title,
    authors: [author],
    language: null,
    publisher: null,
    series: null,
    seriesIndex: null,
    coverUri: null,
    addedAt: 0,
    lastOpenedAt: null,
    cfi: null,
    fraction,
    sectionIndex: null,
    sectionFraction: null,
  };
}

/**
 * The Library tab's preview (C6): three books drawn with the shelf's own
 * BookRow in the app theme. With books in the library it shows the first
 * three as they are (their covers and colours); without, three stand-ins:
 * one with a cover colour, one with a picked colour, one plain.
 */
export function LibraryPreview({ settings, library }: Props) {
  const strings = t().customize.librarySample;
  const shelf = shelfOf(settings);
  const chrome = chromeFor(themeFor(appThemeId(library.custom), library.custom.themes));
  const real = sortedBooks(library).slice(0, 3);
  let books: LibraryBook[];
  let look: LibraryLook;
  if (real.length > 0) {
    books = real;
    look = library.look;
  } else {
    books = [sample("sample-cover", strings.cover, strings.author, 0.42), sample("sample-chosen", strings.chosen, strings.author, null), sample("sample-plain", strings.plain, strings.author, 1)];
    look = setBookColor(setCoverColor(library.look, "sample-cover", SAMPLE_COVER), "sample-chosen", SAMPLE_CHOSEN);
  }
  const editions = editionLabels(books, look);
  return (
    <ChromeProvider chrome={chrome}>
      <ScrollView
        style={[styles.pane, { backgroundColor: chrome.background }]}
        contentContainerStyle={[shelf.pills ? styles.pills : null, shelf.pills ? { gap: shelf.gap } : null]}
        pointerEvents="none"
      >
        {books.map((book) => (
          <View key={book.id}>
            <BookRow book={book} look={look} shelf={shelf} edition={editions.get(book.id) ?? null} onOpen={() => undefined} onLongPress={() => undefined} />
          </View>
        ))}
      </ScrollView>
    </ChromeProvider>
  );
}

const styles = StyleSheet.create({
  pane: { flex: 1 },
  pills: { padding: 12 },
});
