import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';

/** Every account and passphrase in this suite is a disposable synthetic fixture. */
test('self-hosted authentication and origin boundaries',async suite => {
  const directory = await mkdtemp(join(tmpdir(),'inspect-flow-auth-test-'));
  const savedEnvironment = {
    DATA_DIR:process.env.DATA_DIR,
    APP_ORIGIN:process.env.APP_ORIGIN,
    ALLOW_REGISTRATION:process.env.ALLOW_REGISTRATION
  };
  process.env.DATA_DIR = directory;
  process.env.APP_ORIGIN = 'http://localhost:3000';
  process.env.ALLOW_REGISTRATION = 'false';

  let database:ReturnType<typeof import('../lib/inspection/server').db>|undefined;
  try {
    const auth = await import('../lib/inspection/auth');
    const origin = await import('../lib/inspection/origin');
    const {db} = await import('../lib/inspection/server');
    database = db();
    const localRequest = () => new Request('http://localhost:3000/api/auth',{headers:{origin:'http://localhost:3000'}});
    const authenticatedRequest = (token:string) => new Request('http://localhost:3000/api/auth',{headers:{cookie:`inspection_session=${token}`}});
    const fixturePassphrase = 'Disposable test fixture passphrase 4837';
    let firstAccount:{id:string;username:string};

    await suite.test('requires the configured origin and refuses remote plaintext origins',() => {
      origin.assertRequestOrigin(localRequest());
      const rejectedHeaders:Record<string,string>[] = [
        {},
        {origin:'https://attacker.example'},
        {origin:'http://localhost:3000','sec-fetch-site':'cross-site'}
      ];
      for (const headers of rejectedHeaders) {
        assert.throws(() => origin.assertRequestOrigin(new Request('http://localhost:3000/api/auth',{headers})),
          (error:unknown) => error instanceof Error && 'status' in error && error.status === 403);
      }
      for (const configured of ['http://inspection.example','https://inspection.example/path','https://' + ['fixture-name','fixture-password'].join(':') + '@inspection.example','https://inspection.example?parameter=1']) {
        process.env.APP_ORIGIN = configured;
        assert.throws(() => origin.applicationOrigin(),/APP_ORIGIN/);
      }
      delete process.env.APP_ORIGIN;
      assert.equal(origin.applicationOrigin().origin,'http://localhost:3000');
      process.env.APP_ORIGIN = 'http://[::1]:3000';
      assert.equal(origin.applicationOrigin().origin,'http://[::1]:3000');
      process.env.APP_ORIGIN = 'http://localhost:3000';
    });

    await suite.test('derives cookie security from configuration, never host or proxy headers',async () => {
      const spoofed = new Request('http://untrusted-host.example/api/auth',{
        headers:{'x-forwarded-host':'localhost:3000','x-forwarded-proto':'http','cf-connecting-ip':'127.0.0.1','oai-authenticated-user-id':'fixture-forged-user'}
      });
      process.env.APP_ORIGIN = 'https://inspection.example';
      const secure = auth.sessionCookie(spoofed,'fixture-token');
      assert.match(secure,/^__Host-inspection_session=fixture-token;/);
      assert.match(secure,/; Secure;/);
      assert.match(secure,/; HttpOnly;/);
      assert.match(secure,/; SameSite=Lax;/);
      assert(!secure.includes('Domain='));
      assert.match(auth.sessionCookie(spoofed,'',true),/Max-Age=0$/);
      assert.equal(await auth.authenticate(spoofed),null);
      process.env.APP_ORIGIN = 'http://localhost:3000';
      const local = auth.sessionCookie(new Request('https://untrusted-host.example'),'fixture-token');
      assert.match(local,/^inspection_session=fixture-token;/);
      assert(!local.includes('; Secure;'));
    });

    await suite.test('with registration closed, allows exactly one concurrent first signup',async () => {
      assert.equal(await auth.registrationOpen(),true);
      const results = await Promise.allSettled([
        auth.createAccount('fixture_alpha',fixturePassphrase,'Fixture Alpha Inspections'),
        auth.createAccount('fixture_beta',fixturePassphrase,'Fixture Beta Inspections')
      ]);
      const accepted = results.filter((result):result is PromiseFulfilledResult<{id:string;username:string}> => result.status === 'fulfilled');
      const rejected = results.filter((result):result is PromiseRejectedResult => result.status === 'rejected');
      assert.equal(accepted.length,1);
      assert.equal(rejected.length,1);
      assert.equal(rejected[0].reason.status,403);
      firstAccount = accepted[0].value;
      assert.equal((await db().prepare('SELECT count(*) AS total FROM app_users').first<{total:number}>())?.total,1);
      // The losing signup left no orphaned workspace behind.
      assert.equal((await db().prepare('SELECT count(*) AS total FROM workspaces').first<{total:number}>())?.total,1);
      assert.deepEqual({...await auth.accountSummary(firstAccount.id)},{id:firstAccount.id,username:firstAccount.username,role:'owner',workspace:accepted[0].value.username === 'fixture_alpha' ? 'Fixture Alpha Inspections' : 'Fixture Beta Inspections'});
      assert.equal(await auth.registrationOpen(),false);
      await assert.rejects(auth.createAccount('fixture_extra',fixturePassphrase,'Fixture Extra'),{status:403});
    });

    await suite.test('preserves scrypt authentication and rejects invalid credentials',async () => {
      assert.deepEqual(await auth.checkPassword(firstAccount.username,fixturePassphrase),firstAccount);
      await assert.rejects(auth.checkPassword(firstAccount.username,'Incorrect fixture passphrase'),{status:401});
      await assert.rejects(auth.checkPassword('fixture_missing',fixturePassphrase),{status:401});
      const row = await db().prepare('SELECT password_hash FROM app_users WHERE id=?').bind(firstAccount.id).first<{password_hash:string}>();
      assert.match(row!.password_hash,/^scrypt-v1\$[a-f0-9]{32}\$[a-f0-9]{64}$/);
      assert(!row!.password_hash.includes(fixturePassphrase));
    });

    await suite.test('stores hashed sessions, rotates on login, expires inactivity, and signs out',async () => {
      const firstToken = await auth.newSession(localRequest(),firstAccount.id);
      const firstRequest = authenticatedRequest(firstToken);
      assert.equal((await auth.authenticate(firstRequest))?.id,firstAccount.id);
      const sessionHash = createHash('sha256').update(firstToken).digest('hex');
      const stored = await db().prepare('SELECT token_hash FROM app_sessions WHERE user_id=?').bind(firstAccount.id).first<{token_hash:string}>();
      assert.equal(stored?.token_hash,sessionHash);
      assert.notEqual(stored?.token_hash,firstToken);
      const replacementToken = await auth.newSession(firstRequest,firstAccount.id);
      assert.equal(await auth.authenticate(firstRequest),null);
      const replacementRequest = authenticatedRequest(replacementToken);
      assert.equal((await auth.authenticate(replacementRequest))?.id,firstAccount.id);
      await db().prepare('UPDATE app_sessions SET last_used=? WHERE user_id=?').bind(Date.now()-86400001,firstAccount.id).run();
      assert.equal(await auth.authenticate(replacementRequest),null);
      const lastToken = await auth.newSession(localRequest(),firstAccount.id);
      const lastRequest = authenticatedRequest(lastToken);
      await auth.signOut(lastRequest);
      assert.equal(await auth.authenticate(lastRequest),null);
      assert.equal(await auth.authenticate(authenticatedRequest('invalid-token')),null);
    });

    await suite.test('anyone can create a new workspace unless ALLOW_REGISTRATION=false',async () => {
      assert.equal(await auth.registrationOpen(),false);
      delete process.env.ALLOW_REGISTRATION;
      assert.equal(await auth.registrationOpen(),true);
      const additional = await auth.createAccount('fixture_additional',fixturePassphrase,'Fixture Additional');
      await assert.rejects(auth.createAccount('fixture_additional',fixturePassphrase,'Fixture Duplicate'),{status:409});
      assert.equal((await db().prepare('SELECT count(*) AS total FROM app_users').first<{total:number}>())?.total,2);
      assert.equal((await db().prepare('SELECT count(*) AS total FROM workspaces').first<{total:number}>())?.total,2);
      assert.notEqual((await auth.authenticate(authenticatedRequest(await auth.newSession(localRequest(),additional.id))))?.workspaceId,
        (await auth.authenticate(authenticatedRequest(await auth.newSession(localRequest(),firstAccount.id))))?.workspaceId);
      process.env.ALLOW_REGISTRATION = 'false';
      assert.equal(await auth.registrationOpen(),false);
    });

    await suite.test('enforces persisted username and installation-wide throttles',async () => {
      await db().prepare('DELETE FROM auth_attempts').run();
      for (let attempt=0;attempt<12;attempt++) await auth.rateLimit('fixture_rate_user');
      await assert.rejects(auth.rateLimit('fixture_rate_user'),{status:429});
      await db().prepare('DELETE FROM auth_attempts').run();
      for (let attempt=0;attempt<45;attempt++) await auth.rateLimit(`fixture_rate_user_${attempt}`);
      await assert.rejects(auth.rateLimit('fixture_rate_other'),{status:429});
    });
  } finally {
    database?.close();
    for (const [name,value] of Object.entries(savedEnvironment)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(directory,{recursive:true,force:true});
  }
});
