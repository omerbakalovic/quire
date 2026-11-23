package expo.modules.quireloopback

import java.io.ByteArrayInputStream
import java.nio.file.Files
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class FontFilesTest {
  @Test
  fun namesAreAnAllowList() {
    assertTrue(isFontFile("literata-latin-400-normal.woff2"))
    assertTrue(isFontFile("user-ab12.ttf"))
    assertFalse(isFontFile("../x.woff2"))
    assertFalse(isFontFile("Literata.woff2"))
    assertFalse(isFontFile("x.svg"))
  }

  @Test
  fun signaturesDecideTheKind() {
    assertEquals("ttf", fontKind(byteArrayOf(0, 1, 0, 0, 9)))
    assertEquals("otf", fontKind("OTTOxx".toByteArray()))
    assertEquals("woff2", fontKind("wOF2".toByteArray()))
    assertNull(fontKind("ttcf".toByteArray()))
    assertNull(fontKind("PK\u0003\u0004".toByteArray()))
  }

  @Test
  fun storesUnderTheIdWithTheRealExtension() {
    val dir = Files.createTempDirectory("fonts").toFile()
    val result = storeFont(dir, "user-ab12", ByteArrayInputStream("OTTO".toByteArray() + ByteArray(100)))
    assertEquals(FontImport.Stored("user-ab12.otf"), result)
    assertTrue(dir.resolve("user-ab12.otf").isFile)
    assertFalse(dir.resolve("user-ab12.partial").exists())
  }

  @Test
  fun refusesNonFontsAndLeavesNothing() {
    val dir = Files.createTempDirectory("fonts").toFile()
    assertEquals(FontImport.Refused("not-font"), storeFont(dir, "user-ab12", ByteArrayInputStream("<html>".toByteArray())))
    assertEquals(FontImport.Refused("bad-id"), storeFont(dir, "../x", ByteArrayInputStream(ByteArray(4))))
    assertEquals(0, dir.listFiles()!!.size)
  }
}
