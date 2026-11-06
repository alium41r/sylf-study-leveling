package expo.modules.sylfnativeplatform

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.DashPathEffect
import android.graphics.Paint
import android.graphics.Path
import android.graphics.RectF
import android.view.MotionEvent
import androidx.core.graphics.PathParser
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import org.json.JSONArray
import org.json.JSONObject
import kotlin.math.cos
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin

/**
 * The tablet writing surface (ADR 0001, Phase 2 §5.4). It reads raw MotionEvents with their historical samples, so every sample the
 * digitizer sends reaches sylf-ink/1, and draws the live stroke itself with no round trip. Finished strokes arrive from JavaScript as
 * the web's own SVG outlines and are drawn here, so pen-up never changes a stroke's shape. Coordinates sent back are page units.
 * A finger on a pen-only page is not consumed, so the page around it scrolls, and two fingers zoom it; on a whiteboard, fingers move
 * and zoom the board. The live stroke follows pressure the way the web's outline does (its thinning), and a shape shows as the shape
 * it will become, so pen-up changes neither.
 */
@SuppressLint("ViewConstructor")
class SylfInkView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onStroke by EventDispatcher()
  private val onErase by EventDispatcher()
  private val onPan by EventDispatcher()
  private val onPinch by EventDispatcher()
  private val onPenSeen by EventDispatcher()

  var tool = "pen"
  var penOnly = false
  var fingerGestures = false
  /** Pages: two fingers zoom (and move) the page while one finger is left to the scroll view around it. */
  var pinchZoom = false
  /** perfect-freehand's thinning for the brush, so the live width matches the finished outline: 0 for highlighters and fineliners. */
  var inkThinning = 0f
  /** "line", "rectangle" or "ellipse" while the shape tool is chosen. */
  var inkShape = ""
  var editable = true
  var inkColor = Color.BLACK
  var inkWidth = 2.6f
  var inkOpacity = 1f
  var eraserRadius = 8f
  private var camX = 0f
  private var camY = 0f
  private var zoom = 1f
  private val density = resources.displayMetrics.density
  private var selection: FloatArray? = null

  private class Stroke(val path: Path, val color: Int, val alpha: Int)
  private val strokes = LinkedHashMap<String, Stroke>()
  private var paper: Paper? = null
  private class Paper(val color: Int, val rule: Int, val width: Float, val height: Float, val lines: FloatArray, val dots: FloatArray, val labels: List<Triple<String, Float, Float>>)

  private val fill = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.FILL }
  private val line = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; strokeCap = Paint.Cap.ROUND; strokeJoin = Paint.Join.ROUND }
  private val dashed = Paint(Paint.ANTI_ALIAS_FLAG).apply { style = Paint.Style.STROKE; color = Color.rgb(74, 108, 247); strokeWidth = 2.5f }
  private val label = Paint(Paint.ANTI_ALIAS_FLAG).apply { textSize = 13f }

  // The gesture in progress.
  private enum class Kind { NONE, DRAW, ERASE, LASSO, MOVE, PINCH }
  private var kind = Kind.NONE
  private var pointer = -1
  private var started = 0L
  private val samples = ArrayList<Float>(2048)
  private val livePath = Path()
  private var liveLast: FloatArray? = null
  /** Strokes finished here and waiting for their outline from JavaScript, drawn exactly as they were live. */
  private class Pending(val samples: FloatArray, val color: Int, val alpha: Int, val width: Float, val thinning: Float, val shape: String)
  private val pending = HashMap<Int, Pending>()
  private var pageFinger = false
  private var liveSeq = 0
  private val erasePoints = ArrayList<Float>()
  private var moveFrom: FloatArray? = null
  private var moveTo: FloatArray? = null
  private var pinchDistance = 0f
  private var pinchCentre = floatArrayOf(0f, 0f)

  init { setWillNotDraw(false) }

  fun setCamera(values: List<Double>) {
    if (values.size < 3) return
    camX = values[0].toFloat(); camY = values[1].toFloat(); zoom = values[2].toFloat()
    invalidate()
  }

  fun setSelection(values: List<Double>?) {
    selection = values?.takeIf { it.size == 4 }?.map { it.toFloat() }?.toFloatArray()
    invalidate()
  }

  fun setPaper(json: String?) {
    paper = if (json.isNullOrEmpty()) null else try {
      val o = JSONObject(json)
      val lines = o.getJSONArray("lines"); val dots = o.getJSONArray("dots"); val labels = o.optJSONArray("labels") ?: JSONArray()
      Paper(Color.parseColor(o.getString("color")), Color.parseColor(o.getString("rule")), o.getDouble("width").toFloat(), o.getDouble("height").toFloat(),
        FloatArray(lines.length()) { lines.getDouble(it).toFloat() }, FloatArray(dots.length()) { dots.getDouble(it).toFloat() },
        (0 until labels.length()).map { val l = labels.getJSONArray(it); Triple(l.getString(0), l.getDouble(1).toFloat(), l.getDouble(2).toFloat()) })
    } catch (_: Throwable) { null }
    invalidate()
  }

  /** Finished strokes: [{ id, d, color, opacity }]. A stroke already here with the same id is replaced. */
  fun upsertStrokes(json: String) {
    val list = JSONArray(json)
    for (i in 0 until list.length()) {
      val o = list.getJSONObject(i)
      val path = try { PathParser.createPathFromPathData(o.getString("d")) } catch (_: Throwable) { continue }
      strokes.remove(o.getString("id"))
      strokes[o.getString("id")] = Stroke(path, Color.parseColor(o.getString("color")), (o.optDouble("opacity", 1.0) * 255).toInt().coerceIn(0, 255))
    }
    invalidate()
  }

  fun removeStrokes(ids: List<String>) { ids.forEach { strokes.remove(it) }; invalidate() }
  fun clearStrokes() { strokes.clear(); invalidate() }
  /** The finished stroke has been drawn from its outline, so the live copy can go without a flicker. */
  fun dropLive(id: Int) { pending.remove(id); invalidate() }

  private fun pageX(x: Float) = camX + x / density / zoom
  private fun pageY(y: Float) = camY + y / density / zoom
  private val scale get() = density * zoom

  override fun onDraw(canvas: Canvas) {
    super.onDraw(canvas)
    canvas.save()
    canvas.scale(scale, scale)
    canvas.translate(-camX, -camY)
    paper?.let { p ->
      fill.color = p.color; fill.alpha = 255
      canvas.drawRect(0f, 0f, p.width, p.height, fill)
      if (p.lines.isNotEmpty() || p.dots.isNotEmpty()) {
        line.color = p.rule; line.alpha = 255; line.strokeWidth = max(0.65f, 0.6f / zoom)
        canvas.drawLines(p.lines, line)
        fill.color = p.rule
        val r = max(0.9f, 1f / zoom)
        var i = 0
        while (i + 1 < p.dots.size) { canvas.drawCircle(p.dots[i], p.dots[i + 1], r, fill); i += 2 }
        label.color = Color.rgb(104, 115, 134)
        for ((text, x, y) in p.labels) canvas.drawText(text, x, y, label)
      }
    }
    val offset = if (kind == Kind.MOVE) moveTo?.let { to -> moveFrom?.let { from -> floatArrayOf(to[0] - from[0], to[1] - from[1]) } } else null
    for ((_, s) in strokes) { fill.color = s.color; fill.alpha = s.alpha; canvas.drawPath(s.path, fill) }
    for (p in pending.values) drawLive(canvas, p.samples, p.samples.size, p.color, p.alpha, p.width, p.thinning, p.shape)
    if (kind == Kind.DRAW) drawLive(canvas, null, samples.size, inkColor, (inkOpacity * 255).toInt(), inkWidth, inkThinning, if (tool == "shape") inkShape else "")
    selection?.let { s ->
      dashed.strokeWidth = 1.4f / zoom; dashed.pathEffect = DashPathEffect(floatArrayOf(6f / zoom, 4f / zoom), 0f)
      val dx = offset?.get(0) ?: 0f; val dy = offset?.get(1) ?: 0f
      canvas.drawRect(s[0] - 6 + dx, s[1] - 6 + dy, s[0] + s[2] + 6 + dx, s[1] + s[3] + 6 + dy, dashed)
    }
    if (kind == Kind.LASSO && samples.size >= 4) {
      dashed.strokeWidth = 1.4f / zoom; dashed.pathEffect = DashPathEffect(floatArrayOf(5f / zoom, 4f / zoom), 0f)
      val p = Path(); p.moveTo(samples[0], samples[1]); var i = 8
      while (i + 1 < samples.size) { p.lineTo(samples[i], samples[i + 1]); i += 8 }
      p.close(); canvas.drawPath(p, dashed)
    }
    if (kind == Kind.ERASE && erasePoints.size >= 2) {
      line.color = Color.argb(170, 60, 60, 70); line.strokeWidth = 1.2f / zoom
      canvas.drawCircle(erasePoints[erasePoints.size - 2], erasePoints[erasePoints.size - 1], eraserRadius, line)
    }
    canvas.restore()
  }

  private val shapeBox = RectF()

  /**
   * A stroke as it is being written, or finished and waiting for its outline: a shape as the shape it becomes (the bounds of what was
   * drawn, so a rough circle becomes a circle; a line from end to end), otherwise segments whose width follows pressure with the
   * brush's thinning, as perfect-freehand's outline does (width × (1 − 2 × thinning × (0.5 − pressure))). `from` is null for the
   * stroke in progress, whose samples are still in `samples`.
   */
  private fun drawLive(canvas: Canvas, from: FloatArray?, size: Int, color: Int, alpha: Int, width: Float, thinning: Float, shape: String) {
    if (size < 8) return
    val at = { i: Int -> if (from != null) from[i] else samples[i] }
    line.color = color; line.alpha = alpha; line.strokeWidth = width
    if (shape.isNotEmpty()) {
      if (shape == "line") { canvas.drawLine(at(0), at(1), at(size - 8), at(size - 7), line); return }
      var x1 = Float.MAX_VALUE; var y1 = Float.MAX_VALUE; var x2 = -Float.MAX_VALUE; var y2 = -Float.MAX_VALUE
      var i = 0
      while (i + 1 < size) { x1 = min(x1, at(i)); y1 = min(y1, at(i + 1)); x2 = max(x2, at(i)); y2 = max(y2, at(i + 1)); i += 8 }
      shapeBox.set(x1, y1, x2, y2)
      if (shape == "rectangle") canvas.drawRect(shapeBox, line) else canvas.drawOval(shapeBox, line)
      return
    }
    // No thinning (highlighters, fineliners): one even line, drawn as a path so a translucent ink does not darken where segments meet.
    if (thinning <= 0f) {
      if (from == null) { canvas.drawPath(livePath, line); return }
      val path = Path(); path.moveTo(from[0], from[1]); var j = 8
      while (j + 1 < size) { path.lineTo(from[j], from[j + 1]); j += 8 }
      canvas.drawPath(path, line); return
    }
    // Pressure is eased a little, as the outline smooths it, so a single noisy sample does not make a bead.
    var pressure = at(2)
    var i = 8
    if (size == 8) { line.strokeWidth = width * widthFactor(pressure, thinning); canvas.drawPoint(at(0), at(1), line); return }
    while (i + 2 < size) {
      pressure += (at(i + 2) - pressure) * 0.35f
      line.strokeWidth = width * widthFactor(pressure, thinning)
      canvas.drawLine(at(i - 8), at(i - 7), at(i), at(i + 1), line)
      i += 8
    }
  }

  private fun widthFactor(pressure: Float, thinning: Float) = max(0.12f, 1f - 2f * thinning * (0.5f - pressure.coerceIn(0f, 1f)))

  private fun sample(event: MotionEvent, index: Int, history: Int) {
    val h = history >= 0
    val x = pageX(if (h) event.getHistoricalX(index, history) else event.getX(index))
    val y = pageY(if (h) event.getHistoricalY(index, history) else event.getY(index))
    val pressure = (if (h) event.getHistoricalPressure(index, history) else event.getPressure(index)).coerceIn(0f, 1f)
    val time = (if (h) event.getHistoricalEventTime(history) else event.eventTime) - started
    val tilt = Math.toDegrees((if (h) event.getHistoricalAxisValue(MotionEvent.AXIS_TILT, index, history) else event.getAxisValue(MotionEvent.AXIS_TILT, index)).toDouble())
    val orientation = (if (h) event.getHistoricalAxisValue(MotionEvent.AXIS_ORIENTATION, index, history) else event.getAxisValue(MotionEvent.AXIS_ORIENTATION, index)).toDouble()
    val finger = event.getToolType(index) == MotionEvent.TOOL_TYPE_FINGER
    // sylf-ink/1 samples: [x, y, pressure, ms since the stroke began, tiltX, tiltY, twist, tangential pressure].
    samples.add(x); samples.add(y); samples.add(if (finger) 0.5f else pressure); samples.add(time.coerceIn(0, 86_400_000).toFloat())
    samples.add((tilt * sin(orientation)).toFloat().coerceIn(-90f, 90f)); samples.add((-tilt * cos(orientation)).toFloat().coerceIn(-90f, 90f)); samples.add(0f); samples.add(0f)
    val last = liveLast
    if (last == null) livePath.moveTo(x, y) else livePath.quadTo(last[0], last[1], (last[0] + x) / 2, (last[1] + y) / 2)
    liveLast = floatArrayOf(x, y)
  }

  private fun inSelection(x: Float, y: Float) = selection?.let { s -> x >= s[0] - 8 && x <= s[0] + s[2] + 8 && y >= s[1] - 8 && y <= s[1] + s[3] + 8 } ?: false

  @SuppressLint("ClickableViewAccessibility")
  override fun onTouchEvent(event: MotionEvent): Boolean {
    val index = event.actionIndex
    val type = event.getToolType(index)
    val pen = type == MotionEvent.TOOL_TYPE_STYLUS || type == MotionEvent.TOOL_TYPE_ERASER
    if (pen && event.actionMasked == MotionEvent.ACTION_DOWN) onPenSeen(mapOf<String, Any>())
    // Pages: two fingers zoom and move the page; one finger stays with the scroll view, or writes on a page that is not pen-only.
    if (!pen && pinchZoom && !fingerGestures) pagePinch(event)?.let { return it }
    // Fingers: two always move the view; one writes only on a page that is not pen-only.
    if (!pen && (fingerGestures && (penOnly || event.pointerCount > 1 || !editable) || kind == Kind.PINCH)) return fingerGesture(event)
    if (!pen && (penOnly || !editable) && kind == Kind.NONE) return false
    if (!editable) return false
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> {
        parent?.requestDisallowInterceptTouchEvent(true)
        requestUnbufferedDispatch(event)
        pointer = event.getPointerId(index); started = event.eventTime
        samples.clear(); livePath.reset(); liveLast = null; erasePoints.clear()
        val x = pageX(event.getX(index)); val y = pageY(event.getY(index))
        val eraserTip = type == MotionEvent.TOOL_TYPE_ERASER || (event.buttonState and MotionEvent.BUTTON_STYLUS_PRIMARY) != 0
        kind = when {
          inSelection(x, y) -> Kind.MOVE
          eraserTip || tool == "eraser" -> Kind.ERASE
          tool == "lasso" -> Kind.LASSO
          else -> Kind.DRAW
        }
        if (kind == Kind.MOVE) { moveFrom = floatArrayOf(x, y); moveTo = moveFrom }
        else if (kind == Kind.ERASE) { erasePoints.add(x); erasePoints.add(y); emitErase(type, "start") }
        else sample(event, index, -1)
        invalidate()
        return true
      }
      MotionEvent.ACTION_MOVE -> {
        val i = event.findPointerIndex(pointer)
        if (i < 0 || kind == Kind.NONE) return true
        when (kind) {
          Kind.DRAW, Kind.LASSO -> { for (h in 0 until event.historySize) sample(event, i, h); sample(event, i, -1) }
          Kind.ERASE -> {
            for (h in 0 until event.historySize) { erasePoints.add(pageX(event.getHistoricalX(i, h))); erasePoints.add(pageY(event.getHistoricalY(i, h))) }
            erasePoints.add(pageX(event.getX(i))); erasePoints.add(pageY(event.getY(i)))
            if (erasePoints.size >= 12) emitErase(type, "move")
          }
          Kind.MOVE -> moveTo = floatArrayOf(pageX(event.getX(i)), pageY(event.getY(i)))
          else -> {}
        }
        invalidate()
        return true
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        val cancelled = event.actionMasked == MotionEvent.ACTION_CANCEL || (event.flags and MotionEvent.FLAG_CANCELED) != 0
        finish(event, type, cancelled)
        return true
      }
    }
    return true
  }

  /** One sweep is "start", any "move"s, then "end", so JavaScript can make the whole sweep one undo step. */
  private fun emitErase(type: Int, phase: String) {
    if (erasePoints.isEmpty() && phase != "end") return
    onErase(mapOf("points" to erasePoints.map { it.toDouble() }, "pointer" to pointerName(type), "phase" to phase))
    if (erasePoints.size < 2) return
    // Keep the last point, so the eraser's ring stays under the pen.
    val x = erasePoints[erasePoints.size - 2]; val y = erasePoints[erasePoints.size - 1]
    erasePoints.clear(); erasePoints.add(x); erasePoints.add(y)
  }

  private fun finish(event: MotionEvent, type: Int, cancelled: Boolean) {
    val i = event.findPointerIndex(pointer)
    when (kind) {
      Kind.DRAW -> {
        if (i >= 0 && !cancelled) sample(event, i, -1)
        if (!cancelled && samples.size >= 8) {
          val id = ++liveSeq
          // The live copy stays until the finished outline is drawn, then JavaScript drops it.
          pending[id] = Pending(samples.toFloatArray(), inkColor, (inkOpacity * 255).toInt(), inkWidth, inkThinning, if (tool == "shape") inkShape else "")
          onStroke(mapOf("kind" to "draw", "samples" to samples.map { it.toDouble() }, "pointer" to pointerName(type), "live" to id))
        }
      }
      Kind.LASSO -> if (!cancelled) onStroke(mapOf("kind" to "lasso", "samples" to samples.map { it.toDouble() }, "pointer" to pointerName(type), "live" to 0))
      Kind.ERASE -> emitErase(type, "end")
      Kind.MOVE -> { val from = moveFrom; val to = moveTo; if (!cancelled && from != null && to != null) onStroke(mapOf("kind" to "move", "samples" to listOf(from[0], from[1], to[0], to[1]).map { it.toDouble() }, "pointer" to pointerName(type), "live" to 0)) }
      else -> {}
    }
    kind = Kind.NONE; pointer = -1; livePath.reset(); liveLast = null; samples.clear(); erasePoints.clear(); moveFrom = null; moveTo = null
    parent?.requestDisallowInterceptTouchEvent(false)
    invalidate()
  }

  private fun pointerName(type: Int) = when (type) { MotionEvent.TOOL_TYPE_STYLUS, MotionEvent.TOOL_TYPE_ERASER -> "pen"; MotionEvent.TOOL_TYPE_MOUSE -> "mouse"; else -> "touch" }

  /**
   * Two fingers on a page. The first finger is held without claiming the gesture, so if it moves the scroll view takes it (one finger
   * scrolls) and this view hears a cancel. A second finger before that claims the gesture and zooms; a stroke a finger had begun is
   * dropped. Null means "not a page pinch": the caller carries on as usual.
   */
  private fun pagePinch(event: MotionEvent): Boolean? {
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> { if (penOnly || !editable) { kind = Kind.NONE; pageFinger = true; return true }; return null }
      MotionEvent.ACTION_POINTER_DOWN -> {
        if (kind == Kind.DRAW) { samples.clear(); livePath.reset(); liveLast = null }
        if (kind != Kind.DRAW && kind != Kind.NONE && kind != Kind.PINCH) return null
        kind = Kind.PINCH; pageFinger = false
        parent?.requestDisallowInterceptTouchEvent(true)
        pinchCentre = centre(event); pinchDistance = spread(event)
        invalidate()
        return true
      }
      MotionEvent.ACTION_MOVE -> {
        if (kind == Kind.PINCH) {
          val c = centre(event); val d = spread(event)
          onPan(mapOf("dx" to ((c[0] - pinchCentre[0]) / density).toDouble(), "dy" to ((c[1] - pinchCentre[1]) / density).toDouble()))
          if (event.pointerCount > 1 && pinchDistance > 0 && d > 0) onPinch(mapOf("factor" to (d / pinchDistance).toDouble(), "x" to (c[0] / density).toDouble(), "y" to (c[1] / density).toDouble()))
          pinchCentre = c; pinchDistance = d
          return true
        }
        return if (pageFinger) true else null
      }
      MotionEvent.ACTION_POINTER_UP -> {
        if (kind != Kind.PINCH) return null
        pinchCentre = centre(event, event.actionIndex); pinchDistance = spread(event, event.actionIndex)
        return true
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        if (kind != Kind.PINCH && !pageFinger) return null
        kind = Kind.NONE; pageFinger = false
        parent?.requestDisallowInterceptTouchEvent(false)
        return true
      }
    }
    return null
  }

  /** Board navigation: one finger pans, two pan and pinch. Values go to JavaScript in layout points, which owns the camera. */
  private fun fingerGesture(event: MotionEvent): Boolean {
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN -> { parent?.requestDisallowInterceptTouchEvent(true); kind = Kind.PINCH; pinchCentre = centre(event); pinchDistance = spread(event) }
      MotionEvent.ACTION_POINTER_DOWN, MotionEvent.ACTION_POINTER_UP -> { pinchCentre = centre(event, if (event.actionMasked == MotionEvent.ACTION_POINTER_UP) event.actionIndex else -1); pinchDistance = spread(event, if (event.actionMasked == MotionEvent.ACTION_POINTER_UP) event.actionIndex else -1) }
      MotionEvent.ACTION_MOVE -> {
        val c = centre(event); val d = spread(event)
        onPan(mapOf("dx" to ((c[0] - pinchCentre[0]) / density).toDouble(), "dy" to ((c[1] - pinchCentre[1]) / density).toDouble()))
        if (event.pointerCount > 1 && pinchDistance > 0 && d > 0) onPinch(mapOf("factor" to (d / pinchDistance).toDouble(), "x" to (c[0] / density).toDouble(), "y" to (c[1] / density).toDouble()))
        pinchCentre = c; pinchDistance = d
      }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> { kind = Kind.NONE; parent?.requestDisallowInterceptTouchEvent(false) }
    }
    return true
  }

  private fun centre(event: MotionEvent, skip: Int = -1): FloatArray {
    var x = 0f; var y = 0f; var n = 0
    for (i in 0 until event.pointerCount) if (i != skip) { x += event.getX(i); y += event.getY(i); n++ }
    return if (n == 0) floatArrayOf(0f, 0f) else floatArrayOf(x / n, y / n)
  }

  private fun spread(event: MotionEvent, skip: Int = -1): Float {
    val points = (0 until event.pointerCount).filter { it != skip }
    if (points.size < 2) return 0f
    return hypot(event.getX(points[0]) - event.getX(points[1]), event.getY(points[0]) - event.getY(points[1]))
  }
}
