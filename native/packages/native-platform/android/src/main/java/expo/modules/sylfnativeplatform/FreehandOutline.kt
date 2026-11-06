package expo.modules.sylfnativeplatform

import android.graphics.Path
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin

/**
 * The outline every finished Sylf stroke is drawn from, ported line for line from perfect-freehand 1.2.3 (getStrokePoints and
 * getStrokeOutlinePoints, as the web's `lib/notes/ink-outline.ts` calls them), and joined into a path with the same midpoint
 * curves as `outlineSvg`. The live stroke is drawn with it, so what is written is what stays: no corners while writing, and no
 * change at pen-up. Samples are sylf-ink/1's, eight floats each: x, y, pressure, then time and tilt, which this does not use.
 */
internal object FreehandOutline {
  class Options(val size: Float, val thinning: Float, val smoothing: Float, val simulatePressure: Boolean, val brushCurve: Boolean)

  private const val RATE_OF_PRESSURE_CHANGE = 0.275
  private const val FIXED_PI = PI + 0.0001
  private const val START_CAP_SEGMENTS = 13
  private const val END_CAP_SEGMENTS = 29
  private const val CORNER_CAP_SEGMENTS = 13
  private const val END_NOISE_THRESHOLD = 3.0
  private const val MIN_RADIUS = 0.01

  private class StrokePoint(val x: Double, val y: Double, val pressure: Double, var vx: Double, var vy: Double, val distance: Double, val runningLength: Double)

  fun path(samples: FloatArray, count: Int, options: Options, last: Boolean): Path? {
    val outline = outline(samples, count, options, last)
    if (outline.isEmpty()) return null
    val path = Path()
    path.moveTo(outline[0][0].toFloat(), outline[0][1].toFloat())
    for (i in 1 until outline.size) {
      val p = outline[i]; val n = outline[(i + 1) % outline.size]
      path.quadTo(p[0].toFloat(), p[1].toFloat(), ((p[0] + n[0]) / 2).toFloat(), ((p[1] + n[1]) / 2).toFloat())
    }
    path.close()
    return path
  }

  private fun pressureOf(samples: FloatArray, i: Int, brushCurve: Boolean): Double {
    val p = samples[i * 8 + 2].toDouble()
    return if (brushCurve) p.pow(0.75) else p
  }

  private fun streamlineOf(smoothing: Float) = min(0.42, max(0.08, smoothing * 0.34))

  private fun strokePoints(samples: FloatArray, count: Int, options: Options, last: Boolean): List<StrokePoint> {
    val n = count / 8
    if (n == 0) return emptyList()
    val t = 0.15 + (1 - streamlineOf(options.smoothing)) * 0.85
    // [x, y, pressure] as perfect-freehand reads them.
    var pts: MutableList<DoubleArray> = MutableList(n) { doubleArrayOf(samples[it * 8].toDouble(), samples[it * 8 + 1].toDouble(), pressureOf(samples, it, options.brushCurve)) }
    if (pts.size == 2) {
      val end = pts[1]; val first = pts[0]
      pts = mutableListOf(first)
      // perfect-freehand's lrp keeps only x and y here, so these points take the default pressure (-1 reads as "none").
      for (i in 1 until 5) { val k = i / 4.0; pts.add(doubleArrayOf(first[0] + (end[0] - first[0]) * k, first[1] + (end[1] - first[1]) * k, -1.0)) }
    }
    if (pts.size == 1) pts.add(doubleArrayOf(pts[0][0] + 1, pts[0][1] + 1, pts[0][2]))
    val out = ArrayList<StrokePoint>(pts.size)
    out.add(StrokePoint(pts[0][0], pts[0][1], if (pts[0][2] >= 0) pts[0][2] else 0.25, 1.0, 1.0, 0.0, 0.0))
    var reachedMinimum = false
    var running = 0.0
    var prev = out[0]
    val maxIndex = pts.size - 1
    for (i in 1 until pts.size) {
      val px: Double; val py: Double
      if (last && i == maxIndex) { px = pts[i][0]; py = pts[i][1] } else { px = prev.x + (pts[i][0] - prev.x) * t; py = prev.y + (pts[i][1] - prev.y) * t }
      if (px == prev.x && py == prev.y) continue
      val distance = hypot(py - prev.y, px - prev.x)
      running += distance
      if (i < maxIndex && !reachedMinimum) { if (running < options.size) continue; reachedMinimum = true }
      val dx = prev.x - px; val dy = prev.y - py; val l = hypot(dx, dy)
      prev = StrokePoint(px, py, if (pts[i][2] >= 0) pts[i][2] else 0.5, dx / l, dy / l, distance, running)
      out.add(prev)
    }
    if (out.size > 1) { out[0].vx = out[1].vx; out[0].vy = out[1].vy } else { out[0].vx = 0.0; out[0].vy = 0.0 }
    return out
  }

  private fun simulate(prev: Double, distance: Double, size: Double): Double {
    val sp = min(1.0, distance / size); val rp = min(1.0, 1 - sp)
    return min(1.0, prev + (rp - prev) * (sp * RATE_OF_PRESSURE_CHANGE))
  }

  private fun radiusOf(size: Double, thinning: Double, pressure: Double) = size * (0.5 - thinning * (0.5 - pressure))

  private fun rotAround(ax: Double, ay: Double, cx: Double, cy: Double, r: Double): DoubleArray {
    val s = sin(r); val c = cos(r); val px = ax - cx; val py = ay - cy
    return doubleArrayOf(px * c - py * s + cx, px * s + py * c + cy)
  }

  private fun outline(samples: FloatArray, count: Int, options: Options, last: Boolean): List<DoubleArray> {
    val points = strokePoints(samples, count, options, last)
    val size = options.size.toDouble()
    if (points.isEmpty() || size <= 0) return emptyList()
    val thinning = options.thinning.toDouble()
    val totalLength = points.last().runningLength
    val minDistance = (size * options.smoothing).pow(2)
    val left = ArrayList<DoubleArray>(); val right = ArrayList<DoubleArray>()
    var prevPressure = points.take(10).fold(points[0].pressure) { acc, p -> (acc + (if (options.simulatePressure) simulate(acc, p.distance, size) else p.pressure)) / 2 }
    var radius = radiusOf(size, thinning, points.last().pressure)
    var firstRadius: Double? = null
    var pvx = points[0].vx; var pvy = points[0].vy
    var prevLeft = doubleArrayOf(points[0].x, points[0].y); var prevRight = prevLeft
    var tempLeft = prevLeft; var tempRight = prevRight
    var prevSharp = false
    for (i in points.indices) {
      val pt = points[i]
      var pressure = pt.pressure
      val isLast = i == points.size - 1
      if (!isLast && totalLength - pt.runningLength < END_NOISE_THRESHOLD) continue
      if (thinning != 0.0) {
        if (options.simulatePressure) pressure = simulate(prevPressure, pt.distance, size)
        radius = radiusOf(size, thinning, pressure)
      } else radius = size / 2
      if (firstRadius == null) firstRadius = radius
      radius = max(MIN_RADIUS, radius)
      val next = if (!isLast) points[i + 1] else pt
      val nextDpr = if (!isLast) pt.vx * next.vx + pt.vy * next.vy else 1.0
      val prevDpr = pt.vx * pvx + pt.vy * pvy
      val sharp = prevDpr < 0 && !prevSharp
      val nextSharp = nextDpr < 0
      if (sharp || nextSharp) {
        val ox = pvy * radius; val oy = -pvx * radius
        var t = 0.0
        val step = 1.0 / CORNER_CAP_SEGMENTS
        while (t <= 1) {
          tempLeft = rotAround(pt.x - ox, pt.y - oy, pt.x, pt.y, FIXED_PI * t); left.add(tempLeft)
          tempRight = rotAround(pt.x + ox, pt.y + oy, pt.x, pt.y, FIXED_PI * -t); right.add(tempRight)
          t += step
        }
        prevLeft = tempLeft; prevRight = tempRight
        if (nextSharp) prevSharp = true
        continue
      }
      prevSharp = false
      if (isLast) {
        val ox = pt.vy * radius; val oy = -pt.vx * radius
        left.add(doubleArrayOf(pt.x - ox, pt.y - oy)); right.add(doubleArrayOf(pt.x + ox, pt.y + oy))
        continue
      }
      // lrp(nextVector, vector, nextDpr), turned a quarter, times the radius.
      val lx = next.vx + (pt.vx - next.vx) * nextDpr; val ly = next.vy + (pt.vy - next.vy) * nextDpr
      val ox = ly * radius; val oy = -lx * radius
      tempLeft = doubleArrayOf(pt.x - ox, pt.y - oy)
      if (i <= 1 || (prevLeft[0] - tempLeft[0]).pow(2) + (prevLeft[1] - tempLeft[1]).pow(2) > minDistance) { left.add(tempLeft); prevLeft = tempLeft }
      tempRight = doubleArrayOf(pt.x + ox, pt.y + oy)
      if (i <= 1 || (prevRight[0] - tempRight[0]).pow(2) + (prevRight[1] - tempRight[1]).pow(2) > minDistance) { right.add(tempRight); prevRight = tempRight }
      prevPressure = pressure
      pvx = pt.vx; pvy = pt.vy
    }
    val fx = points[0].x; val fy = points[0].y
    val lastX = if (points.size > 1) points.last().x else points[0].x + 1
    val lastY = if (points.size > 1) points.last().y else points[0].y + 1
    if (points.size == 1) {
      // A dot.
      val r = firstRadius ?: radius
      val ux0 = fx - (fx + 1); val uy0 = fy - (fy + 1); val ul = hypot(ux0, uy0)
      val px = uy0 / ul; val py = -ux0 / ul
      val sx = fx + px * -r; val sy = fy + py * -r
      val dot = ArrayList<DoubleArray>()
      var t = 1.0 / START_CAP_SEGMENTS
      while (t <= 1) { dot.add(rotAround(sx, sy, fx, fy, FIXED_PI * 2 * t)); t += 1.0 / START_CAP_SEGMENTS }
      return dot
    }
    val startCap = ArrayList<DoubleArray>()
    if (right.isNotEmpty()) {
      var t = 1.0 / START_CAP_SEGMENTS
      while (t <= 1) { startCap.add(rotAround(right[0][0], right[0][1], fx, fy, FIXED_PI * t)); t += 1.0 / START_CAP_SEGMENTS }
    }
    // direction = per(neg(lastVector)); the cap starts a radius along it and turns one and a half times.
    val lv = points.last()
    val dx = -lv.vy; val dy = lv.vx
    val sx = lastX + dx * radius; val sy = lastY + dy * radius
    val endCap = ArrayList<DoubleArray>()
    var t = 1.0 / END_CAP_SEGMENTS
    while (t < 1) { endCap.add(rotAround(sx, sy, lastX, lastY, FIXED_PI * 3 * t)); t += 1.0 / END_CAP_SEGMENTS }
    val result = ArrayList<DoubleArray>(left.size + endCap.size + right.size + startCap.size)
    result.addAll(left); result.addAll(endCap); result.addAll(right.asReversed()); result.addAll(startCap)
    return result
  }
}
