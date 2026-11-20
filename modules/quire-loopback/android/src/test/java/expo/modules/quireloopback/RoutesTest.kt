package expo.modules.quireloopback

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class RoutesTest {
  private val token = "a".repeat(32)

  @Test
  fun knownRoutes() {
    assertEquals(Route(RouteKind.READER_HTML), resolveRoute(token, "/$token/reader.html"))
    assertEquals(Route(RouteKind.READER_JS), resolveRoute(token, "/$token/reader.js"))
    assertEquals(Route(RouteKind.REPORT), resolveRoute(token, "/$token/report"))
    assertEquals(Route(RouteKind.BOOK, "pg1184"), resolveRoute(token, "/$token/books/pg1184"))
  }

  @Test
  fun traversalAndUnknownIdsAreNotFound() {
    assertEquals(RouteKind.NOT_FOUND, resolveRoute(token, "/books/../x").kind)
    assertEquals(RouteKind.NOT_FOUND, resolveRoute(token, "/$token/books/../x").kind)
    assertEquals(RouteKind.NOT_FOUND, resolveRoute(token, "/$token/books/%2e%2e/x").kind)
    assertEquals(RouteKind.NOT_FOUND, resolveRoute(token, "/$token/books/..%5cx").kind)
    assertEquals(RouteKind.NOT_FOUND, resolveRoute(token, "/$token/books/a\\b").kind)
    assertEquals(RouteKind.NOT_FOUND, resolveRoute(token, "/$token/books/nope/extra").kind)
    assertEquals(RouteKind.NOT_FOUND, resolveRoute("other", "/$token/books/pg1184").kind)
    assertEquals(RouteKind.NOT_FOUND, resolveRoute(token, "/$token/books/").kind)
  }

  @Test
  fun queryStringDoesNotChangeTheRoute() {
    assertEquals(Route(RouteKind.BOOK, "demo"), resolveRoute(token, "/$token/books/demo?x=1"))
  }

  @Test
  fun bookRouteDoesNotCarryAPath() {
    val route = resolveRoute(token, "/$token/books/%2e%2e%2fsecret")
    assertEquals(RouteKind.NOT_FOUND, route.kind)
    assertNull(route.bookId)
  }
}
