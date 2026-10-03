import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Pwa from "./pwa";

const inter = localFont({ src: "./fonts/InterVariable.ttf", variable: "--font-inter", display: "swap" });
const interDisplay = localFont({ src: "./fonts/InterDisplay-Bold.ttf", variable: "--font-inter-display", weight: "700", display: "swap" });

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0b1220" };

export const metadata: Metadata = {
  title: "Inspect Flow",
  description: "Turn a walkthrough video into a narrated highlight reel and report your clients will actually watch.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Inspect Flow", statusBarStyle: "default" },
  icons: { apple: "/icons/apple-touch-icon.png", icon: "/favicon.svg", shortcut: "/favicon.svg" },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${inter.variable} ${interDisplay.variable}`}>
      <body>{children}<Pwa /></body>
    </html>
  );
}
