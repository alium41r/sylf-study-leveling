import type { Metadata } from "next";
import { Inter, Rajdhani } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "./components/AuthProvider";
import { ThemeProvider } from "./components/ThemeProvider";
import SidebarWrapper from "./components/SidebarWrapper";
import { GlobalSystemWrapper } from "./components/GlobalSystemWrapper";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const rajdhani = Rajdhani({
  variable: "--font-rajdhani",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

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
      className={`${inter.variable} ${rajdhani.variable} h-full`}
    >
      <body className="min-h-full flex">
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
