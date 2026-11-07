package expo.modules.sylfnativeplatform

import android.annotation.SuppressLint
import android.content.Context
import android.view.MotionEvent
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlin.math.hypot

/**
 * Two-finger zoom for a paged document, wherever the fingers are: on a page, in the margin beside it, in the gap between pages, or
 * one finger on each of two pages. It watches the touches going to the pages and scroll views inside it and, when a second finger
 * lands with both on the glass as fingers, takes the gesture from them (they hear a cancel) and reports it as `onPinch`, as a page's
 * own surface does: `phase`, the scale since the fingers landed, and the point between them on the screen, in layout points. A pen
 * with a palm resting beside it is never a pinch.
 */
@SuppressLint("ViewConstructor")
class SylfPinchArea(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onPinch by EventDispatcher()

  var pinchEnabled = true
  private var startSpread = 0f
  private var pinching = false
  private var ended = false
  private val last = floatArrayOf(1f, 0f, 0f)
  private val density get() = resources.displayMetrics.density

  // What it holds is scaled down while zooming out and must be drawn past its own bounds; the view around this one clips to the screen.
  init { clipChildren = false; clipToPadding = false }

  // React Native places the children; Android's own linear layout must not move them.
  override fun onLayout(changed: Boolean, l: Int, t: Int, r: Int, b: Int) = Unit
  override fun onMeasure(widthMeasureSpec: Int, heightMeasureSpec: Int) =
    setMeasuredDimension(MeasureSpec.getSize(widthMeasureSpec), MeasureSpec.getSize(heightMeasureSpec))

  // A page drawing or a scroll view dragging asks its parents to keep out. This area still watches (it only ever takes two fingers),
  // and passes the request on so nothing above it takes the gesture either.
  override fun requestDisallowInterceptTouchEvent(disallowIntercept: Boolean) {
    parent?.requestDisallowInterceptTouchEvent(disallowIntercept)
  }

  override fun onInterceptTouchEvent(event: MotionEvent): Boolean {
    if (event.actionMasked == MotionEvent.ACTION_DOWN) { pinching = false; ended = false }
    if (pinching) return true
    if (!pinchEnabled || event.actionMasked != MotionEvent.ACTION_POINTER_DOWN || event.pointerCount != 2) return false
    if ((0 until 2).any { event.getToolType(it) != MotionEvent.TOOL_TYPE_FINGER }) return false
    startSpread = spread(event)
    if (startSpread <= 0f) return false
    pinching = true
    parent?.requestDisallowInterceptTouchEvent(true)
    emit(event, "start")
    return true
  }

  @SuppressLint("ClickableViewAccessibility")
  override fun onTouchEvent(event: MotionEvent): Boolean {
    if (!pinching) return false
    when (event.actionMasked) {
      MotionEvent.ACTION_MOVE -> if (!ended && event.pointerCount >= 2) emit(event, "move")
      // The pinch ends when a hand lifts a finger; the other finger then does nothing until it lifts.
      MotionEvent.ACTION_POINTER_UP -> if (!ended && event.pointerCount <= 2) end()
      MotionEvent.ACTION_UP, MotionEvent.ACTION_CANCEL -> {
        if (!ended) end()
        pinching = false
        parent?.requestDisallowInterceptTouchEvent(false)
      }
    }
    return true
  }

  private fun end() {
    ended = true
    // The end repeats the last reading: once a finger lifts there is no spread left to measure.
    onPinch(mapOf("phase" to "end", "scale" to last[0].toDouble(), "factor" to 1.0, "x" to last[1].toDouble(), "y" to last[2].toDouble()))
  }

  /** Measured on the screen, never in this view: what is inside it is scaled while it is pinched. */
  private fun emit(event: MotionEvent, phase: String) {
    var x = 0f; var y = 0f
    val n = minOf(2, event.pointerCount)
    for (i in 0 until n) { val p = raw(event, i); x += p[0]; y += p[1] }
    val d = spread(event)
    last[0] = if (startSpread > 0 && d > 0) d / startSpread else 1f
    last[1] = x / n / density; last[2] = y / n / density
    onPinch(mapOf("phase" to phase, "scale" to last[0].toDouble(), "factor" to 1.0, "x" to last[1].toDouble(), "y" to last[2].toDouble()))
  }

  private fun raw(event: MotionEvent, i: Int): FloatArray =
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.Q) floatArrayOf(event.getRawX(i), event.getRawY(i))
    else floatArrayOf(event.getX(i) + event.rawX - event.getX(0), event.getY(i) + event.rawY - event.getY(0))

  private fun spread(event: MotionEvent): Float {
    if (event.pointerCount < 2) return 0f
    val a = raw(event, 0); val b = raw(event, 1)
    return hypot(a[0] - b[0], a[1] - b[1])
  }
}
