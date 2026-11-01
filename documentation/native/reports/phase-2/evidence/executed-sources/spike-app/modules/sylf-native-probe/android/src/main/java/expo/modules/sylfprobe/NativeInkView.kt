package expo.modules.sylfprobe

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import androidx.ink.authoring.InProgressStrokeId
import androidx.ink.authoring.InProgressStrokesFinishedListener
import androidx.ink.authoring.InProgressStrokesView
import androidx.ink.brush.Brush
import androidx.ink.brush.StockBrushes
import androidx.ink.rendering.android.canvas.CanvasStrokeRenderer
import androidx.ink.strokes.Stroke
import androidx.ink.strokes.StrokeInput
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView

/** Low-latency androidx.ink authoring surface that also records raw MotionEvent statistics. */
@SuppressLint("ViewConstructor")
class NativeInkView(context: Context, appContext: AppContext) : ExpoView(context, appContext), InProgressStrokesFinishedListener {
  private val onStats by EventDispatcher()
  var stylusOnly = true

  private val finished = mutableListOf<Stroke>()
  private val renderer = CanvasStrokeRenderer.create()
  private val identity = Matrix()
  private val finishedView = object : View(context) {
    override fun onDraw(canvas: Canvas) { canvas.drawColor(Color.rgb(255, 253, 247)); for (s in finished) renderer.draw(canvas, s, identity) }
  }
  private val inProgress = InProgressStrokesView(context)
  private val paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply { color = Color.rgb(34, 34, 34); strokeCap = android.graphics.Paint.Cap.ROUND; style = android.graphics.Paint.Style.STROKE }
  private var cache: android.graphics.Bitmap? = null
  private var cacheCanvas: Canvas? = null
  private var lastX = Float.NaN; private var lastY = Float.NaN
  private var canvasStrokes = 0; private var canvasStrokeSamples = 0; private var lastCanvasStrokeSamples = 0
  private val canvasLayer = object : View(context) {
    override fun onDraw(canvas: Canvas) { cache?.let { canvas.drawBitmap(it, 0f, 0f, null) } }
  }
  private fun segment(x: Float, y: Float, p: Float) {
    val c = cacheCanvas ?: return
    if (!lastX.isNaN()) { paint.strokeWidth = 1.5f + 7f * p; c.drawLine(lastX, lastY, x, y, paint) }
    lastX = x; lastY = y; canvasStrokeSamples++
  }
  private val brush = Brush.createWithColorIntArgb(StockBrushes.pressurePen(), Color.rgb(34, 34, 34), 6f, 0.1f)
  private val active = HashMap<Int, InProgressStrokeId>()

  // Statistics window.
  private var windowStart = SystemClock.uptimeMillis()
  private var dispatches = 0; private var samples = 0; private var historical = 0; private var strokes = 0
  private var canceledPalm = 0; private var fingerIgnored = 0
  private var pMin = 1f; private var pMax = 0f; private var tiltMax = 0f
  private val tools = HashMap<String, Int>()
  private val latency = ArrayList<Long>()
  private var lastStrokeSamples = 0; private var lastTuples = 0
  private var unbuffered = false
  private val actions = HashMap<String, Int>()
  private var lastError = ""

  init {
    addView(finishedView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    addView(inProgress, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    addView(canvasLayer, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
    inProgress.addFinishedStrokesListener(this)
  }

  private fun toolName(t: Int) = when (t) { MotionEvent.TOOL_TYPE_STYLUS -> "stylus"; MotionEvent.TOOL_TYPE_FINGER -> "finger"; MotionEvent.TOOL_TYPE_ERASER -> "eraser"; MotionEvent.TOOL_TYPE_MOUSE -> "mouse"; else -> "other$t" }

  @SuppressLint("ClickableViewAccessibility")
  override fun onTouchEvent(event: MotionEvent): Boolean {
    val idx = event.actionIndex
    val pid = event.getPointerId(idx)
    val tool = event.getToolType(idx)
    dispatches++
    latency.add(SystemClock.uptimeMillis() - event.eventTime)
    samples += event.historySize + 1; historical += event.historySize
    tools[toolName(tool)] = (tools[toolName(tool)] ?: 0) + 1
    for (h in 0 until event.historySize) { val p = event.getHistoricalPressure(idx, h); if (p < pMin) pMin = p; if (p > pMax) pMax = p }
    val p = event.getPressure(idx); if (p < pMin) pMin = p; if (p > pMax) pMax = p
    val tilt = Math.toDegrees(event.getAxisValue(MotionEvent.AXIS_TILT, idx).toDouble()).toFloat(); if (tilt > tiltMax) tiltMax = tilt
    val allowed = !stylusOnly || tool == MotionEvent.TOOL_TYPE_STYLUS || tool == MotionEvent.TOOL_TYPE_ERASER
    val an = MotionEvent.actionToString(event.actionMasked); actions[an] = (actions[an] ?: 0) + 1
    try { handle(event, pid, tool, allowed) } catch (e: Throwable) { lastError = e.toString().take(300) }
    maybeEmit()
    return true
  }

  private fun handle(event: MotionEvent, pid: Int, tool: Int, allowed: Boolean) {
    if (allowed) {
      val i = event.findPointerIndex(pid).coerceAtLeast(0)
      when (event.actionMasked) {
        MotionEvent.ACTION_DOWN -> { lastX = Float.NaN; canvasStrokeSamples = 0; segment(event.getX(i), event.getY(i), event.getPressure(i)) }
        MotionEvent.ACTION_MOVE -> { for (h in 0 until event.historySize) segment(event.getHistoricalX(i, h), event.getHistoricalY(i, h), event.getHistoricalPressure(i, h)); segment(event.getX(i), event.getY(i), event.getPressure(i)) }
        MotionEvent.ACTION_UP -> { segment(event.getX(i), event.getY(i), event.getPressure(i)); canvasStrokes++; lastCanvasStrokeSamples = canvasStrokeSamples; lastX = Float.NaN }
        MotionEvent.ACTION_CANCEL -> lastX = Float.NaN
      }
      canvasLayer.invalidate()
    }
    when (event.actionMasked) {
      MotionEvent.ACTION_DOWN, MotionEvent.ACTION_POINTER_DOWN -> {
        if (!allowed) { fingerIgnored++; return }
        if (!unbuffered) { requestUnbufferedDispatch(event); unbuffered = true }
        active[pid] = inProgress.startStroke(event, pid, brush)
      }
      MotionEvent.ACTION_MOVE -> for (i in 0 until event.pointerCount) { val id = event.getPointerId(i); active[id]?.let { inProgress.addToStroke(event, id, it) } }
      MotionEvent.ACTION_UP, MotionEvent.ACTION_POINTER_UP -> {
        active.remove(pid)?.let {
          // Palm rejection: Android flags a cancelled touch on UP with FLAG_CANCELED.
          if ((event.flags and MotionEvent.FLAG_CANCELED) != 0) { canceledPalm++; inProgress.cancelStroke(it, event) } else inProgress.finishStroke(event, pid, it)
        }
      }
      MotionEvent.ACTION_CANCEL -> { for ((_, id) in active) inProgress.cancelStroke(id, event); if (active.isNotEmpty()) canceledPalm++; active.clear() }
    }
  }

  // React Native does not lay out natively added children; do it explicitly.
  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) {
    val w = r - l; val h = b - t
    if (w > 0 && h > 0 && (cache?.width != w || cache?.height != h)) { cache = android.graphics.Bitmap.createBitmap(w, h, android.graphics.Bitmap.Config.ARGB_8888); cacheCanvas = Canvas(cache!!) }
    for (i in 0 until childCount) { val c = getChildAt(i); c.measure(MeasureSpec.makeMeasureSpec(w, MeasureSpec.EXACTLY), MeasureSpec.makeMeasureSpec(h, MeasureSpec.EXACTLY)); c.layout(0, 0, w, h) }
  }

  override fun onStrokesFinished(strokes: Map<InProgressStrokeId, Stroke>) {
    for (s in strokes.values) {
      finished.add(s); this.strokes++
      // Map androidx.ink inputs to sylf-ink/1 tuples [x, y, pressure, elapsedMs, tiltX, tiltY, twist, tangential].
      val batch = s.inputs; val tmp = StrokeInput(); var n = 0
      for (i in 0 until batch.size) {
        batch.populate(i, tmp)
        val tiltDeg = if (tmp.hasTilt) Math.toDegrees(tmp.tiltRadians.toDouble()) else 0.0
        val orient = if (tmp.hasOrientation) tmp.orientationRadians.toDouble() else 0.0
        @Suppress("UNUSED_VARIABLE") val tuple = doubleArrayOf(tmp.x.toDouble(), tmp.y.toDouble(), if (tmp.hasPressure) tmp.pressure.toDouble() else 0.5, tmp.elapsedTimeMillis.toDouble(), tiltDeg * Math.cos(orient), tiltDeg * Math.sin(orient), 0.0, 0.0)
        n++
      }
      lastStrokeSamples = batch.size; lastTuples = n
    }
    inProgress.removeFinishedStrokes(strokes.keys)
    finishedView.invalidate()
    maybeEmit(force = true)
  }

  private fun maybeEmit(force: Boolean = false) {
    val now = SystemClock.uptimeMillis(); val secs = (now - windowStart) / 1000.0
    if (!force && secs < 1.0) return
    val sorted = latency.sorted()
    onStats(mapOf(
      "seconds" to secs, "dispatches" to dispatches, "samples" to samples, "historicalSamples" to historical,
      "samplesPerSecond" to (if (secs > 0) samples / secs else 0.0), "dispatchesPerSecond" to (if (secs > 0) dispatches / secs else 0.0),
      "toolTypes" to HashMap(tools), "pressureMin" to pMin.toDouble(), "pressureMax" to pMax.toDouble(), "tiltMaxDeg" to tiltMax.toDouble(),
      "canceledPalm" to canceledPalm, "fingerIgnored" to fingerIgnored, "strokes" to strokes,
      "dispatchLatencyMsP50" to (sorted.getOrNull(sorted.size / 2) ?: -1L), "dispatchLatencyMsP95" to (sorted.getOrNull((sorted.size * 95) / 100) ?: -1L),
      "lastStrokeSamples" to lastStrokeSamples, "actions" to HashMap(actions), "canvasStrokes" to canvasStrokes, "lastCanvasStrokeSamples" to lastCanvasStrokeSamples, "lastError" to lastError, "inkLayer" to "${inProgress.width}x${inProgress.height}", "paperLayer" to "${finishedView.width}x${finishedView.height}", "lastStrokeSylfTuples" to lastTuples, "unbuffered" to unbuffered
    ))
    if (secs >= 1.0) { windowStart = now; dispatches = 0; samples = 0; historical = 0; latency.clear() }
  }
}
