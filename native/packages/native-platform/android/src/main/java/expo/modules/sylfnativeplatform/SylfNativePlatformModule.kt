package expo.modules.sylfnativeplatform

import android.app.ActivityManager
import android.content.Context
import android.hardware.display.DisplayManager
import android.os.Build
import android.view.Display
import android.view.InputDevice
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

private const val PREFERENCES_FILE = "sylf_native_preferences"

class SylfNativePlatformModule : Module() {
  private val preferences
    get() = (appContext.reactContext ?: throw IllegalStateException("React context unavailable"))
      .getSharedPreferences(PREFERENCES_FILE, Context.MODE_PRIVATE)

  override fun definition() = ModuleDefinition {
    Name("SylfNativePlatform")

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
