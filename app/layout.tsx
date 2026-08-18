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
      <body className="min-h-full flex" suppressHydrationWarning>
        <ThemeProvider>
          <AuthProvider>
            <GlobalSystemWrapper>
              <SidebarWrapper />
              <main className="flex-grow min-h-screen">{children}</main>
            </GlobalSystemWrapper>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
