import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Link from "next/link";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Arbisoft Internship SPA",
  description: "Phase 1 Web Application",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {/* Shared Navigation Component */}
        <nav className="w-full flex justify-center gap-8 p-6 border-b border-gray-800">
          <Link href="/" className="hover:text-blue-400 transition-colors">
            Home
          </Link>
          <Link href="/about" className="hover:text-blue-400 transition-colors">
            About
          </Link>
          <Link
            href="/contact"
            className="hover:text-blue-400 transition-colors"
          >
            Contact
          </Link>
          <Link href="/users" className="hover:text-blue-400 transition-colors">
            Users
          </Link>
          <Link href="/notes" className="hover:text-blue-400 transition-colors">
            Notes
          </Link>
          <Link href="/register" className="hover:text-blue-400 transition-colors">
            Register
          </Link>
          <Link href="/login" className="hover:text-blue-400 transition-colors">
            Log In
          </Link>

        </nav>

        {/* Dynamic Route Payload */}
        <main className="flex-grow">{children}</main>
      </body>
    </html>
  );
}

