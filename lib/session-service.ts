import crypto from "crypto";

export interface ParsedDeviceInfo {
  device: string;
  platform: string;
  icon: string;
}

export function parseUserAgent(userAgentHeader: string | null | undefined): ParsedDeviceInfo {
  if (!userAgentHeader) {
    return {
      device: "Web Browser",
      platform: "Unknown Device",
      icon: "💻",
    };
  }

  const ua = userAgentHeader.toLowerCase();

  // Detect OS
  let osName = "Unknown OS";
  let isMobile = false;
  let isMac = false;
  let isWindows = false;
  let isIOS = false;
  let isAndroid = false;

  if (ua.includes("macintosh") || ua.includes("mac os x")) {
    osName = "macOS";
    isMac = true;
  } else if (ua.includes("iphone")) {
    osName = "iOS";
    isIOS = true;
    isMobile = true;
  } else if (ua.includes("ipad")) {
    osName = "iPadOS";
    isIOS = true;
    isMobile = true;
  } else if (ua.includes("android")) {
    osName = "Android";
    isAndroid = true;
    isMobile = true;
  } else if (ua.includes("windows nt 10.0") || ua.includes("windows 11") || ua.includes("windows 10")) {
    osName = "Windows 11";
    isWindows = true;
  } else if (ua.includes("windows")) {
    osName = "Windows";
    isWindows = true;
  } else if (ua.includes("linux")) {
    osName = "Linux";
  }

  // Detect Browser
  let browserName = "Web Browser";
  if (ua.includes("edg/")) {
    browserName = "Edge";
  } else if (ua.includes("opr/") || ua.includes("opera")) {
    browserName = "Opera";
  } else if (ua.includes("chrome") && !ua.includes("chromium")) {
    browserName = "Chrome";
  } else if (ua.includes("safari") && !ua.includes("chrome")) {
    browserName = "Safari";
  } else if (ua.includes("firefox")) {
    browserName = "Firefox";
  }

  // Device title & icon
  let deviceTitle = "Desktop Device";
  let icon = "💻";

  if (isMac) {
    deviceTitle = "MacBook Pro";
    icon = "💻";
  } else if (isIOS) {
    deviceTitle = ua.includes("ipad") ? "iPad" : "iPhone";
    icon = "📱";
  } else if (isAndroid) {
    deviceTitle = "Android Device";
    icon = "📱";
  } else if (isWindows) {
    deviceTitle = "Windows Desktop";
    icon = "🖥️";
  }

  return {
    device: deviceTitle,
    platform: `${osName} • ${browserName}`,
    icon,
  };
}

export function formatLastActive(date: Date): string {
  const now = Date.now();
  const diffMs = now - new Date(date).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMin < 2) return "Active Now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHours === 1) return "1 hour ago";
  if (diffHours < 24) return `${diffHours} hours ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return new Date(date).toLocaleDateString();
}

export function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
