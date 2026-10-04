"use client";
import Link from "next/link";
import { Building2, LogOut, Plus } from "lucide-react";
import AuthGate, { Logo } from "../auth-gate";
import { Button } from "@/components/ui/button";

/** Signed-in frame for every page: header plus the page body. */
export default function Shell({ children }: { children: React.ReactNode }) {
  return (
    <AuthGate>
      {(account, logout) => (
        <div className="min-h-dvh">
          <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
            <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5">
              <Link href="/projects" className="flex items-center gap-2.5">
                <Logo className="size-8" />
                <span className="font-display text-lg font-bold tracking-tight">Inspect Flow</span>
              </Link>
              <div className="flex items-center gap-2">
                <Button asChild size="sm" className="rounded-lg"><Link href="/new"><Plus />New project</Link></Button>
                <Link href="/settings" className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-muted" aria-label="Workspace settings" title="Workspace settings">
                  <Building2 className="size-4 shrink-0 text-muted-foreground" />
                  <span className="hidden max-w-56 truncate sm:inline"><span className="font-medium">{account.workspace}</span><span className="text-muted-foreground"> · {account.username}</span></span>
                </Link>
                <Button variant="ghost" size="icon-sm" onClick={logout} aria-label="Sign out" title="Sign out"><LogOut /></Button>
              </div>
            </div>
          </header>
          <main className="mx-auto max-w-6xl px-5 pb-24 pt-8">{children}</main>
        </div>
      )}
    </AuthGate>
  );
}
