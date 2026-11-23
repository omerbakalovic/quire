package expo.modules.quireloopback

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.provider.OpenableColumns
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
  private val incoming = mutableListOf<Map<String, String?>>()
  private var launchIntentRead = false

  override fun definition() = ModuleDefinition {
    Name("QuireLoopback")

    Events("onIncomingBooks")

    // "Open with" or "Share" while Quire is already running delivers a new intent.
    OnNewIntent { intent ->
      val books = booksIn(intent)
      if (books.isEmpty()) return@OnNewIntent
      synchronized(incoming) { incoming.addAll(books) }
      sendEvent("onIncomingBooks", mapOf("count" to books.size))
    }

    Function("takeIncomingBooks") {
      takeIncomingBooks()
    }

    AsyncFunction("start") {
      startServer()
      mapOf("port" to port, "token" to token)
    }

    AsyncFunction("ensureStarted") {
      ensureStarted()
      mapOf("port" to port, "token" to token)
    }

    Function("isServing") {
      server?.isServing() == true
    }

    AsyncFunction("importBook") { source: String ->
      importBook(source)
    }

    Function("takePendingImports") {
      takePendingImports()
    }

    Function("takeCommands") {
      takeCommands()
    }

    Function("registerBook") { id: String ->
      registerBook(id)
    }

    AsyncFunction("deleteBook") { id: String ->
      store().delete(id)
    }

    AsyncFunction("readLibrary") {
      store().readLibrary()
    }

    AsyncFunction("writeLibrary") { json: String ->
      store().writeLibrary(json)
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

  private fun store(): BookStore = BookStore(context().filesDir)

  /** The reader keeps one server for the process. A dead one is replaced, a live one is kept. */
  @Synchronized
  private fun ensureStarted() {
    val current = server
    if (current != null && current.isServing()) return
    current?.close()
    val context = context()
    staticDir = materialize(context)
    val bytes = ByteArray(16)
    SecureRandom().nextBytes(bytes)
    token = bytes.joinToString("") { "%02x".format(it) }
    val next = LoopbackServer(token, moduleBackend())
    next.start()
    server = next
    port = next.port
  }

  /**
   * Debug seam for the phone matrix: the host writes plain file names, one per
   * line, to files/quire-import, and pushes those books into the external files
   * dir. The list is consumed once. The app imports them as if picked.
   */
  private fun takePendingImports(): List<String> {
    val context = context()
    val list = File(context.filesDir, IMPORT_LIST)
    if (!list.isFile) return emptyList()
    val names = list.readLines().map { it.trim() }.filter { isPlainFileName(it) }
    list.delete()
    return names.mapNotNull { name ->
      listOfNotNull(context.getExternalFilesDir(null)?.let { File(it, name) }, File(context.filesDir, name))
        .firstOrNull { it.isFile }
        ?.let { Uri.fromFile(it).toString() }
    }
  }

  /**
   * Debug seam for scripts/phone-matrix.mjs: the host writes one JSON command per
   * file into files/quire-cmd/, under a temporary name and then renamed to
   * NNNNNN.json, so a half-written file is never read. Each file is consumed
   * once, in name order. Only a debuggable build reads them.
   */
  private fun takeCommands(): List<String> {
    val context = context()
    if (context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE == 0) return emptyList()
    val dir = File(context.filesDir, COMMAND_DIR)
    val files = dir.listFiles { file -> file.isFile && file.name.endsWith(".json") } ?: return emptyList()
    return files.sortedBy { it.name }.take(MAX_COMMANDS).mapNotNull { file ->
      val text = if (file.length() <= MAX_COMMAND_BYTES) file.readText() else null
      file.delete()
      text
    }
  }

  /**
   * EPUBs handed to Quire by another app: the intent that launched the activity
   * (read once) and any that arrived later through OnNewIntent. Each entry is
   * {uri, name}; the library screen imports them as if they were picked.
   */
  private fun takeIncomingBooks(): List<Map<String, String?>> {
    val out = mutableListOf<Map<String, String?>>()
    if (!launchIntentRead) {
      launchIntentRead = true
      val intent = appContext.currentActivity?.intent
      // Reopening from Recents replays the old intent; that book is already in the library.
      if (intent != null && intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY == 0) {
        out.addAll(booksIn(intent))
      }
    }
    synchronized(incoming) {
      out.addAll(incoming)
      incoming.clear()
    }
    return out.distinctBy { it["uri"] }
  }

  private fun booksIn(intent: Intent): List<Map<String, String?>> {
    val uris: List<Uri> = when (intent.action) {
      Intent.ACTION_VIEW -> listOfNotNull(intent.data)
      Intent.ACTION_SEND -> listOfNotNull(streamExtra(intent))
      Intent.ACTION_SEND_MULTIPLE -> streamListExtra(intent)
      else -> emptyList()
    }
    return uris
      .filter { it.scheme == "content" || it.scheme == "file" }
      .map { uri -> mapOf("uri" to uri.toString(), "name" to displayName(uri)) }
  }

  @Suppress("DEPRECATION")
  private fun streamExtra(intent: Intent): Uri? {
    return if (Build.VERSION.SDK_INT >= 33) {
      intent.getParcelableExtra(Intent.EXTRA_STREAM, Uri::class.java)
    } else {
      intent.getParcelableExtra(Intent.EXTRA_STREAM) as? Uri
    }
  }

  @Suppress("DEPRECATION")
  private fun streamListExtra(intent: Intent): List<Uri> {
    val list = if (Build.VERSION.SDK_INT >= 33) {
      intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM, Uri::class.java)
    } else {
      intent.getParcelableArrayListExtra<Uri>(Intent.EXTRA_STREAM)
    }
    return list?.filterNotNull() ?: emptyList()
  }

  private fun displayName(uri: Uri): String? {
    if (uri.scheme == "file") return uri.lastPathSegment
    return try {
      context().contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
        if (cursor.moveToFirst()) cursor.getString(0) else null
      }
    } catch (error: Exception) {
      null
    } ?: uri.lastPathSegment
  }

  private fun debuggable(context: Context): Boolean {
    return context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
  }

  private fun registerBook(id: String): Boolean {
    val file = store().bookFile(id) ?: return false
    if (!file.isFile) return false
    books[id] = file.canonicalFile
    return true
  }

  /** Copy the picked file into app storage while hashing it, then read its package document. */
  private fun importBook(source: String): Map<String, Any?> {
    val context = context()
    val uri = Uri.parse(source)
    val input = when (uri.scheme) {
      "content" -> context.contentResolver.openInputStream(uri)
      "file" -> uri.path?.let { java.io.File(it).inputStream() }
      else -> null
    } ?: throw java.io.IOException("cannot read $source")
    val store = store()
    val stored = input.use { store.importStream(it) }
    val facts = try {
      EpubInspector.inspect(stored.file)
    } catch (error: NotAnEpubException) {
      if (!stored.duplicate) store.delete(stored.id)
      return mapOf("ok" to false, "reason" to "not-epub", "detail" to error.message)
    }
    val coverPath = facts.cover?.let { writeCover(store, stored.id, it) }
    return mapOf(
      "ok" to true,
      "id" to stored.id,
      "hash" to stored.hash,
      "size" to stored.size.toDouble(),
      "duplicate" to stored.duplicate,
      "title" to facts.title,
      "authors" to facts.authors,
      "language" to facts.language,
      "publisher" to facts.publisher,
      "description" to facts.description,
      "series" to facts.series,
      "seriesIndex" to facts.seriesIndex,
      "encryptionXml" to facts.encryptionXml,
      "coverUri" to coverPath,
      "warnings" to facts.warnings,
    )
  }

  /** Library covers are downscaled once, here, so the list never decodes a full-size scan. */
  private fun writeCover(store: BookStore, id: String, cover: EpubCover): String? {
    val bounds = BitmapFactory.Options().apply { inJustDecodeBounds = true }
    BitmapFactory.decodeByteArray(cover.bytes, 0, cover.bytes.size, bounds)
    if (bounds.outWidth <= 0 || bounds.outHeight <= 0) return null
    var sample = 1
    while (bounds.outWidth / (sample * 2) >= COVER_WIDTH && bounds.outHeight / (sample * 2) >= COVER_WIDTH) sample *= 2
    val bitmap = BitmapFactory.decodeByteArray(
      cover.bytes,
      0,
      cover.bytes.size,
      BitmapFactory.Options().apply { inSampleSize = sample },
    ) ?: return null
    val file = store.coverFile(id, "jpg") ?: return null
    store.coversDir.mkdirs()
    file.outputStream().use { bitmap.compress(Bitmap.CompressFormat.JPEG, 85, it) }
    bitmap.recycle()
    return Uri.fromFile(file).toString()
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
    // Debug builds only: a reader page the phone matrix pushed to files/quire-dev/ replaces
    // the APK's copy, so a reader-page change reaches the phone without a rebuild.
    val debuggable = context.applicationInfo.flags and ApplicationInfo.FLAG_DEBUGGABLE != 0
    val dev = File(context.filesDir, DEV_READER_DIR)
    val pushed = debuggable && READER_FILES.all { (_, name) -> File(dev, name).isFile }
    for ((asset, name) in READER_FILES) {
      val source = if (pushed) File(dev, name).inputStream() else context.assets.open(asset)
      source.use { input -> File(dir, name).outputStream().use { output -> input.copyTo(output) } }
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
    if (!debuggable(context())) return null
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

  /** The report is a phone-matrix aid. A release build keeps no log of what was read. */
  private fun appendReport(body: String) {
    if (!debuggable(context())) return
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
    const val COVER_WIDTH = 480
    const val IMPORT_LIST = "quire-import"
    const val COMMAND_DIR = "quire-cmd"
    const val MAX_COMMANDS = 20
    const val MAX_COMMAND_BYTES = 65536L
    const val DEV_READER_DIR = "quire-dev"
    val READER_FILES = listOf("quire-reader/reader.html" to "reader.html", "quire-reader/reader.js" to "reader.js")
  }
}
