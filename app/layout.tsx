import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./components/AuthProvider";
import { ThemeProvider } from "./components/ThemeProvider";
import { SylfAppShell } from "./components/SylfAppShell";
import { GlobalSystemWrapper } from "./components/GlobalSystemWrapper";

export const metadata: Metadata = {
  title: "Sylf — Study Leveling",
  description:
    "Sylf turns your coursework and exam prep into structured AI quests, XP, ranks, and cognitive stat growth. Join the early access waitlist.",
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
