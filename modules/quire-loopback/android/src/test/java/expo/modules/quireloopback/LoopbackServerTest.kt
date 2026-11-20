package expo.modules.quireloopback

import java.io.File
import java.net.Socket
import java.nio.file.Files
import java.util.Collections
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class LoopbackServerTest {
  private val token = "b".repeat(32)
  private lateinit var root: File
  private lateinit var book: File
  private val asked = Collections.synchronizedList(mutableListOf<String>())
  private lateinit var server: LoopbackServer

  @Before
  fun setUp() {
    root = Files.createTempDirectory("quire-loopback").toFile()
    book = File(root, "book.bin")
    book.writeBytes("abcdefghijklmnopqrstuvwxyz".toByteArray())
    File(root, "reader.html").writeText("<html></html>")
    File(root, "reader.js").writeText("var ok = 1;")
    server = LoopbackServer(
      token,
      object : Backend {
        override fun book(id: String): File? {
          asked += id
          return if (id == "demo") book else null
        }
        override fun staticFile(name: String): File? = File(root, name)
        override fun appendReport(body: String) {
          File(root, "report.txt").appendText(body)
        }
      },
    )
    server.start()
    Thread.sleep(50)
  }

  @After
  fun tearDown() {
    server.close()
    root.deleteRecursively()
  }

  @Test
  fun rangeHeadAndNoCors() {
    val partial = send("GET", "/$token/books/demo", "bytes=0-3")
    assertEquals(206, partial.status)
    assertEquals("abcd", partial.body)
    assertEquals("bytes 0-3/26", partial.header("content-range"))
    assertNull(partial.header("access-control-allow-origin"))
    asked.clear()
    val head = send("HEAD", "/$token/books/demo", null)
    assertEquals(200, head.status)
    assertEquals("", head.body)
    assertEquals("26", head.header("content-length"))
    assertTrue(asked.isEmpty() || asked == listOf("demo"))
  }

  @Test
  fun suffixAndUnsatisfiable() {
    val suffix = send("GET", "/$token/books/demo", "bytes=-3")
    assertEquals(206, suffix.status)
    assertEquals("xyz", suffix.body)
    val huge = send("GET", "/$token/books/demo", "bytes=-100")
    assertEquals(206, huge.status)
    assertEquals("abcdefghijklmnopqrstuvwxyz", huge.body)
    val zero = send("GET", "/$token/books/demo", "bytes=-0")
    assertEquals(416, zero.status)
    val past = send("GET", "/$token/books/demo", "bytes=26-")
    assertEquals(416, past.status)
  }

  @Test
  fun traversalIs404AndDoesNotLookUpAJoinedPath() {
    asked.clear()
    assertTrue(raw("GET /books/../x HTTP/1.1").startsWith("HTTP/1.1 404"))
    assertTrue(raw("GET /$token/books/%2e%2e/x HTTP/1.1").startsWith("HTTP/1.1 404"))
    assertTrue(raw("GET /$token/books/a%5cx HTTP/1.1").startsWith("HTTP/1.1 404"))
    assertTrue(asked.isEmpty())
    val unknown = send("GET", "/$token/books/missing", null)
    assertEquals(404, unknown.status)
    assertEquals(listOf("missing"), asked.toList())
  }

  @Test
  fun aClientThatDropsMidRequestDoesNotStopTheServer() {
    Socket("127.0.0.1", server.port).use { socket ->
      socket.getOutputStream().write("GET /hang".toByteArray())
    }
    val response = send("GET", "/$token/reader.html", null)
    assertEquals(200, response.status)
    assertEquals("<html></html>", response.body)
  }

  private class Reply(val status: Int, val body: String, private val headers: Map<String, String>) {
    fun header(name: String): String? = headers[name.lowercase()]
  }

  private fun raw(requestLine: String): String {
    return exchange("$requestLine\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
      .toString(Charsets.ISO_8859_1)
  }

  private fun send(method: String, path: String, range: String?): Reply {
    val header = buildString {
      append(method).append(' ').append(path).append(" HTTP/1.1\r\n")
      append("Host: 127.0.0.1\r\n")
      if (range != null) append("Range: ").append(range).append("\r\n")
      append("Connection: close\r\n\r\n")
    }
    val raw = exchange(header)
    val end = headerEnd(raw)
    check(end >= 0) { "response had no header terminator" }
    val lines = raw.copyOfRange(0, end).toString(Charsets.ISO_8859_1).split("\r\n")
    val status = lines.first().split(" ").getOrNull(1)?.toIntOrNull() ?: error("bad status line")
    val headers = linkedMapOf<String, String>()
    for (line in lines.drop(1)) {
      val colon = line.indexOf(':')
      if (colon <= 0) continue
      headers[line.substring(0, colon).trim().lowercase()] = line.substring(colon + 1).trim()
    }
    val body = if (method == "HEAD") {
      ""
    } else {
      raw.copyOfRange(end + 4, raw.size).toString(Charsets.ISO_8859_1)
    }
    return Reply(status, body, headers)
  }

  private fun exchange(request: String): ByteArray {
    Socket("127.0.0.1", server.port).use { socket ->
      socket.soTimeout = 2_000
      val out = socket.getOutputStream()
      out.write(request.toByteArray(Charsets.ISO_8859_1))
      out.flush()
      return socket.getInputStream().readBytes()
    }
  }

  private fun headerEnd(raw: ByteArray): Int {
    for (index in 0..raw.size - 4) {
      if (
        raw[index] == 13.toByte() &&
        raw[index + 1] == 10.toByte() &&
        raw[index + 2] == 13.toByte() &&
        raw[index + 3] == 10.toByte()
      ) {
        return index
      }
    }
    return -1
  }
}
