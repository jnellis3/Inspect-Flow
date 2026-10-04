import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import Pwa from "./pwa";

const inter = localFont({ src: "./fonts/InterVariable.ttf", variable: "--font-inter", display: "swap" });
const interDisplay = localFont({ src: "./fonts/InterDisplay-Bold.ttf", variable: "--font-inter-display", weight: "700", display: "swap" });

export const viewport: Viewport = { width: "device-width", initialScale: 1, viewportFit: "cover", themeColor: "#0b1220" };

// Link previews need absolute image URLs. APP_ORIGIN is the public address; it is only known at
// runtime, so pages with previews (the landing pages) render per request to pick it up.
const origin = process.env.APP_ORIGIN?.trim();

export const metadata: Metadata = {
  metadataBase: origin && URL.canParse(origin) ? new URL(origin) : undefined,
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
