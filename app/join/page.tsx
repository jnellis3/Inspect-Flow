"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, LoaderCircle, ShieldCheck } from "lucide-react";
import { Logo } from "../auth-gate";
import { request } from "../_components/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** The invite token stays in the URL fragment, so it never reaches server logs or Referer headers. */
const invite = () => location.hash.slice(1);

/** Where an invite link lands (/join#<token>): create an account in the inviting workspace. */
export default function JoinPage() {
  const [workspace, setWorkspace] = useState<string | null | undefined>(undefined);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    request<{ workspace: string | null }>("/api/auth", { method: "POST", body: { action: "lookup", invite: invite() } })
      .then(d => setWorkspace(d.workspace))
      .catch(e => { setWorkspace(null); setError(e.message); });
  }, []);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      await request("/api/auth", { method: "POST", body: { action: "join", invite: invite(), username, password } });
      setPassword("");
      // Signed in now: start the workspace fresh (and tell other tabs).
      dispatchEvent(new Event("inspection-auth-change"));
      location.replace("/projects");
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-12">
      <Link href="/" className="mb-10 flex items-center justify-center gap-3"><Logo /><span className="font-display text-2xl font-bold tracking-tight">Inspect Flow</span></Link>
      <section className="rounded-2xl border bg-card p-7 shadow-[0_20px_60px_-30px_rgb(11_18_32/0.35)]">
        {workspace === undefined ? (
          <div className="grid h-40 place-items-center text-muted-foreground"><LoaderCircle className="animate-spin" /></div>
        ) : workspace === null ? (
          <>
            <h1 className="font-display text-3xl font-bold">This invite has expired</h1>
            <p className="mt-2 text-sm text-muted-foreground">{error || "Invite links work once and expire after 7 days."} Ask your workspace owner for a new link.</p>
            <Button asChild size="lg" variant="outline" className="mt-6 h-11 w-full bg-white"><Link href="/projects">Sign in instead</Link></Button>
          </>
        ) : (
          <>
            <h1 className="font-display text-3xl font-bold">Join {workspace}</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">Create your account to share projects with your team.</p>
            <form onSubmit={submit} className="mt-7 flex flex-col gap-5">
              <label className="flex flex-col gap-1.5 text-sm font-medium">Username
                <Input value={username} onChange={e => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={40} required className="h-11 bg-white" /></label>
              <label className="flex flex-col gap-1.5 text-sm font-medium">Passphrase
                <Input type="password" aria-describedby="passphrase-hint" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" minLength={15} maxLength={128} required className="h-11 bg-white" />
                <small id="passphrase-hint" className="font-normal text-muted-foreground">15 or more characters. A few unrelated words work well. Keep it in your password manager; there’s no recovery yet.</small></label>
              {error && <p className="rounded-lg bg-orange-50 px-3 py-2.5 text-sm text-orange-900" role="alert">{error}</p>}
              <Button size="lg" className="h-11" disabled={busy}>{busy ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}Join workspace</Button>
            </form>
          </>
        )}
      </section>
      <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" />Projects are private to your workspace.</p>
    </main>
  );
}
