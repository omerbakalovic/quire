package expo.modules.quireloopback

import org.junit.Assert.assertEquals
import org.junit.Test

class HttpRangeTest {
  @Test
  fun missingHeaderIsTheWholeFile() {
    assertEquals(RangeResult.Full(100), decideRange(null, 100))
    assertEquals(RangeResult.Full(100), decideRange("  ", 100))
  }

  @Test
  fun closedRangeClampsTheEnd() {
    assertEquals(RangeResult.Partial(0, 10, 100), decideRange("bytes=0-10", 100))
    assertEquals(RangeResult.Partial(0, 99, 100), decideRange("bytes=0-999", 100))
  }

  @Test
  fun openEndedAndSuffix() {
    assertEquals(RangeResult.Partial(90, 99, 100), decideRange("bytes=90-", 100))
    assertEquals(RangeResult.Partial(90, 99, 100), decideRange("bytes=-10", 100))
    assertEquals(RangeResult.Partial(0, 99, 100), decideRange("bytes=-1000", 100))
  }

  @Test
  fun zeroSuffixAndPastTheEndAre416() {
    assertEquals(RangeResult.Unsatisfiable(100), decideRange("bytes=-0", 100))
    assertEquals(RangeResult.Unsatisfiable(100), decideRange("bytes=100-", 100))
    assertEquals(RangeResult.Unsatisfiable(100), decideRange("bytes=100-200", 100))
    assertEquals(RangeResult.Unsatisfiable(100), decideRange("bytes=5-1", 100))
  }

  @Test
  fun malformedAndMultipartAre416() {
    assertEquals(RangeResult.Unsatisfiable(100), decideRange("bytes=", 100))
    assertEquals(RangeResult.Unsatisfiable(100), decideRange("bytes=abc", 100))
    assertEquals(RangeResult.Unsatisfiable(100), decideRange("bytes=1-2-3", 100))
    assertEquals(RangeResult.Unsatisfiable(100), decideRange("bytes=0-1,2-3", 100))
    assertEquals(RangeResult.Unsatisfiable(100), decideRange("items=0-1", 100))
  }

  @Test
  fun emptyFileRefusesEveryRange() {
    assertEquals(RangeResult.Full(0), decideRange(null, 0))
    assertEquals(RangeResult.Unsatisfiable(0), decideRange("bytes=0-0", 0))
    assertEquals(RangeResult.Unsatisfiable(0), decideRange("bytes=-1", 0))
  }
}
