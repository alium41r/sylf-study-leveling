import type { NextConfig } from "next";

// ─── S3 security headers ──────────────────────────────────────────
// Carefully scoped CSP that keeps the app working:
//   • script-src 'self' 'unsafe-inline' — Next.js App Router ships inline
//     bootstrap scripts (RSC payload); removing 'unsafe-inline' breaks every
//     page without a nonce pipeline.
//   • style-src/style-src-attr 'unsafe-inline' — framer-motion drives
//     animation through inline style attributes; Tailwind v4 compiles to
//     stylesheets, KaTeX assets are self-hosted.
//   • connect-src adds the Supabase Realtime websocket origin (derived from
//     NEXT_PUBLIC_SUPABASE_URL) — the only third-party connection the client
//     opens besides same-origin API calls.
//   • img-src allows data:/blob:/https: for user avatars and uploads.
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin
  : null;
const connectSrc = [
  "'self'",
  ...(supabaseOrigin ? [supabaseOrigin, supabaseOrigin.replace(/^https/, "wss")] : []),
].join(" ");

// React/Next dev tooling needs eval() to rebuild callstacks; production never
// does. Keep 'unsafe-eval' OUT of the production CSP (verified on the prod
// build) and only add it for `next dev`.
const isDev = process.env.NODE_ENV !== "production";
const scriptSrc = ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", ...(isDev ? ["'unsafe-eval'"] : [])].join(" ");

const securityHeaders = [
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      `script-src ${scriptSrc}`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "style-src-elem 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "style-src-attr 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https://fonts.gstatic.com",
      "media-src 'self' data: blob:",
      `connect-src ${connectSrc} https://fonts.googleapis.com https://fonts.gstatic.com https://huggingface.co https://*.hf.co https://*.huggingface.co`,
      "worker-src 'self' blob:",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "object-src 'none'",
    ].join("; "),
  },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=(), payment=(), usb=()",
  },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  // Disposable browser qualification must not replace a concurrent dev build.
  distDir: process.env.SYLF_TEST_DIST_DIR || ".next",
  outputFileTracingIncludes: {
    "/api/system-messages/chat": ["./lib/ai/sylvie/{persona,knowledge,capabilities}.md"],
  },
  experimental: {
    // Four images share a 12 MiB application cap, plus multipart framing.
    proxyClientMaxBodySize: "13mb",
    optimizePackageImports: ["lucide-react"],
  },
  async rewrites() {
    return { beforeFiles: [{ source: "/uploads/:filename", destination: "/api/system-messages/legacy-images/:filename" }] };
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
