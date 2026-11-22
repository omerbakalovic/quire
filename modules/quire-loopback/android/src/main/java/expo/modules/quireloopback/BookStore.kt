package expo.modules.quireloopback

import java.io.File
import java.io.IOException
import java.io.InputStream
import java.security.MessageDigest

data class StoredBook(val id: String, val hash: String, val size: Long, val duplicate: Boolean, val file: File)

/**
 * Imported books live in `filesDir/books/{id}.epub`. The id is the first 32
 * hex digits of the file's SHA-256, so the same bytes always get the same id
 * and a second import of them is a duplicate, not a second copy.
 * The library index is one JSON file, replaced by rename so a crash never
 * leaves half of it. SQLite replaces it when saved positions arrive.
 */
class BookStore(private val root: File) {
  val booksDir: File = File(root, "books")
  val coversDir: File = File(root, "covers")
  private val libraryFile = File(root, "library.json")

  fun bookFile(id: String): File? {
    if (!isBookId(id)) return null
    return File(booksDir, "$id.epub")
  }

  fun coverFile(id: String, extension: String): File? {
    if (!isBookId(id)) return null
    return File(coversDir, "$id.$extension")
  }

  /** Copies the stream while hashing it. Refuses more than maxBytes. */
  fun importStream(input: InputStream, maxBytes: Long = MAX_BOOK_BYTES): StoredBook {
    booksDir.mkdirs()
    val temporary = File.createTempFile("import-", ".part", booksDir)
    val digest = MessageDigest.getInstance("SHA-256")
    var size = 0L
    try {
      temporary.outputStream().use { output ->
        val buffer = ByteArray(128 * 1024)
        while (true) {
          val n = input.read(buffer)
          if (n < 0) break
          size += n
          if (size > maxBytes) throw IOException("book is larger than ${maxBytes / (1024 * 1024)} MB")
          digest.update(buffer, 0, n)
          output.write(buffer, 0, n)
        }
      }
      if (size == 0L) throw IOException("file is empty")
      val hash = digest.digest().joinToString("") { "%02x".format(it) }
      val id = hash.substring(0, 32)
      val target = File(booksDir, "$id.epub")
      if (target.isFile && target.length() == size) {
        temporary.delete()
        return StoredBook(id, hash, size, true, target)
      }
      if (!temporary.renameTo(target)) throw IOException("could not move the book into place")
      return StoredBook(id, hash, size, false, target)
    } finally {
      if (temporary.exists()) temporary.delete()
    }
  }

  fun delete(id: String): Boolean {
    if (!isBookId(id)) return false
    var removed = bookFile(id)?.delete() ?: false
    coversDir.listFiles()?.forEach { file ->
      if (file.name.startsWith("$id.")) removed = file.delete() || removed
    }
    return removed
  }

  fun readLibrary(): String? = if (libraryFile.isFile) libraryFile.readText() else null

  @Synchronized
  fun writeLibrary(json: String) {
    if (json.length > MAX_LIBRARY_CHARS) throw IOException("library index is too large")
    root.mkdirs()
    val temporary = File(root, "library.json.part")
    temporary.writeText(json)
    if (!temporary.renameTo(libraryFile)) {
      libraryFile.delete()
      if (!temporary.renameTo(libraryFile)) throw IOException("could not replace the library index")
    }
  }

  companion object {
    const val MAX_BOOK_BYTES = 1024L * 1024 * 1024
    const val MAX_LIBRARY_CHARS = 16 * 1024 * 1024
  }
}
