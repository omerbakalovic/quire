package expo.modules.quireloopback

import android.content.Context
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.security.SecureRandom
import java.util.concurrent.ConcurrentHashMap

class QuireLoopbackModule : Module() {
  private val books = ConcurrentHashMap<String, File>()
  private var server: LoopbackServer? = null
  private var token: String = ""
  private var port: Int = 0
  private var staticDir: File? = null

  override fun definition() = ModuleDefinition {
    Name("QuireLoopback")

    AsyncFunction("start") {
      startServer()
      mapOf("port" to port, "token" to token)
    }

    AsyncFunction("registerIfPresent") { id: String, fileName: String ->
      registerIfPresent(id, fileName)
    }

    Function("bookUrl") { id: String ->
      bookUrl(id)
    }

    Function("readerUrl") {
      readerUrl()
    }

    Function("launchCheck") {
      launchCheck()
    }

    Function("markReady") {
      signal(READY)
    }

    Function("markFirst") {
      signal(FIRST)
    }

    Function("hasGo") {
      signaled(GO)
    }

    Function("hasTurns") {
      signaled(TURNS)
    }

    Function("appendNote") { line: String ->
      appendReport(line)
    }

    OnDestroy {
      server?.close()
      server = null
    }
  }

  private fun context(): Context {
    return appContext.reactContext ?: error("React context is not ready")
  }

  @Synchronized
  private fun startServer() {
    server?.close()
    val context = context()
    books.clear()
    clearSignals(context)
    staticDir = materialize(context)
    val bytes = ByteArray(16)
    SecureRandom().nextBytes(bytes)
    token = bytes.joinToString("") { "%02x".format(it) }
    val next = LoopbackServer(token, moduleBackend())
    next.start()
    server = next
    port = next.port
  }

  private fun moduleBackend(): Backend {
    return object : Backend {
      override fun book(id: String): File? = books[id]
      override fun staticFile(name: String): File? {
        if (name != "reader.html" && name != "reader.js") return null
        return staticDir?.let { File(it, name) }
      }
      override fun appendReport(body: String) {
        this@QuireLoopbackModule.appendReport(body)
      }
    }
  }

  private fun materialize(context: Context): File {
    val dir = File(context.filesDir, "quire-static")
    dir.mkdirs()
    for ((asset, name) in listOf("quire-reader/reader.html" to "reader.html", "quire-reader/reader.js" to "reader.js")) {
      context.assets.open(asset).use { input ->
        File(dir, name).outputStream().use { output -> input.copyTo(output) }
      }
    }
    return dir
  }

  private fun registerIfPresent(id: String, fileName: String): Boolean {
    if (!isBookId(id) || !isPlainFileName(fileName)) return false
    val context = context()
    val candidates = listOfNotNull(
      context.getExternalFilesDir(null)?.let { File(it, fileName) },
      File(context.filesDir, fileName),
    )
    val file = candidates.firstOrNull { it.isFile } ?: return false
    books[id] = file.canonicalFile
    return true
  }

  private fun bookUrl(id: String): String {
    if (!isBookId(id) || port == 0 || token.isEmpty()) error("book URL is not ready")
    return "http://127.0.0.1:$port/$token/books/$id"
  }

  private fun launchCheck(): String? {
    val extra = appContext.currentActivity?.intent?.getStringExtra("quireCheck")
    if (!extra.isNullOrBlank()) return extra
    val file = File(context().filesDir, CHECK)
    if (!file.isFile) return null
    val text = file.readText().trim()
    return text.ifEmpty { null }
  }

  private fun readerUrl(): String {
    if (port == 0 || token.isEmpty()) error("reader URL is not ready")
    return "http://127.0.0.1:$port/$token/reader.html"
  }

  private fun signal(name: String) {
    File(context().filesDir, name).writeText("1")
  }

  private fun signaled(name: String): Boolean = File(context().filesDir, name).isFile

  private fun clearSignals(context: Context) {
    for (name in listOf(READY, GO, FIRST, TURNS, CHECK)) File(context.filesDir, name).delete()
    reportFile(context).writeText("")
  }

  private fun appendReport(body: String) {
    val clean = body.replace("\r", " ").replace("\n", " ").take(256 * 1024)
    val file = reportFile(context())
    synchronized(file) {
      file.appendText(clean + "\n")
    }
  }

  private fun reportFile(context: Context): File = File(context.filesDir, "quire-report.jsonl")

  private fun isPlainFileName(name: String): Boolean {
    return name.isNotEmpty() && !name.contains('/') && !name.contains('\\') && !name.contains("..")
  }

  private companion object {
    const val READY = "quire-ready"
    const val GO = "quire-go"
    const val FIRST = "quire-first"
    const val TURNS = "quire-turns"
    const val CHECK = "quire-check"
  }
}
