"use client";
import { useEffect, useState } from "react";

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Registers the service worker and offers "install app" where the browser supports it. */
export default function Pwa() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [ios, setIos] = useState(false);
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {});
    const onPrompt = (event: Event) => { event.preventDefault(); setPrompt(event as InstallEvent); };
    addEventListener("beforeinstallprompt", onPrompt);
    // iOS has no install prompt; suggest Add to Home Screen once the page has settled.
    const timer = setTimeout(() => setIos(/iPad|iPhone|iPod/.test(navigator.userAgent) && !matchMedia("(display-mode: standalone)").matches), 0);
    return () => { removeEventListener("beforeinstallprompt", onPrompt); clearTimeout(timer); };
  }, []);
  if (!prompt && !ios) return null;
  return (
    <aside className="pwa-install" aria-label="Install Inspect Flow">
      {prompt
        ? <button onClick={async () => { await prompt.prompt(); await prompt.userChoice; setPrompt(null); }}>Install Inspect Flow</button>
        : <span>On iPhone: Share → Add to Home Screen</span>}
      <button aria-label="Dismiss install suggestion" onClick={() => { setPrompt(null); setIos(false); }}>×</button>
    </aside>
  );
}
