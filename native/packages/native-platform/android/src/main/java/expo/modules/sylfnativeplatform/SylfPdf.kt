package expo.modules.sylfnativeplatform

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.pdf.PdfRenderer
import android.os.ParcelFileDescriptor
import java.io.File
import java.io.FileOutputStream

/**
 * PDF pages on Android through the system PdfRenderer (validated in Phase 2 §5.5: its page sizes match pdf.js's scale-1 viewport
 * except for UserUnit). Originals are copied once into the app's cache under their SHA-256, and rendered pages are cached as PNGs by
 * size, so scrolling back to a page costs a file read. PdfRenderer is not thread-safe, so every call holds the renderer's lock.
 */
class SylfPdf(private val context: Context) {
  private val root get() = File(context.cacheDir, "sylf-pdf").apply { mkdirs() }
  private val renderers = HashMap<String, Pair<ParcelFileDescriptor, PdfRenderer>>()

  private fun source(key: String) = File(root, "$key.pdf")
  fun has(key: String) = source(key).exists()

  fun prepare(key: String, bytes: ByteArray): List<Map<String, Any>> {
    val file = source(key)
    if (!file.exists()) { val temp = File(root, "$key.tmp"); temp.writeBytes(bytes); temp.renameTo(file) }
    return pages(key)
  }

  @Synchronized private fun renderer(key: String): PdfRenderer {
    renderers[key]?.let { return it.second }
    val fd = ParcelFileDescriptor.open(source(key), ParcelFileDescriptor.MODE_READ_ONLY)
    val renderer = try { PdfRenderer(fd) } catch (error: Throwable) { fd.close(); throw IllegalArgumentException("This PDF could not be read. If it is password protected, add an unlocked copy.") }
    renderers[key] = Pair(fd, renderer)
    // Keep a few documents open; close the oldest beyond that.
    while (renderers.size > 4) { val oldest = renderers.keys.first(); renderers.remove(oldest)?.let { it.second.close(); it.first.close() } }
    return renderer
  }

  @Synchronized fun pages(key: String): List<Map<String, Any>> {
    val r = renderer(key)
    if (r.pageCount > 500) throw IllegalArgumentException("Choose a PDF with at most 500 pages.")
    return (0 until r.pageCount).map { i -> r.openPage(i).use { page -> mapOf("width" to page.width.toDouble(), "height" to page.height.toDouble()) } }
  }

  @Synchronized fun render(key: String, index: Int, pixelWidth: Int): String {
    val width = pixelWidth.coerceIn(64, 2400)
    val out = File(root, "$key-$index-$width.png")
    if (out.exists()) return "file://${out.absolutePath}"
    val r = renderer(key)
    r.openPage(index).use { page ->
      val height = (width.toDouble() * page.height / page.width).toInt().coerceAtLeast(1)
      val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
      bitmap.eraseColor(Color.WHITE)
      page.render(bitmap, null, null, PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY)
      val temp = File(root, "${out.name}.tmp")
      FileOutputStream(temp).use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) }
      bitmap.recycle()
      temp.renameTo(out)
    }
    return "file://${out.absolutePath}"
  }

  /** Rendered pages are a cache; the originals stay with the Notes library. */
  @Synchronized fun trimCache(keep: Set<String>) {
    root.listFiles()?.forEach { f -> if (f.name.endsWith(".png") && keep.none { f.name.startsWith("$it-") }) f.delete() }
  }
}
