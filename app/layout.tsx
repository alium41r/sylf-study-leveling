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
            __html: `(function(){try{function lum(h){var s=h.slice(1);if(s.length===3)s=s[0]+s[0]+s[1]+s[1]+s[2]+s[2];var r=parseInt(s.slice(0,2),16)/255,g=parseInt(s.slice(2,4),16)/255,bl=parseInt(s.slice(4,6),16)/255;r=r<=0.03928?r/12.92:Math.pow((r+0.055)/1.055,2.4);g=g<=0.03928?g/12.92:Math.pow((g+0.055)/1.055,2.4);bl=bl<=0.03928?bl/12.92:Math.pow((bl+0.055)/1.055,2.4);return 0.2126*r+0.7152*g+0.0722*bl;}var b=localStorage.getItem("app_background")||"simple";if(b==="simple-black"||b==="simple-white"||b==="black"||b==="white"||b==="pure-black"||b==="pure-white"||b==="void"||b==="none"||b==="default"){b="simple";}var isHex=/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(b);var sm=localStorage.getItem("app_mode");var m=sm==="light"||sm==="dark"?sm:isHex?(lum(b)>0.35?"light":"dark"):"dark";document.documentElement.setAttribute("data-mode",m);if(m==="dark"){document.documentElement.classList.add("dark");}else{document.documentElement.classList.remove("dark");}var c=isHex?b.toLowerCase():(m==="light"?"#ffffff":"#000000");var p=isHex?(lum(c)>0.35?"light":"dark"):(m==="light"?"light":"dark");document.documentElement.setAttribute("data-app-background",b==="simple"||c==="#000000"||c==="#ffffff"?"simple":isHex?"custom":b);document.documentElement.setAttribute("data-surface-polarity",p);document.documentElement.style.colorScheme=p;document.documentElement.style.backgroundColor=c;}catch(e){}})();`,
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
