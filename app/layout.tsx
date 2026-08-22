import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "./components/AuthProvider";
import { ThemeProvider } from "./components/ThemeProvider";
import SidebarWrapper from "./components/SidebarWrapper";
import { GlobalSystemWrapper } from "./components/GlobalSystemWrapper";

export const metadata: Metadata = {
  title: "The System | Study Leveling",
  description:
    "An AI-driven gamified study tracker inspired by Solo Leveling. Level up your knowledge. The System is watching.",
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
              <div className="min-h-screen w-full bg-background text-foreground flex flex-col md:flex-row overflow-x-clip">
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
