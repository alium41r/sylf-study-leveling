import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AuthProvider } from "./components/AuthProvider";
import { ThemeProvider } from "./components/ThemeProvider";
import { SylfAppShell } from "./components/SylfAppShell";
import { GlobalSystemWrapper } from "./components/GlobalSystemWrapper";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f5f2" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
};

export const metadata: Metadata = {
  title: "Sylf — Study Leveling",
  applicationName: "Sylf",
  description:
    "Sylf turns your coursework and exam prep into structured AI quests, XP, ranks, and cognitive stat growth. Join the early access waitlist.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Sylf",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/favicon.ico" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
  },
  other: {
    "mobile-web-app-capable": "yes",
  },
  openGraph: {
    title: "Sylf — Study Leveling",
    description:
      "Turn every study hour into rank & progression. AI quests, XP, streaks, and cognitive stat growth.",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full"
      suppressHydrationWarning
    >
      <head suppressHydrationWarning>
        <script
          id="sylf-theme-init"
          suppressHydrationWarning
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var m=localStorage.getItem("app_mode")||"dark";document.documentElement.setAttribute("data-mode",m);if(m==="dark"){document.documentElement.classList.add("dark");}else{document.documentElement.classList.remove("dark");}var b=localStorage.getItem("app_background")||"simple";if(b==="simple-black"||b==="simple-white"||b==="black"||b==="white"||b==="pure-black"||b==="pure-white"||b==="void"||b==="none"||b==="default"){b="simple";}document.documentElement.setAttribute("data-app-background",b);if(b==="simple"||b==="#000000"||b==="#ffffff"||b==="pure-black"||b==="pure-white"){document.documentElement.style.backgroundColor=m==="light"?"#ffffff":"#000000";}}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-full w-full" suppressHydrationWarning>
        <ThemeProvider>
          <AuthProvider>
            <GlobalSystemWrapper>
              <SylfAppShell>
                {children}
              </SylfAppShell>
            </GlobalSystemWrapper>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
