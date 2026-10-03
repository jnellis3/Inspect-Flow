"use client";
import {useEffect,useState,useCallback} from "react";
import Link from "next/link";
import {House,ShieldCheck,LoaderCircle,ArrowRight} from "lucide-react";

type Account = {id:string;username:string};
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
      const data = await call('POST',{action:mode,username,password});
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
    document.addEventListener('visibilitychange',sync);
    return () => {
      broadcast?.close();
      removeEventListener('inspection-auth-change',notifyPeers);
      removeEventListener('pageshow',sync);
      document.removeEventListener('visibilitychange',sync);
    };
  },[applyAuth]);

  if (loading) return <div className="loading-state"><LoaderCircle className="spin"/><p>Opening your workspace…</p></div>;
  if (account) return <>{children(account,logout)}{error && <div className="session-error" role="alert">{error}<button onClick={() => setError('')}>Dismiss</button></div>}</>;
  return <main className="auth-page">
    <Link href="/" className="brand"><span className="brand-mark"><House size={23}/></span><span>Inspect Flow<span className="brand-sub">INSPECTION STUDIO</span></span></Link>
    <section className="auth-card">
      <span className="eyebrow">YOUR INSPECTION WORKSPACE</span>
      <h1>{mode === 'signup' ? 'Create your account.' : 'Welcome back.'}</h1>
      <p>{mode === 'signup' ? 'Keep your inspections, evidence and reports together.' : 'Sign in to continue your inspections.'}</p>
      <form onSubmit={submit} className="form-stack">
        <label>Username<input value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} minLength={3} maxLength={40} required/></label>
        <label>Passphrase<input type="password" aria-label="Passphrase" aria-describedby={mode === 'signup' ? 'passphrase-hint' : undefined} value={password} onChange={event => setPassword(event.target.value)} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} minLength={mode === 'signup' ? 15 : 1} maxLength={128} required/>{mode === 'signup' && <small id="passphrase-hint">Use 15–128 characters. A few unrelated words work well. Store it in your password manager; recovery is not available yet.</small>}</label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn primary" disabled={busy || (mode === 'signup' && !registrationOpen)}>{busy ? <LoaderCircle className="spin"/> : <ArrowRight/>}{mode === 'signup' ? 'Create account' : 'Sign in'}</button>
      </form>
      {registrationOpen && <p className="auth-switch">{mode === 'signup' ? 'Already have an account?' : 'New here?'} <button disabled={busy} onClick={() => {setMode(mode === 'signup' ? 'login' : 'signup');setError('');setPassword('');}}>{mode === 'signup' ? 'Sign in' : 'Create an account'}</button></p>}
    </section>
    <p className="auth-boundary"><ShieldCheck size={15}/>Your account provides access to your saved inspections.</p>
  </main>;
}
