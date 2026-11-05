package expo.modules.sylfnativeplatform

import android.app.ActivityManager
import android.content.Context
import android.hardware.display.DisplayManager
import android.os.Build
import android.view.Display
import android.view.InputDevice
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.typedarray.Uint8Array

private const val PREFERENCES_FILE = "sylf_native_preferences"

class SylfNativePlatformModule : Module() {
  private val preferences
    get() = (appContext.reactContext ?: throw IllegalStateException("React context unavailable"))
      .getSharedPreferences(PREFERENCES_FILE, Context.MODE_PRIVATE)

  private val pdf by lazy { SylfPdf(appContext.reactContext ?: throw IllegalStateException("React context unavailable")) }

  override fun definition() = ModuleDefinition {
    Name("SylfNativePlatform")

    // PDFs (Phase 14). Work runs off the JavaScript thread; each call is short and cached.
    AsyncFunction("pdfHas") { key: String -> pdf.has(key) }
    AsyncFunction("pdfPrepare") { key: String, bytes: Uint8Array ->
      val data = ByteArray(bytes.byteLength)
      bytes.read(data, 0, bytes.byteLength)
      pdf.prepare(key, data)
    }
    AsyncFunction("pdfPages") { key: String -> pdf.pages(key) }
    AsyncFunction("pdfRender") { key: String, index: Int, width: Int -> pdf.render(key, index, width) }

    // The writing surface (Phase 14).
    View(SylfInkView::class) {
      Events("onStroke", "onErase", "onPan", "onPinch", "onPenSeen")
      Prop("tool") { view: SylfInkView, value: String -> view.tool = value }
      Prop("penOnly") { view: SylfInkView, value: Boolean -> view.penOnly = value }
      Prop("fingerGestures") { view: SylfInkView, value: Boolean -> view.fingerGestures = value }
      Prop("editable") { view: SylfInkView, value: Boolean -> view.editable = value }
      Prop("inkColor") { view: SylfInkView, value: String -> view.inkColor = android.graphics.Color.parseColor(value); view.invalidate() }
      Prop("inkWidth") { view: SylfInkView, value: Double -> view.inkWidth = value.toFloat() }
      Prop("inkOpacity") { view: SylfInkView, value: Double -> view.inkOpacity = value.toFloat() }
      Prop("eraserRadius") { view: SylfInkView, value: Double -> view.eraserRadius = value.toFloat() }
      Prop("camera") { view: SylfInkView, value: List<Double> -> view.setCamera(value) }
      Prop("selectionBox") { view: SylfInkView, value: List<Double>? -> view.setSelection(value) }
      Prop("paper") { view: SylfInkView, value: String? -> view.setPaper(value) }
      AsyncFunction("upsertStrokes") { view: SylfInkView, json: String -> view.upsertStrokes(json) }
      AsyncFunction("removeStrokes") { view: SylfInkView, ids: List<String> -> view.removeStrokes(ids) }
      AsyncFunction("clearStrokes") { view: SylfInkView -> view.clearStrokes() }
      AsyncFunction("dropLive") { view: SylfInkView, id: Int -> view.dropLive(id) }
    }

    // Synchronous on purpose: appearance must be known before the first frame renders.
    Function("getPreference") { key: String -> preferences.getString(key, null) }
    Function("setPreference") { key: String, value: String -> preferences.edit().putString(key, value).apply() }

    Function("getDeviceInfo") {
      val context = appContext.reactContext ?: throw IllegalStateException("React context unavailable")
      // Use system services rather than a view/activity context; works before any window exists.
      val display = (context.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager).getDisplay(Display.DEFAULT_DISPLAY)
      val memory = ActivityManager.MemoryInfo().also { (context.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager).getMemoryInfo(it) }
      val stylus = InputDevice.getDeviceIds().any { id ->
        InputDevice.getDevice(id)?.supportsSource(InputDevice.SOURCE_STYLUS) == true
      }
      mapOf(
        "model" to "${Build.MANUFACTURER} ${Build.MODEL}",
        "stylus" to stylus,
        // Hover support depends on the pen, not the digitizer; it is confirmed from the first hover event.
        "hover" to "unknown",
        "refreshRates" to (display?.supportedModes?.map { it.refreshRate.toDouble() }?.distinct()?.sorted() ?: emptyList()),
        "totalMemoryMb" to (memory.totalMem / (1024 * 1024))
      )
    }
  }
}
