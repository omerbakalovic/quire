package expo.modules.quireloopback

import java.io.ByteArrayInputStream
import java.io.IOException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class BookStoreTest {
  @get:Rule val temp = TemporaryFolder()

  @Test
  fun sameBytesAreOneBook() {
    val store = BookStore(temp.root)
    val first = store.importStream(ByteArrayInputStream("abc".toByteArray()))
    val second = store.importStream(ByteArrayInputStream("abc".toByteArray()))
    assertFalse(first.duplicate)
    assertTrue(second.duplicate)
    assertEquals(first.id, second.id)
    assertEquals(32, first.id.length)
    assertEquals("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad", first.hash)
    assertEquals(1, store.booksDir.listFiles()!!.size)
  }

  @Test
  fun oversizedImportLeavesNothingBehind() {
    val store = BookStore(temp.root)
    try {
      store.importStream(ByteArrayInputStream(ByteArray(2048)), maxBytes = 1024)
      fail("expected IOException")
    } catch (_: IOException) {
    }
    assertEquals(0, store.booksDir.listFiles()!!.size)
  }

  @Test
  fun emptyFileIsRefused() {
    val store = BookStore(temp.root)
    try {
      store.importStream(ByteArrayInputStream(ByteArray(0)))
      fail("expected IOException")
    } catch (_: IOException) {
    }
  }

  @Test
  fun badIdsNeverNameAFile() {
    val store = BookStore(temp.root)
    assertNull(store.bookFile("../x"))
    assertNull(store.coverFile("a/b", "jpg"))
    assertFalse(store.delete("../../etc"))
  }

  @Test
  fun libraryIsReplacedWhole() {
    val store = BookStore(temp.root)
    assertNull(store.readLibrary())
    store.writeLibrary("{\"a\":1}")
    store.writeLibrary("{\"b\":2}")
    assertEquals("{\"b\":2}", store.readLibrary())
  }

  @Test
  fun deleteRemovesBookAndCover() {
    val store = BookStore(temp.root)
    val book = store.importStream(ByteArrayInputStream("xyz".toByteArray()))
    store.coversDir.mkdirs()
    store.coverFile(book.id, "jpg")!!.writeText("c")
    assertTrue(store.delete(book.id))
    assertFalse(book.file.exists())
    assertEquals(0, store.coversDir.listFiles()!!.size)
  }
}
