import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./components/AuthProvider";
import { ThemeProvider } from "./components/ThemeProvider";
import SidebarWrapper from "./components/SidebarWrapper";
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
      <body className="min-h-full w-full" suppressHydrationWarning>
        <ThemeProvider>
          <AuthProvider>
            <GlobalSystemWrapper>
              <div className="min-h-screen w-full bg-transparent text-foreground flex flex-col md:flex-row overflow-x-clip">
                <SidebarWrapper />
                <main className="flex-1 w-full min-w-0 flex flex-col">
                  {children}
                </main>
              </div>
            </GlobalSystemWrapper>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
