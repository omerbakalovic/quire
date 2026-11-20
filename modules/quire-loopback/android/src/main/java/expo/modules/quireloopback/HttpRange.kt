package expo.modules.quireloopback

/**
 * HTTP Range parsing for one file. A missing header is the whole file.
 * Multipart ranges are refused. Declared here so the socket layer does not
 * invent a second parser.
 */
sealed class RangeResult {
  data class Full(val size: Long) : RangeResult()
  data class Partial(val start: Long, val endInclusive: Long, val size: Long) : RangeResult()
  data class Unsatisfiable(val size: Long) : RangeResult()
}

fun decideRange(header: String?, size: Long): RangeResult {
  if (header == null || header.isBlank()) return RangeResult.Full(size)
  if (size <= 0L) return RangeResult.Unsatisfiable(size)
  val trimmed = header.trim()
  val eq = trimmed.indexOf('=')
  if (eq <= 0) return RangeResult.Unsatisfiable(size)
  val unit = trimmed.substring(0, eq).trim()
  if (!unit.equals("bytes", ignoreCase = true)) return RangeResult.Unsatisfiable(size)
  val spec = trimmed.substring(eq + 1).trim()
  if (spec.isEmpty() || spec.contains(',')) return RangeResult.Unsatisfiable(size)
  if (spec.startsWith("-")) return suffixRange(spec.substring(1), size)
  val dash = spec.indexOf('-')
  if (dash <= 0 || spec.indexOf('-', dash + 1) >= 0) return RangeResult.Unsatisfiable(size)
  val start = spec.substring(0, dash).toLongOrNull() ?: return RangeResult.Unsatisfiable(size)
  if (start < 0L || start >= size) return RangeResult.Unsatisfiable(size)
  val endText = spec.substring(dash + 1)
  val end = if (endText.isEmpty()) {
    size - 1L
  } else {
    val parsed = endText.toLongOrNull() ?: return RangeResult.Unsatisfiable(size)
    minOf(parsed, size - 1L)
  }
  if (end < start) return RangeResult.Unsatisfiable(size)
  return RangeResult.Partial(start, end, size)
}

private fun suffixRange(digits: String, size: Long): RangeResult {
  val length = digits.toLongOrNull() ?: return RangeResult.Unsatisfiable(size)
  if (length <= 0L) return RangeResult.Unsatisfiable(size)
  if (length >= size) return RangeResult.Partial(0L, size - 1L, size)
  return RangeResult.Partial(size - length, size - 1L, size)
}
