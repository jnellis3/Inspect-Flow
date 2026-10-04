"use client";
import {useEffect,useState,useCallback} from "react";
import Link from "next/link";
import {Play,ShieldCheck,LoaderCircle,ArrowRight} from "lucide-react";
import {Button} from "@/components/ui/button";
import {cn} from "@/lib/utils";
import {Input} from "@/components/ui/input";

export type Account = {id:string;username:string;workspace:string;role:'owner'|'member'};
type AuthResponse = {account?:Account|null;registrationOpen:boolean;error?:string};

async function call(method:string,body?:unknown):Promise<AuthResponse> {
  const response = await fetch('/api/auth',{
    method,
    headers:{'Content-Type':'application/json','X-Inspection-Request':'1'},
    body:body ? JSON.stringify(body) : undefined,
    cache:'no-store'
  });
  const data = await response.json() as AuthResponse;
  if (!response.ok) throw new Error(data.error || 'Please try again.');
  return data;
}

export default function AuthGate({children}:{children:(account:Account,logout:()=>void)=>React.ReactNode}) {
  const [account,setAccount] = useState<Account|null>(null);
  const [loading,setLoading] = useState(true);
  const [registrationOpen,setRegistrationOpen] = useState(false);
  const [mode,setMode] = useState<'login'|'signup'>('login');
  const [company,setCompany] = useState('');
  const [username,setUsername] = useState('');
  const [password,setPassword] = useState('');
  const [error,setError] = useState('');
  const [busy,setBusy] = useState(false);
  const applyAuth = useCallback((data:AuthResponse) => {
    setAccount(data.account || null);
    setRegistrationOpen(data.registrationOpen === true);
    if (!data.registrationOpen) setMode('login');
  },[]);

  useEffect(() => {
    void call('GET').then(applyAuth).catch(error => setError(error.message)).finally(() => setLoading(false));
  },[applyAuth]);

  async function submit(event:React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await call('POST',mode === 'signup' ? {action:mode,company,username,password} : {action:mode,username,password});
      setPassword('');
      applyAuth(data);
      dispatchEvent(new Event('inspection-auth-change'));
    } catch (error) {
      setError((error as Error).message);
      // Another browser may have claimed the installation's first account.
      await call('GET').then(applyAuth).catch(() => {});
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    setBusy(true);
    try {
      const data = await call('DELETE');
      navigator.serviceWorker?.controller?.postMessage({type:'LOGOUT'});
      applyAuth(data);
      setMode('login');
      setPassword('');
      dispatchEvent(new Event('inspection-auth-change'));
      history.replaceState(null,'','/');
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const expired = () => {
      setAccount(null);
      setMode('login');
      setPassword('');
      setError('Your session ended. Sign in again to continue.');
    };
    addEventListener('inspection-session-expired',expired);
    return () => removeEventListener('inspection-session-expired',expired);
  },[]);

  useEffect(() => {
    const sync = () => {
      if (document.visibilityState !== 'hidden') void call('GET').then(applyAuth).catch(() => {});
    };
    const broadcast = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('inspection-session');
    const notifyPeers = () => broadcast?.postMessage('changed');
    addEventListener('inspection-auth-change',notifyPeers);
    if (broadcast) broadcast.onmessage = () => {
      setPassword('');
      void call('GET').then(applyAuth).catch(() => {});
    };
    addEventListener('pageshow',sync);
    addEventListener('inspection-workspace-change',sync);
    document.addEventListener('visibilitychange',sync);
    return () => {
      broadcast?.close();
      removeEventListener('inspection-auth-change',notifyPeers);
      removeEventListener('pageshow',sync);
      removeEventListener('inspection-workspace-change',sync);
      document.removeEventListener('visibilitychange',sync);
    };
  },[applyAuth]);

  if (loading) return <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-muted-foreground"><LoaderCircle className="size-6 animate-spin" /><p className="text-sm">Opening your workspace…</p></div>;
  if (account) return <>{children(account, logout)}{error && <div className="fixed bottom-5 left-5 z-50 flex items-center gap-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900 shadow-lg" role="alert">{error}<button className="font-semibold underline" onClick={() => setError('')}>Dismiss</button></div>}</>;
  return <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-12">
    <Link href="/" className="mb-10 flex items-center justify-center gap-3"><Logo /><span className="font-display text-2xl font-bold tracking-tight">Inspect Flow</span></Link>
    <section className="rounded-2xl border bg-card p-7 shadow-[0_20px_60px_-30px_rgb(11_18_32/0.35)]">
      <h1 className="font-display text-3xl font-bold">{mode === 'signup' ? 'Create your workspace' : 'Welcome back'}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{mode === 'signup' ? 'Turn walkthroughs into videos and reports your clients will actually watch.' : 'Sign in to your inspection workspace.'}</p>
      <form onSubmit={submit} className="mt-7 flex flex-col gap-5">
        {mode === 'signup' && <label className="flex flex-col gap-1.5 text-sm font-medium">Company name
          <Input value={company} onChange={event => setCompany(event.target.value)} autoComplete="organization" maxLength={120} required className="h-11 bg-white" />
          <small className="font-normal text-muted-foreground">Shown in your videos and reports. Your teammates can join later with an invite link.</small></label>}
        <label className="flex flex-col gap-1.5 text-sm font-medium">Username
          <Input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={40} required className="h-11 bg-white" /></label>
        <label className="flex flex-col gap-1.5 text-sm font-medium">Passphrase
          <Input type="password" aria-describedby={mode === 'signup' ? 'passphrase-hint' : undefined} value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={mode === 'signup' ? 15 : 1} maxLength={128} required className="h-11 bg-white" />
          {mode === 'signup' && <small id="passphrase-hint" className="font-normal text-muted-foreground">15 or more characters. A few unrelated words work well. Keep it in your password manager; there’s no recovery yet.</small>}</label>
        {error && <p className="rounded-lg bg-orange-50 px-3 py-2.5 text-sm text-orange-900" role="alert">{error}</p>}
        <Button size="lg" className="h-11" disabled={busy || (mode === 'signup' && !registrationOpen)}>{busy ? <LoaderCircle className="animate-spin" /> : <ArrowRight />}{mode === 'signup' ? 'Create account' : 'Sign in'}</Button>
      </form>
      {registrationOpen && <p className="mt-6 text-center text-sm text-muted-foreground">{mode === 'signup' ? 'Already have an account?' : 'New here?'} <button className="font-semibold text-foreground underline-offset-4 hover:underline" disabled={busy} onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(''); setPassword(''); }}>{mode === 'signup' ? 'Sign in' : 'Create an account'}</button></p>}
    </section>
    <p className="mt-6 flex items-center justify-center gap-2 text-xs text-muted-foreground"><ShieldCheck className="size-3.5" />Your projects are private to your workspace.</p>
  </main>;
}

export function Logo({ className = "" }: { className?: string }) {
  return <span className={cn("grid size-9 place-items-center rounded-xl bg-primary text-highlight", className)}><Play className="size-4 translate-x-px fill-current" /></span>;
}
