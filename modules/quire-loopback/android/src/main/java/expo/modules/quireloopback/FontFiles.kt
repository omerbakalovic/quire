package expo.modules.quireloopback

import java.io.File
import java.io.IOException
import java.io.InputStream

/** Served font names. Bundled ones are lowercase with dashes; imported ones are user-<id>.<ext>. */
val FONT_FILE = Regex("^[a-z0-9-]{1,80}\\.(woff2|woff|ttf|otf)$")
val USER_FONT_ID = Regex("^user-[a-z0-9]{4,24}$")
const val MAX_FONT_BYTES = 8L * 1024 * 1024

fun isFontFile(name: String): Boolean = FONT_FILE.matches(name)

fun fontContentType(name: String): String = when (name.substringAfterLast('.')) {
  "woff2" -> "font/woff2"
  "woff" -> "font/woff"
  "ttf" -> "font/ttf"
  "otf" -> "font/otf"
  else -> "application/octet-stream"
}

/** TrueType, OpenType (CFF), Apple 'true', WOFF and WOFF2 signatures. A collection (ttcf) is refused. */
fun fontKind(header: ByteArray): String? {
  if (header.size < 4) return null
  val tag = header.copyOfRange(0, 4)
  return when {
    tag.contentEquals(byteArrayOf(0, 1, 0, 0)) -> "ttf"
    tag.contentEquals("true".toByteArray()) -> "ttf"
    tag.contentEquals("OTTO".toByteArray()) -> "otf"
    tag.contentEquals("wOFF".toByteArray()) -> "woff"
    tag.contentEquals("wOF2".toByteArray()) -> "woff2"
    else -> null
  }
}

sealed class FontImport {
  data class Stored(val file: String) : FontImport()
  data class Refused(val reason: String) : FontImport()
}

/**
 * Copy an imported font into `dir` as <id>.<ext>, where the extension comes
 * from the file's own signature, not its name. Too large or not a font: refused,
 * and nothing is left behind.
 */
fun storeFont(dir: File, id: String, input: InputStream): FontImport {
  if (!USER_FONT_ID.matches(id)) return FontImport.Refused("bad-id")
  dir.mkdirs()
  val partial = File(dir, "$id.partial")
  try {
    var kind: String? = null
    var total = 0L
    partial.outputStream().use { output ->
      val buffer = ByteArray(64 * 1024)
      while (true) {
        val n = input.read(buffer)
        if (n < 0) break
        if (total == 0L) {
          kind = fontKind(buffer.copyOfRange(0, n)) ?: return FontImport.Refused("not-font")
        }
        total += n
        if (total > MAX_FONT_BYTES) return FontImport.Refused("too-large")
        output.write(buffer, 0, n)
      }
    }
    val ext = kind ?: return FontImport.Refused("not-font")
    val target = File(dir, "$id.$ext")
    if (!partial.renameTo(target)) throw IOException("could not store font")
    return FontImport.Stored(target.name)
  } finally {
    partial.delete()
  }
}
