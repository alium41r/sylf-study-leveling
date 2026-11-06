package expo.modules.sylfnativeplatform

import kotlin.math.abs
import kotlin.math.hypot
import kotlin.math.max

/**
 * A stroke's geometry before its outline, ported from the web's `lib/notes/ink-geometry.ts` (`inkGeometry` and `inkSegments`), so the
 * live stroke is straightened and cut into dashes exactly as the finished one will be: a nearly straight stroke becomes a line, and a
 * dashed or dotted stroke is split by distance along it, every sample field interpolated at each cut. Samples are sylf-ink/1's, eight
 * floats each.
 */
internal object InkGeometry {
  private const val STRIDE = 8
  private const val MAX_SEGMENTS = 12000

  /** The two ends of a nearly straight stroke, as `inkGeometry` makes them for a straightening brush, or null when it bends. */
  fun straightened(samples: FloatArray, count: Int): FloatArray? {
    val n = count / STRIDE
    if (n < 2) return null
    val ax = samples[0]; val ay = samples[1]
    val bx = samples[(n - 1) * STRIDE]; val by = samples[(n - 1) * STRIDE + 1]
    val length = hypot(bx - ax, by - ay)
    if (length <= 24f) return null
    val tolerance = max(4f, length * 0.035f)
    for (i in 0 until n) {
      val px = samples[i * STRIDE]; val py = samples[i * STRIDE + 1]
      if (abs((bx - ax) * (ay - py) - (ax - px) * (by - ay)) / length >= tolerance) return null
    }
    val time = samples[(n - 1) * STRIDE + 3]
    return floatArrayOf(ax, ay, 0.5f, time, 0f, 0f, 0f, 0f, bx, by, 0.5f, time, 0f, 0f, 0f, 0f)
  }

  /** The visible pieces of a stroke in its line style: the whole stroke when solid. */
  fun segments(samples: FloatArray, count: Int, lineStyle: String, width: Float): List<FloatArray> {
    val n = count / STRIDE
    val whole = if (samples.size == count) samples else samples.copyOf(count)
    if ((lineStyle != "dashed" && lineStyle != "dotted") || n < 2) return listOf(whole)
    val dash = if (lineStyle == "dotted") max(0.15f, width * 0.12f) else max(6f, width * 4f)
    val gap = max(4f, width * 2.5f)
    val result = ArrayList<FloatArray>()
    var segment = ArrayList<Float>()
    val at = { i: Int -> FloatArray(STRIDE) { samples[i * STRIDE + it] } }
    segment.addAll(at(0).asList())
    var remaining = dash
    var visible = true
    for (i in 1 until n) {
      var a = at(i - 1)
      val b = at(i)
      var distance = hypot(b[0] - a[0], b[1] - a[1])
      while (distance > remaining && result.size < MAX_SEGMENTS) {
        val t = remaining / distance
        val end = FloatArray(STRIDE) { a[it] + (b[it] - a[it]) * t }
        if (visible) { segment.addAll(end.asList()); result.add(segment.toFloatArray()) }
        visible = !visible
        segment = ArrayList()
        if (visible) segment.addAll(end.asList())
        distance -= remaining
        a = end
        remaining = if (visible) dash else gap
      }
      if (visible) segment.addAll(b.asList())
      remaining -= distance
    }
    if (segment.isNotEmpty()) result.add(segment.toFloatArray())
    return result
  }
}
