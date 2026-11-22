package expo.modules.quireloopback

import java.io.File
import java.io.IOException
import java.io.InputStream
import java.util.zip.ZipEntry
import java.util.zip.ZipFile
import javax.xml.parsers.DocumentBuilderFactory
import org.w3c.dom.Document
import org.w3c.dom.Element

data class EpubCover(val bytes: ByteArray, val mediaType: String)

data class EpubFacts(
  val title: String?,
  val authors: List<String>,
  val language: String?,
  val publisher: String?,
  val description: String?,
  val series: String?,
  val seriesIndex: String?,
  val opfPath: String?,
  val encryptionXml: String?,
  val cover: EpubCover?,
  val warnings: List<String>,
)

class NotAnEpubException(message: String) : IOException(message)

/**
 * Reads the container, the package document, encryption.xml, and the cover
 * from an EPUB on disk. Nothing is extracted to disk. Every read is capped by
 * the bytes actually inflated, not by the size the zip declares, so a forged
 * size cannot make it read more. A broken package document gives empty
 * metadata and a warning, not a failure: the reader can still try the book.
 */
object EpubInspector {
  const val XML_CAP = 4 * 1024 * 1024
  const val COVER_CAP = 12 * 1024 * 1024

  fun inspect(file: File): EpubFacts {
    val zip = try {
      ZipFile(file)
    } catch (error: IOException) {
      throw NotAnEpubException("not a zip: ${error.message}")
    }
    zip.use { archive ->
      val warnings = mutableListOf<String>()
      val names = archive.entries().asSequence().map { it.name }.toList()
      val looksLikeEpub = names.contains("META-INF/container.xml") ||
        names.any { it.endsWith(".opf", ignoreCase = true) }
      if (!looksLikeEpub) throw NotAnEpubException("no container.xml and no package document")

      val encryptionXml = readText(archive, "META-INF/encryption.xml")
      val opfPath = findOpfPath(archive, names, warnings)
      val opfText = opfPath?.let { readText(archive, it) }
      val opf = opfText?.let { parseXml(it) }
      if (opfPath == null) warnings += "no package document"
      else if (opf == null) warnings += "package document did not parse"

      if (opf == null) {
        return EpubFacts(null, emptyList(), null, null, null, null, null, opfPath, encryptionXml, null, warnings)
      }
      val metadata = firstByLocalName(opf.documentElement, "metadata")
      val title = metadata?.let { textOf(firstByLocalName(it, "title")) }
      val authors = metadata?.let { allByLocalName(it, "creator").mapNotNull { node -> textOf(node) } } ?: emptyList()
      val language = metadata?.let { textOf(firstByLocalName(it, "language")) }
      val publisher = metadata?.let { textOf(firstByLocalName(it, "publisher")) }
      val description = metadata?.let { textOf(firstByLocalName(it, "description")) }
      val (series, seriesIndex) = metadata?.let { seriesOf(it) } ?: (null to null)
      val cover = try {
        coverOf(archive, opf, opfPath)
      } catch (error: IOException) {
        warnings += "cover unreadable: ${error.message}"
        null
      }
      return EpubFacts(
        title = title,
        authors = authors.distinct(),
        language = language,
        publisher = publisher,
        description = description?.take(8000),
        series = series,
        seriesIndex = seriesIndex,
        opfPath = opfPath,
        encryptionXml = encryptionXml,
        cover = cover,
        warnings = warnings,
      )
    }
  }

  private fun findOpfPath(archive: ZipFile, names: List<String>, warnings: MutableList<String>): String? {
    val container = readText(archive, "META-INF/container.xml")?.let { parseXml(it) }
    if (container != null) {
      for (rootfile in allByLocalName(container.documentElement, "rootfile")) {
        val path = rootfile.getAttribute("full-path").trim()
        val type = rootfile.getAttribute("media-type").trim()
        if (path.isEmpty()) continue
        if (type.isNotEmpty() && type != "application/oebps-package+xml") continue
        if (archive.getEntry(path) != null) return path
        warnings += "container names a missing package document"
      }
    } else {
      warnings += "container.xml missing or broken"
    }
    return names.firstOrNull { it.endsWith(".opf", ignoreCase = true) && safeEntryName(it) }
  }

  private fun seriesOf(metadata: Element): Pair<String?, String?> {
    val metas = allByLocalName(metadata, "meta")
    val calibre = metas.firstOrNull { it.getAttribute("name") == "calibre:series" }?.getAttribute("content")?.trim()
    val calibreIndex = metas.firstOrNull { it.getAttribute("name") == "calibre:series_index" }?.getAttribute("content")?.trim()
    if (!calibre.isNullOrEmpty()) return calibre to calibreIndex?.ifEmpty { null }
    // EPUB 3 collections. Only collection-type "series" is a series; "set" is a
    // publisher grouping (Standard Ebooks uses it). An untyped collection counts.
    fun refinement(id: String, property: String): String? {
      if (id.isEmpty()) return null
      return metas.firstOrNull { it.getAttribute("refines") == "#$id" && it.getAttribute("property") == property }
        ?.let { textOf(it) }
    }
    val collections = metas.filter { it.getAttribute("property") == "belongs-to-collection" }
    val collection = collections.firstOrNull { refinement(it.getAttribute("id"), "collection-type") == "series" }
      ?: collections.firstOrNull { refinement(it.getAttribute("id"), "collection-type") == null }
      ?: return null to null
    val name = textOf(collection) ?: return null to null
    val position = refinement(collection.getAttribute("id"), "group-position")
    return name to position
  }

  private fun coverOf(archive: ZipFile, opf: Document, opfPath: String): EpubCover? {
    val manifest = firstByLocalName(opf.documentElement, "manifest") ?: return null
    val items = allByLocalName(manifest, "item")
    fun isImage(item: Element) = item.getAttribute("media-type").startsWith("image/")
    val byProperty = items.firstOrNull { item ->
      item.getAttribute("properties").split(Regex("\\s+")).contains("cover-image")
    }
    val metaId = firstByLocalName(opf.documentElement, "metadata")?.let { metadata ->
      allByLocalName(metadata, "meta").firstOrNull { it.getAttribute("name") == "cover" }?.getAttribute("content")
    }
    val byMeta = metaId?.let { id -> items.firstOrNull { it.getAttribute("id") == id && isImage(it) } }
    val byName = items.firstOrNull { isImage(it) && it.getAttribute("id").contains("cover", ignoreCase = true) }
      ?: items.firstOrNull { isImage(it) && it.getAttribute("href").contains("cover", ignoreCase = true) }
    val item = byProperty ?: byMeta ?: byName ?: return null
    val href = item.getAttribute("href").substringBefore('#')
    val path = resolveHref(opfPath, href) ?: return null
    val entry = archive.getEntry(path) ?: return null
    val bytes = readCapped(archive, entry, COVER_CAP) ?: return null
    val type = item.getAttribute("media-type").ifEmpty { "image/jpeg" }
    return EpubCover(bytes, type)
  }

  /** Same rule as src/domain/entry-names.ts: no `..` segment, no absolute path, no backslash. */
  fun safeEntryName(name: String): Boolean {
    if (name.contains('\\') || name.contains('\u0000')) return false
    if (name.startsWith("/") || Regex("^[A-Za-z]:").containsMatchIn(name)) return false
    return name.split('/').none { it == ".." }
  }

  /** Resolve a manifest href against the package document's folder. Returns null when it climbs out. */
  fun resolveHref(opfPath: String, href: String): String? {
    if (href.isEmpty() || href.contains("://") || href.startsWith("/")) return null
    val decoded = percentDecode(href) ?: href
    val base = opfPath.substringBeforeLast('/', "").split('/').filter { it.isNotEmpty() }
    val out = base.toMutableList()
    for (part in decoded.split('/')) {
      when (part) {
        "", "." -> {}
        ".." -> if (out.isEmpty()) return null else out.removeAt(out.size - 1)
        else -> out += part
      }
    }
    return out.joinToString("/")
  }

  private fun readText(archive: ZipFile, name: String): String? {
    val entry = archive.getEntry(name) ?: return null
    val bytes = readCapped(archive, entry, XML_CAP) ?: return null
    return decodeXmlText(bytes)
  }

  /** Strip a byte order mark. UTF-16 package documents exist in the wild. */
  fun decodeXmlText(bytes: ByteArray): String {
    if (bytes.size >= 2 && bytes[0] == 0xFE.toByte() && bytes[1] == 0xFF.toByte()) {
      return String(bytes, 2, bytes.size - 2, Charsets.UTF_16BE)
    }
    if (bytes.size >= 2 && bytes[0] == 0xFF.toByte() && bytes[1] == 0xFE.toByte()) {
      return String(bytes, 2, bytes.size - 2, Charsets.UTF_16LE)
    }
    val text = String(bytes, Charsets.UTF_8)
    return text.removePrefix("﻿")
  }

  /** Inflate at most cap bytes. More than that is refused, whatever the zip declares. */
  fun readCapped(archive: ZipFile, entry: ZipEntry, cap: Int): ByteArray? {
    archive.getInputStream(entry).use { input -> return readCapped(input, cap) }
  }

  fun readCapped(input: InputStream, cap: Int): ByteArray? {
    val buffer = java.io.ByteArrayOutputStream()
    val chunk = ByteArray(64 * 1024)
    var total = 0
    while (true) {
      val n = input.read(chunk)
      if (n < 0) break
      total += n
      if (total > cap) return null
      buffer.write(chunk, 0, n)
    }
    return buffer.toByteArray()
  }

  /** No DTDs, no external entities. A package document never needs them. */
  fun parseXml(text: String): Document? {
    val factory = DocumentBuilderFactory.newInstance()
    factory.isNamespaceAware = true
    factory.isExpandEntityReferences = false
    factory.isValidating = false
    for ((feature, value) in listOf(
      "http://xml.org/sax/features/external-general-entities" to false,
      "http://xml.org/sax/features/external-parameter-entities" to false,
      "http://apache.org/xml/features/nonvalidating/load-external-dtd" to false,
    )) {
      try {
        factory.setFeature(feature, value)
      } catch (_: Exception) {
      }
    }
    // A doctype in a package document is rare. Drop it rather than resolve it.
    val clean = text.replace(Regex("<!DOCTYPE[^>\\[]*(\\[[^\\]]*\\])?\\s*>", RegexOption.IGNORE_CASE), "")
    return try {
      factory.newDocumentBuilder().parse(org.xml.sax.InputSource(java.io.StringReader(clean)))
    } catch (_: Exception) {
      null
    }
  }

  private fun allByLocalName(root: Element, name: String): List<Element> {
    val list = root.getElementsByTagNameNS("*", name)
    val out = ArrayList<Element>(list.length)
    for (index in 0 until list.length) out += list.item(index) as Element
    if (out.isEmpty()) {
      // A namespace-less or oddly prefixed document. Match the local part of the tag.
      val all = root.getElementsByTagName("*")
      for (index in 0 until all.length) {
        val element = all.item(index) as Element
        val tag = element.localName ?: element.tagName.substringAfter(':')
        if (tag == name) out += element
      }
    }
    return out
  }

  private fun firstByLocalName(root: Element, name: String): Element? = allByLocalName(root, name).firstOrNull()

  private fun textOf(element: Element?): String? {
    val text = element?.textContent?.replace(Regex("\\s+"), " ")?.trim()
    return if (text.isNullOrEmpty()) null else text
  }
}
