import type { Metadata, Viewport } from "next";
import "./globals.css";
import Pwa from "./pwa";
export const viewport:Viewport={width:"device-width",initialScale:1,viewportFit:"cover",themeColor:"#173246"};

export const metadata: Metadata = {
  title: "Walkthrough · Inspection Studio",
  description: "Review walkthrough footage, refine findings, and prepare matching homeowner videos and reports.",
  manifest:"/manifest.webmanifest",
  appleWebApp:{capable:true,title:"Walkthrough",statusBarStyle:"default"},
  icons: {
    apple:"/icons/apple-touch-icon.png",
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}<Pwa/></body>
    </html>
  );
}
