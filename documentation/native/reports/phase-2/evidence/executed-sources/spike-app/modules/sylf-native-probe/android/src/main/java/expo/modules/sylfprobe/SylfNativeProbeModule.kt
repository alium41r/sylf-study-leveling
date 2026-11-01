package expo.modules.sylfprobe

import android.app.ActivityManager
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.Build
import android.os.ParcelFileDescriptor
import android.util.Base64
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File

class SylfNativeProbeModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("SylfNativeProbe")

    // Renders each page at 1 px/pt with PdfRenderer and returns the red marker centroid (top-left origin).
    AsyncFunction("pdfMarkers") { base64: String ->
      val ctx = appContext.reactContext ?: throw IllegalStateException("no context")
      val file = File(ctx.cacheDir, "geometry.pdf").apply { writeBytes(Base64.decode(base64, Base64.DEFAULT)) }
      val out = mutableListOf<Map<String, Any>>()
      ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_ONLY).use { fd ->
        PdfRenderer(fd).use { renderer ->
          for (i in 0 until renderer.pageCount) {
            renderer.openPage(i).use { page ->
              val w = page.width; val h = page.height
              val bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
              bmp.eraseColor(Color.WHITE)
              page.render(bmp, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
              var sx = 0.0; var sy = 0.0; var n = 0
              val row = IntArray(w)
              for (y in 0 until h) {
                bmp.getPixels(row, 0, w, 0, y, w, 1)
                for (x in 0 until w) { val c = row[x]; if (Color.red(c) > 200 && Color.green(c) < 60 && Color.blue(c) < 60) { sx += x + 0.5; sy += y + 0.5; n++ } }
              }
              bmp.recycle()
              out.add(mapOf("page" to i, "width" to w, "height" to h, "marker" to listOf(if (n > 0) sx / n else -1.0, if (n > 0) sy / n else -1.0), "pixels" to n))
            }
          }
        }
      }
      out
    }

    Function("deviceInfo") {
      val ctx = appContext.reactContext!!
      val am = ctx.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      val mi = ActivityManager.MemoryInfo().also { am.getMemoryInfo(it) }
      val display = (ctx.getSystemService(Context.DISPLAY_SERVICE) as android.hardware.display.DisplayManager).getDisplay(android.view.Display.DEFAULT_DISPLAY)
      mapOf(
        "model" to Build.MODEL, "manufacturer" to Build.MANUFACTURER, "sdk" to Build.VERSION.SDK_INT, "release" to Build.VERSION.RELEASE,
        "soc" to (if (Build.VERSION.SDK_INT >= 31) Build.SOC_MODEL else "?"), "totalMemMb" to (mi.totalMem / 1048576), "memoryClassMb" to am.memoryClass,
        "refreshRate" to (display?.refreshRate ?: 0f).toDouble(), "supportedRefreshRates" to (display?.supportedModes?.map { it.refreshRate }?.distinct()?.joinToString(",") ?: "")
      )
    }

    View(NativeInkView::class) {
      Events("onStats")
      Prop("stylusOnly") { view: NativeInkView, value: Boolean -> view.stylusOnly = value }
    }
  }
}
