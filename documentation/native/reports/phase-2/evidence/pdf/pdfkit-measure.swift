// Renders each page with macOS PDFKit at 1 px/pt and locates the red marker; compares with pdf.js predictions.
import Foundation
import PDFKit
import CoreGraphics
struct Pred: Decodable { let id: String; let pdfjs: P; struct P: Decodable { let width: Double; let height: Double; let rotation: Int; let userUnit: Double; let marker: [Double] } }
let preds = try JSONDecoder().decode([Pred].self, from: Data(contentsOf: URL(fileURLWithPath: "pdfjs-predictions.json")))
guard let doc = PDFDocument(url: URL(fileURLWithPath: "geometry.pdf")) else { fatalError("open failed") }
var results: [[String: Any]] = []
for (i, pr) in preds.enumerated() {
  let page = doc.page(at: i)!
  let crop = page.bounds(for: .cropBox), rot = page.rotation
  let sideways = rot % 180 != 0
  let w = Int((sideways ? crop.height : crop.width).rounded()), h = Int((sideways ? crop.width : crop.height).rounded())
  let cs = CGColorSpaceCreateDeviceRGB()
  let ctx = CGContext(data: nil, width: w, height: h, bitsPerComponent: 8, bytesPerRow: w*4, space: cs, bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
  ctx.setFillColor(CGColor(red: 1, green: 1, blue: 1, alpha: 1)); ctx.fill(CGRect(x: 0, y: 0, width: w, height: h))
  // draw(with:to:) applies the crop-box origin and rotation itself.
  page.draw(with: .cropBox, to: ctx)
  let buf = ctx.data!.assumingMemoryBound(to: UInt8.self)
  var sx = 0.0, sy = 0.0, n = 0.0
  for y in 0..<h { for x in 0..<w { let o = y*w*4 + x*4; if buf[o] > 200 && buf[o+1] < 60 && buf[o+2] < 60 { sx += Double(x)+0.5; sy += Double(y)+0.5; n += 1 } } }
  // CGContext bitmap memory row 0 is the top row for this context, matching pdf.js top-left origin.
  let found = n > 0 ? [sx/n, sy/n] : [-1, -1]
  let dx = found[0] - pr.pdfjs.marker[0], dy = found[1] - pr.pdfjs.marker[1]
  results.append(["id": pr.id, "pdfkitSize": [w, h], "pdfjsSize": [pr.pdfjs.width, pr.pdfjs.height], "rotation": rot, "pdfjsUserUnit": pr.pdfjs.userUnit, "pdfkitMarker": found, "pdfjsMarker": pr.pdfjs.marker, "errorPx": (dx*dx+dy*dy).squareRoot(), "markerPixels": n])
  print(String(format: "%-22@ pdfkit %4dx%-4d pdfjs %4.0fx%-4.0f rot %3d  marker pdfkit (%.1f,%.1f) pdfjs (%.1f,%.1f) err %.2f px", pr.id as NSString, w, h, pr.pdfjs.width, pr.pdfjs.height, rot, found[0], found[1], pr.pdfjs.marker[0], pr.pdfjs.marker[1], (dx*dx+dy*dy).squareRoot()))
}
let json = try JSONSerialization.data(withJSONObject: results, options: [.prettyPrinted, .sortedKeys])
try json.write(to: URL(fileURLWithPath: "pdfkit-results.json"))
