package expo.modules.quireloopback

import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import java.io.OutputStream
import java.io.RandomAccessFile
import java.net.InetSocketAddress
import java.net.ServerSocket
import java.net.Socket
import java.net.SocketTimeoutException
import java.util.concurrent.Executors
import java.util.concurrent.Semaphore

interface Backend {
  fun book(id: String): File?
  fun staticFile(name: String): File?
  /** A bundled or imported font by its served name, or null. */
  fun font(name: String): File? = null
  fun appendReport(body: String)
}

/**
 * Loopback HTTP for the reader page and registered books.
 * Book bytes are streamed from the file. They are not copied into a byte array.
 */
class LoopbackServer(
  private val token: String,
  private val backend: Backend,
  private val poolSize: Int = 4,
  private val maxConnections: Int = 8,
  private val soTimeoutMs: Int = 5_000,
  private val headerCap: Int = 8 * 1024,
  private val reportCap: Int = 256 * 1024,
) {
  private val serverSocket = ServerSocket()
  private val pool = Executors.newFixedThreadPool(poolSize)
  private val permits = Semaphore(maxConnections)
  @Volatile private var running = false

  val port: Int
    get() = serverSocket.localPort

  fun start() {
    if (running) return
    serverSocket.reuseAddress = true
    serverSocket.bind(InetSocketAddress("127.0.0.1", 0))
    serverSocket.soTimeout = 500
    running = true
    Thread(this::acceptLoop, "quire-accept").apply { isDaemon = true }.start()
  }

  fun isServing(): Boolean = running && !serverSocket.isClosed

  fun close() {
    running = false
    try {
      serverSocket.close()
    } catch (_: IOException) {
    }
    pool.shutdownNow()
  }

  private fun acceptLoop() {
    while (running && !serverSocket.isClosed) {
      val client = try {
        serverSocket.accept()
      } catch (_: SocketTimeoutException) {
        continue
      } catch (_: IOException) {
        break
      }
      if (!permits.tryAcquire()) {
        try {
          client.close()
        } catch (_: IOException) {
        }
        continue
      }
      pool.execute {
        try {
          client.soTimeout = soTimeoutMs
          handle(client)
        } catch (_: IOException) {
        } finally {
          try {
            client.close()
          } catch (_: IOException) {
          }
          permits.release()
        }
      }
    }
  }

  private fun handle(client: Socket) {
    val input = client.getInputStream()
    val output = client.getOutputStream()
    val headerText = readHeaders(input) ?: run {
      writeStatus(output, 400, "Bad Request", emptyList())
      return
    }
    val lines = headerText.split("\r\n")
    val request = lines.firstOrNull()?.split(" ") ?: return
    if (request.size < 2) {
      writeStatus(output, 400, "Bad Request", emptyList())
      return
    }
    val method = request[0]
    val route = resolveRoute(token, request[1])
    val headers = parseHeaders(lines.drop(1))
    when (route.kind) {
      RouteKind.NOT_FOUND -> writeStatus(output, 404, "Not Found", emptyList())
      RouteKind.REPORT -> handleReport(method, headers, input, output)
      RouteKind.READER_HTML -> serveNamed(method, "reader.html", HTML, headers, output)
      RouteKind.READER_JS -> serveNamed(method, "reader.js", JS, headers, output)
      RouteKind.BOOK -> serveBook(method, route.bookId, headers, output)
      RouteKind.FONT -> serveFont(method, route.fontName, headers, output)
    }
  }

  private fun handleReport(method: String, headers: Map<String, String>, input: InputStream, output: OutputStream) {
    if (method != "POST") {
      writeStatus(output, 404, "Not Found", emptyList())
      return
    }
    val length = headers["content-length"]?.toIntOrNull()
    if (length == null || length < 0) {
      writeStatus(output, 400, "Bad Request", emptyList())
      return
    }
    if (length > reportCap) {
      writeStatus(output, 413, "Payload Too Large", emptyList())
      return
    }
    val body = ByteArray(length)
    var read = 0
    while (read < length) {
      val n = input.read(body, read, length - read)
      if (n < 0) throw IOException("report ended early")
      read += n
    }
    backend.appendReport(body.toString(Charsets.UTF_8))
    writeStatus(output, 204, "No Content", listOf("Content-Length" to "0"))
  }

  private fun serveNamed(
    method: String,
    name: String,
    contentType: String,
    headers: Map<String, String>,
    output: OutputStream,
  ) {
    if (method != "GET" && method != "HEAD") {
      writeStatus(output, 404, "Not Found", emptyList())
      return
    }
    val file = backend.staticFile(name)
    if (file == null || !file.isFile) {
      writeStatus(output, 404, "Not Found", emptyList())
      return
    }
    serve(file, contentType, headers["range"], method == "HEAD", output)
  }

  private fun serveFont(method: String, name: String?, headers: Map<String, String>, output: OutputStream) {
    if (method != "GET" && method != "HEAD" || name == null) {
      writeStatus(output, 404, "Not Found", emptyList())
      return
    }
    val file = backend.font(name)
    if (file == null || !file.isFile) {
      writeStatus(output, 404, "Not Found", emptyList())
      return
    }
    serve(file, fontContentType(name), headers["range"], method == "HEAD", output)
  }

  private fun serveBook(method: String, bookId: String?, headers: Map<String, String>, output: OutputStream) {
    if (method != "GET" && method != "HEAD" || bookId == null) {
      writeStatus(output, 404, "Not Found", emptyList())
      return
    }
    val file = backend.book(bookId)
    if (file == null || !file.isFile) {
      writeStatus(output, 404, "Not Found", emptyList())
      return
    }
    serve(file, EPUB, headers["range"], method == "HEAD", output)
  }

  private fun serve(file: File, contentType: String, rangeHeader: String?, head: Boolean, output: OutputStream) {
    val size = file.length()
    when (val range = decideRange(rangeHeader, size)) {
      is RangeResult.Unsatisfiable -> {
        writeStatus(
          output,
          416,
          "Range Not Satisfiable",
          listOf(
            "Content-Range" to "bytes */$size",
            "Content-Length" to "0",
            "Accept-Ranges" to "bytes",
            "Cache-Control" to "no-store",
          ),
        )
      }
      is RangeResult.Full -> {
        writeBody(output, file, 200, "OK", contentType, 0L, size, size, partial = false, head = head)
      }
      is RangeResult.Partial -> {
        val length = range.endInclusive - range.start + 1L
        writeBody(output, file, 206, "Partial Content", contentType, range.start, length, size, partial = true, head = head)
      }
    }
  }

  private fun writeBody(
    output: OutputStream,
    file: File,
    status: Int,
    reason: String,
    contentType: String,
    start: Long,
    length: Long,
    size: Long,
    partial: Boolean,
    head: Boolean,
  ) {
    val fields = mutableListOf(
      "Content-Type" to contentType,
      "Content-Length" to length.toString(),
      "Accept-Ranges" to "bytes",
      "Cache-Control" to "no-store",
    )
    if (partial) fields += "Content-Range" to "bytes $start-${start + length - 1}/$size"
    writeStatus(output, status, reason, fields)
    if (head || length == 0L) return
    RandomAccessFile(file, "r").use { raf ->
      raf.seek(start)
      val buffer = ByteArray(64 * 1024)
      var remaining = length
      while (remaining > 0L) {
        val n = raf.read(buffer, 0, minOf(buffer.size.toLong(), remaining).toInt())
        if (n < 0) break
        output.write(buffer, 0, n)
        remaining -= n
      }
    }
    output.flush()
  }

  private fun writeStatus(output: OutputStream, status: Int, reason: String, fields: List<Pair<String, String>>) {
    val text = buildString {
      append("HTTP/1.1 ").append(status).append(' ').append(reason).append("\r\n")
      for ((name, value) in fields) {
        append(name).append(": ").append(value).append("\r\n")
      }
      append("Connection: close\r\n\r\n")
    }
    output.write(text.toByteArray(Charsets.ISO_8859_1))
    output.flush()
  }

  private fun readHeaders(input: InputStream): String? {
    val buf = ByteArrayOutputStream()
    while (buf.size() < headerCap) {
      val byte = input.read()
      if (byte < 0) return null
      buf.write(byte)
      val size = buf.size()
      if (size >= 4) {
        val raw = buf.toByteArray()
        if (raw[size - 4] == CR && raw[size - 3] == LF && raw[size - 2] == CR && raw[size - 1] == LF) {
          return raw.toString(Charsets.ISO_8859_1)
        }
      }
    }
    return null
  }

  private fun parseHeaders(lines: List<String>): Map<String, String> {
    val headers = linkedMapOf<String, String>()
    for (line in lines) {
      if (line.isEmpty()) continue
      val colon = line.indexOf(':')
      if (colon <= 0) continue
      headers[line.substring(0, colon).trim().lowercase()] = line.substring(colon + 1).trim()
    }
    return headers
  }

  private companion object {
    const val HTML = "text/html; charset=utf-8"
    const val JS = "text/javascript; charset=utf-8"
    const val EPUB = "application/epub+zip"
    const val CR = 13.toByte()
    const val LF = 10.toByte()
  }
}
