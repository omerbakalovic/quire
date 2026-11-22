package expo.modules.quireloopback

import java.io.ByteArrayInputStream
import java.io.File
import java.util.zip.ZipEntry
import java.util.zip.ZipOutputStream
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class EpubInspectorTest {
  @get:Rule val temp = TemporaryFolder()

  private fun fixture(name: String): File {
    // Gradle runs unit tests from the module folder, modules/quire-loopback/android.
    val file = File("../../../test-books/fixtures/$name")
    if (!file.isFile) fail("fixture missing: ${file.absolutePath}")
    return file
  }

  private fun epub(vararg entries: Pair<String, String>): File {
    val file = temp.newFile("book-${System.nanoTime()}.epub")
    ZipOutputStream(file.outputStream()).use { zip ->
      for ((name, text) in entries) {
        zip.putNextEntry(ZipEntry(name))
        zip.write(text.toByteArray())
        zip.closeEntry()
      }
    }
    return file
  }

  private val container = """<?xml version="1.0"?>
    <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
      <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
    </container>"""

  @Test
  fun readsTheNoterefFixture() {
    val facts = EpubInspector.inspect(fixture("noteref.epub"))
    assertEquals("Quire Noteref Fixture", facts.title)
    assertEquals(listOf("Quire"), facts.authors)
    assertNull(facts.encryptionXml)
  }

  @Test
  fun drmFixtureReturnsItsEncryptionXml() {
    val facts = EpubInspector.inspect(fixture("drm.epub"))
    assertNotNull(facts.encryptionXml)
    assertTrue(facts.encryptionXml!!.contains("Algorithm"))
  }

  @Test
  fun malformedFixtureStillInspects() {
    val facts = EpubInspector.inspect(fixture("malformed.epub"))
    assertNull(facts.title)
  }

  @Test
  fun readsMetadataSeriesAndCover() {
    val opf = """<?xml version="1.0"?>
      <package xmlns="http://www.idpf.org/2007/opf" version="3.0">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
          <dc:title>  The   Title </dc:title>
          <dc:creator>A. Author</dc:creator>
          <dc:creator>B. Author</dc:creator>
          <dc:language>de</dc:language>
          <meta property="belongs-to-collection" id="c1">Saga</meta>
          <meta refines="#c1" property="group-position">2</meta>
        </metadata>
        <manifest>
          <item id="img" href="images/c%20over.png" media-type="image/png" properties="cover-image"/>
        </manifest>
      </package>"""
    val file = epub(
      "META-INF/container.xml" to container,
      "OEBPS/content.opf" to opf,
      "OEBPS/images/c over.png" to "PNGBYTES",
    )
    val facts = EpubInspector.inspect(file)
    assertEquals("The Title", facts.title)
    assertEquals(listOf("A. Author", "B. Author"), facts.authors)
    assertEquals("de", facts.language)
    assertEquals("Saga", facts.series)
    assertEquals("2", facts.seriesIndex)
    assertEquals("PNGBYTES", String(facts.cover!!.bytes))
    assertEquals("image/png", facts.cover!!.mediaType)
  }

  @Test
  fun epub2CoverMetaAndCalibreSeries() {
    val opf = """<package xmlns="http://www.idpf.org/2007/opf" version="2.0">
        <metadata xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:opf="http://www.idpf.org/2007/opf">
          <dc:title>Old</dc:title>
          <meta name="cover" content="cov"/>
          <meta name="calibre:series" content="Shelf"/>
          <meta name="calibre:series_index" content="3.0"/>
        </metadata>
        <manifest><item id="cov" href="../cover.jpg" media-type="image/jpeg"/></manifest>
      </package>"""
    val file = epub("META-INF/container.xml" to container, "OEBPS/content.opf" to opf, "cover.jpg" to "JPG")
    val facts = EpubInspector.inspect(file)
    assertEquals("Shelf", facts.series)
    assertEquals("3.0", facts.seriesIndex)
    assertEquals("JPG", String(facts.cover!!.bytes))
  }

  @Test
  fun missingContainerFallsBackToAnyPackageDocument() {
    val opf = """<package><metadata><title>Loose</title></metadata></package>"""
    val facts = EpubInspector.inspect(epub("content.opf" to opf))
    assertEquals("Loose", facts.title)
    assertTrue(facts.warnings.any { it.contains("container") })
  }

  @Test
  fun brokenPackageDocumentGivesEmptyMetadata() {
    val facts = EpubInspector.inspect(epub("META-INF/container.xml" to container, "OEBPS/content.opf" to "<package><metadata>"))
    assertNull(facts.title)
    assertTrue(facts.warnings.contains("package document did not parse"))
  }

  @Test
  fun entityDeclarationsAreNotExpanded() {
    val opf = """<?xml version="1.0"?>
      <!DOCTYPE package [<!ENTITY x SYSTEM "file:///etc/passwd">]>
      <package><metadata><title>Safe &amp; sound</title></metadata></package>"""
    val facts = EpubInspector.inspect(epub("META-INF/container.xml" to container, "OEBPS/content.opf" to opf))
    assertEquals("Safe & sound", facts.title)
  }

  @Test
  fun notAZipIsRefused() {
    val file = temp.newFile("plain.epub")
    file.writeText("hello")
    try {
      EpubInspector.inspect(file)
      fail("expected NotAnEpubException")
    } catch (_: NotAnEpubException) {
    }
  }

  @Test
  fun aZipWithoutAPackageIsRefused() {
    try {
      EpubInspector.inspect(epub("readme.txt" to "x"))
      fail("expected NotAnEpubException")
    } catch (_: NotAnEpubException) {
    }
  }

  @Test
  fun hrefsCannotClimbOut() {
    assertEquals("OEBPS/a/b.png", EpubInspector.resolveHref("OEBPS/content.opf", "a/b.png"))
    assertEquals("b.png", EpubInspector.resolveHref("OEBPS/content.opf", "../b.png"))
    assertNull(EpubInspector.resolveHref("OEBPS/content.opf", "../../b.png"))
    assertNull(EpubInspector.resolveHref("content.opf", "/abs.png"))
    assertNull(EpubInspector.resolveHref("content.opf", "http://x/y.png"))
  }

  @Test
  fun readsAreCappedByInflatedBytes() {
    assertNull(EpubInspector.readCapped(ByteArrayInputStream(ByteArray(11)), 10))
    assertEquals(10, EpubInspector.readCapped(ByteArrayInputStream(ByteArray(10)), 10)!!.size)
  }

  @Test
  fun utf16PackageDocumentsDecode() {
    val bytes = byteArrayOf(0xFF.toByte(), 0xFE.toByte()) + "<a/>".toByteArray(Charsets.UTF_16LE)
    assertEquals("<a/>", EpubInspector.decodeXmlText(bytes))
    assertFalse(EpubInspector.decodeXmlText("﻿<a/>".toByteArray()).startsWith("﻿"))
  }
}
