import ExpoModulesCore
import UIKit

// Unverified on device: no Xcode or iPad was available in Phase 3 (see the Phase 3 report).
public class SylfNativePlatformModule: Module {
  public func definition() -> ModuleDefinition {
    Name("SylfNativePlatform")

    // Synchronous on purpose: appearance must be known before the first frame renders.
    Function("getPreference") { (key: String) -> String? in
      UserDefaults.standard.string(forKey: "sylf.native.\(key)")
    }
    Function("setPreference") { (key: String, value: String) in
      UserDefaults.standard.set(value, forKey: "sylf.native.\(key)")
    }

    Function("getDeviceInfo") { () -> [String: Any] in
      let screen = UIScreen.main
      return [
        "model": UIDevice.current.model,
        // Apple Pencil pairing is not observable; capability is confirmed from the first pencil touch.
        "stylus": "unknown",
        "hover": "unknown",
        "refreshRates": [Double(screen.maximumFramesPerSecond)],
        "totalMemoryMb": Int(ProcessInfo.processInfo.physicalMemory / (1024 * 1024))
      ]
    }
  }
}
