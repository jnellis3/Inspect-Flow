import {randomBytes,scrypt,timingSafeEqual,createHash} from "node:crypto";
import {AppError,db} from "./server";
import {applicationOrigin} from "./origin";

export type Account = {id:string;username:string;sessionHash:string};
const SCRYPT = {N:32768,r:8,p:3,maxmem:48*1024*1024};
const hash = (value:string) => createHash("sha256").update(value).digest("hex");
const key = (password:string,salt:Buffer) => new Promise<Buffer>((resolve,reject) =>
  scrypt(password,salt,32,SCRYPT,(error,derived) => error ? reject(error) : resolve(derived)));
const secureCookies = () => applicationOrigin().protocol === 'https:';
const cookieName = () => secureCookies() ? '__Host-inspection_session' : 'inspection_session';

function cookieToken(request:Request):string {
  const prefix = cookieName() + '=';
  return (request.headers.get('cookie') || '').split(';').map(value => value.trim())
    .find(value => value.startsWith(prefix))?.slice(prefix.length) || '';
}

export function sessionCookie(_request:Request,token:string,remove=false):string {
  return `${cookieName()}=${token}; Path=/; HttpOnly; SameSite=Lax; ${secureCookies() ? 'Secure; ' : ''}Max-Age=${remove ? 0 : 7*86400}`;
}

export async function authenticate(request:Request):Promise<Account|null> {
  const token = cookieToken(request);
  if (!/^[a-f0-9]{64}$/.test(token)) return null;
  const sessionHash = hash(token);
  const now = Date.now();
  const row = await db().prepare('SELECT u.id,u.username,s.last_used FROM app_sessions s JOIN app_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>? AND s.last_used>?')
    .bind(sessionHash,now,now-86400000).first<{id:string;username:string;last_used:number}>();
  if (!row) return null;
  if (now-row.last_used > 60000) {
    await db().prepare('UPDATE app_sessions SET last_used=? WHERE token_hash=? AND expires_at>?')
      .bind(now,sessionHash,now).run();
  }
  return {id:row.id,username:row.username,sessionHash};
}

/** Conservatively limit the whole installation; untrusted proxy headers cannot bypass it. */
export async function rateLimit(username:string):Promise<void> {
  const now = Date.now();
  const window = Math.floor(now/900000);
  await db().prepare('DELETE FROM auth_attempts WHERE expires_at<?').bind(now).run();
  for (const [label,limit] of [['instance',45],[`user:${username}`,12]] as const) {
    const id = hash(label+':'+window);
    const result = await db().prepare('INSERT INTO auth_attempts (id,count,expires_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 RETURNING count')
      .bind(id,(window+1)*900000).first<{count:number}>();
    if (!result || result.count > limit) {
      throw new AppError(429,'Too many attempts. Please wait 15 minutes before trying again.');
    }
  }
}

const allowAdditionalAccounts = () => process.env.ALLOW_REGISTRATION === 'true';

export async function registrationOpen():Promise<boolean> {
  if (allowAdditionalAccounts()) return true;
  return !(await db().prepare('SELECT 1 AS present FROM app_users LIMIT 1').first<{present:number}>());
}

export async function createAccount(username:string,password:string):Promise<{id:string;username:string}> {
  if (!(await registrationOpen())) throw new AppError(403,'Account registration is closed. Sign in with an existing account.');
  if (password.length < 15 || password.length > 128) throw new AppError(400,'Use a passphrase of 15–128 characters.');
  if (['passwordpassword','123456789012345','qwertyuiopasdfgh','letmeinletmeinletmein'].includes(password.toLowerCase())) {
    throw new AppError(400,'Choose a less common passphrase.');
  }
  const salt = randomBytes(16);
  const derived = await key(password,salt);
  // This single SQLite statement arbitrates simultaneous first-user signups atomically.
  // The earlier registrationOpen check is only an optimization, never the authorization boundary.
  let account: {id:string;username:string}|null;
  try {
    account = await db().prepare('INSERT INTO app_users (id,username,password_hash,created_at) SELECT ?,?,?,? WHERE ?=1 OR NOT EXISTS (SELECT 1 FROM app_users) RETURNING id,username')
      .bind(crypto.randomUUID(),username,`scrypt-v1$${salt.toString('hex')}$${derived.toString('hex')}`,Date.now(),allowAdditionalAccounts() ? 1 : 0)
      .first<{id:string;username:string}>();
  } catch (error) {
    if (String(error).includes('UNIQUE')) throw new AppError(409,'That username is unavailable.');
    throw error;
  }
  if (!account) throw new AppError(403,'Account registration is closed. Sign in with an existing account.');
  return account;
}

export async function checkPassword(username:string,password:string):Promise<{id:string;username:string}> {
  const row = await db().prepare('SELECT id,username,password_hash FROM app_users WHERE username=?')
    .bind(username).first<{id:string;username:string;password_hash:string}>();
  const parts = row?.password_hash.split('$');
  const salt = Buffer.from(parts?.[1] || '3a2b4c5d6e7f8091a2b3c4d5e6f78901','hex');
  const expected = Buffer.from(parts?.[2] || '00'.repeat(32),'hex');
  const actual = await key(password,salt);
  if (!row || parts?.[0] !== 'scrypt-v1' || expected.length !== actual.length || !timingSafeEqual(expected,actual)) {
    throw new AppError(401,'The username or passphrase is incorrect.');
  }
  return {id:row.id,username:row.username};
}

export async function newSession(request:Request,userId:string):Promise<string> {
  const old = cookieToken(request);
  const token = randomBytes(32).toString('hex');
  const now = Date.now();
  await db().batch([
    db().prepare('DELETE FROM app_sessions WHERE token_hash=? OR expires_at<?').bind(hash(old),now),
    db().prepare('INSERT INTO app_sessions (token_hash,user_id,created_at,last_used,expires_at) VALUES (?,?,?,?,?)')
      .bind(hash(token),userId,now,now,now+7*86400000)
  ]);
  return token;
}

export async function signOut(request:Request):Promise<void> {
  await db().prepare('DELETE FROM app_sessions WHERE token_hash=?').bind(hash(cookieToken(request))).run();
}
