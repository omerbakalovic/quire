package expo.modules.quireloopback

/** Book ids are an allow-list. The request path is never a disk path. */
val BOOK_ID = Regex("^[A-Za-z0-9_-]{1,80}$")

enum class RouteKind {
  READER_HTML,
  READER_JS,
  BOOK,
  REPORT,
  FONT,
  NOT_FOUND,
}

data class Route(val kind: RouteKind, val bookId: String? = null, val fontName: String? = null)

fun isBookId(id: String): Boolean = BOOK_ID.matches(id)

/**
 * Match one token-prefixed path. `..`, backslashes, and a bad percent-escape
 * are not found. Decoding happens only to recognize those names.
 */
fun resolveRoute(token: String, rawTarget: String): Route {
  val path = rawTarget.substringBefore('?').substringBefore('#')
  if (path.contains('\\') || path.contains('\u0000')) return Route(RouteKind.NOT_FOUND)
  val decoded = percentDecode(path) ?: return Route(RouteKind.NOT_FOUND)
  if (decoded.contains('\\') || decoded.contains('\u0000')) return Route(RouteKind.NOT_FOUND)
  if (!decoded.startsWith("/")) return Route(RouteKind.NOT_FOUND)
  val segments = decoded.split('/')
  if (segments.size < 3 || segments[0].isNotEmpty()) return Route(RouteKind.NOT_FOUND)
  if (segments.any { it == ".." || it == "." }) return Route(RouteKind.NOT_FOUND)
  if (segments[1] != token) return Route(RouteKind.NOT_FOUND)
  if (segments.size == 3 && segments[2] == "reader.html") return Route(RouteKind.READER_HTML)
  if (segments.size == 3 && segments[2] == "reader.js") return Route(RouteKind.READER_JS)
  if (segments.size == 3 && segments[2] == "report") return Route(RouteKind.REPORT)
  if (segments.size == 4 && segments[2] == "fonts" && isFontFile(segments[3])) {
    return Route(RouteKind.FONT, fontName = segments[3])
  }
  if (segments.size == 4 && segments[2] == "books" && isBookId(segments[3])) {
    return Route(RouteKind.BOOK, segments[3])
  }
  return Route(RouteKind.NOT_FOUND)
}

fun percentDecode(path: String): String? {
  val out = StringBuilder()
  var index = 0
  while (index < path.length) {
    val char = path[index]
    if (char != '%') {
      out.append(char)
      index += 1
      continue
    }
    if (index + 2 >= path.length) return null
    val value = path.substring(index + 1, index + 3).toIntOrNull(16) ?: return null
    out.append(value.toChar())
    index += 3
  }
  return out.toString()
}
