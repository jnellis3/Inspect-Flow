import test from "node:test";
import assert from "node:assert/strict";
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { LocalDatabase } from "../lib/inspection/local-storage";
import type { Project, RunStatus } from "../lib/inspection/types";

/** Every account, company and passphrase in this suite is a disposable synthetic fixture. */
const passphrase = "Disposable test fixture passphrase 4837";

test("an existing installation migrates: each account owns a workspace with its projects and branding", async t => {
  const directory = await mkdtemp(join(tmpdir(), "inspect-flow-migrate-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const migrations = join(directory, "migrations");
  await mkdir(migrations);
  const all = (await readdir(resolve("drizzle"))).filter(name => name.endsWith(".sql")).sort();
  for (const name of all.slice(0, 2)) await copyFile(join(resolve("drizzle"), name), join(migrations, name));

  let database = new LocalDatabase(join(directory, "data"), migrations);
  const user = database.prepare("INSERT INTO app_users (id,username,password_hash,created_at) VALUES (?,?,?,?)");
  await user.bind("user-with-projects", "fixture_tyler", "synthetic-test-hash", 1).run();
  await user.bind("user-without-projects", "fixture_marco", "synthetic-test-hash", 2).run();
  const project = database.prepare("INSERT INTO projects (id,owner,address,revision,data,created_at,updated_at) VALUES (?,?,?,1,?,?,?)");
  const company = { name: "Fixture Home Inspections", people: ["Tyler"], phone: "(281) 555-0100", website: "example.com", accent: "#123456" };
  await project.bind("older", "user-with-projects", "1 Old Rd", JSON.stringify({ company: { ...company, name: "Old Name" } }), "2026-01-01", "2026-01-01").run();
  await project.bind("newer", "user-with-projects", "2 New Rd", JSON.stringify({ company }), "2026-02-01", "2026-02-01").run();
  database.close();

  for (const name of all.slice(2)) await copyFile(join(resolve("drizzle"), name), join(migrations, name));
  database = new LocalDatabase(join(directory, "data"), migrations);
  t.after(() => database.close());
  const workspaces = (await database.prepare("SELECT id, name, profile, plan FROM workspaces ORDER BY created_at").all<{ id: string; name: string; profile: string; plan: string }>()).results;
  assert.deepEqual(workspaces.map(w => ({ ...w, profile: JSON.parse(w.profile) })), [
    { id: "user-with-projects", name: "Fixture Home Inspections", profile: { phone: "(281) 555-0100", website: "example.com", accent: "#123456" }, plan: "unlimited" },
    { id: "user-without-projects", name: "fixture_marco", profile: { phone: "", website: "", accent: "" }, plan: "unlimited" },
  ]);
  const users = (await database.prepare("SELECT id, workspace_id, role FROM app_users ORDER BY created_at").all()).results;
  assert.deepEqual(users, [
    { id: "user-with-projects", workspace_id: "user-with-projects", role: "owner" },
    { id: "user-without-projects", workspace_id: "user-without-projects", role: "owner" },
  ]);
  assert.deepEqual((await database.prepare("SELECT DISTINCT workspace_id FROM projects").all()).results, [{ workspace_id: "user-with-projects" }]);
});

test("workspaces: shared projects, isolation, invites, roles and the free video allowance", async suite => {
  const directory = await mkdtemp(join(tmpdir(), "inspect-flow-workspaces-"));
  const saved = { DATA_DIR: process.env.DATA_DIR, APP_ORIGIN: process.env.APP_ORIGIN, ALLOW_REGISTRATION: process.env.ALLOW_REGISTRATION, TRIAL_VIDEO_LIMIT: process.env.TRIAL_VIDEO_LIMIT };
  process.env.DATA_DIR = directory;
  process.env.APP_ORIGIN = "http://localhost:3000";
  delete process.env.ALLOW_REGISTRATION;
  delete process.env.TRIAL_VIDEO_LIMIT;
  let close = () => {};
  try {
    const auth = await import("../lib/inspection/auth");
    const store = await import("../lib/inspection/store");
    const workspaces = await import("../lib/inspection/workspaces");
    const jobs = await import("../lib/inspection/jobs");
    const { db, bucket, jobsDir } = await import("../lib/inspection/server");
    close = () => db().close();

    const signIn = async (account: { id: string }) => auth.newSession(new Request("http://localhost:3000/api/auth"), account.id);
    /** Run `fn` as the account signed in with `token`, the way a route handler would. */
    async function as<T>(token: string, fn: () => Promise<T>): Promise<T> {
      const run: { outcome?: { value: T } | { error: unknown } } = {};
      const response = await store.api(new Request("http://localhost:3000/api/test", { headers: { cookie: `inspection_session=${token}` } }), async () => {
        try { run.outcome = { value: await fn() }; } catch (error) { run.outcome = { error }; }
        return new Response(null);
      });
      if (!run.outcome) throw Object.assign(new Error("Not signed in"), { status: response.status });
      if ("error" in run.outcome) throw run.outcome.error;
      return run.outcome.value;
    }
    const newProject = (inspectors: string[] = []): Project => {
      const now = new Date().toISOString();
      return {
        id: crypto.randomUUID(), revision: 1, createdAt: now, updatedAt: now, vertical: "home",
        property: { address: "1234 Fixture Ln", city: "", kind: "" }, vehicle: { year: "", make: "", model: "", trim: "", vin: "", mileage: "", location: "" },
        inspection: { date: "2026-10-03", type: "Pre-purchase" }, inspectors, voice: { mode: "ai", voice: "ash" }, notes: "", video: null, supporting: [],
      };
    };

    const acme = await signIn(await auth.createAccount("fixture_acme_owner", passphrase, "Acme Fixture Inspections"));
    const other = await signIn(await auth.createAccount("fixture_other_owner", passphrase, "Other Fixture Motors"));
    const shared = newProject(["Tyler"]);
    await as(acme, () => store.insertProject(shared));

    await suite.test("another workspace can't see, change or delete a project", async () => {
      await assert.rejects(as(other, () => store.getProject(shared.id)), { status: 404 });
      await assert.rejects(as(other, () => store.updateProject(shared.id, p => ({ ...p, notes: "tampered" }))), { status: 404 });
      assert.deepEqual(await as(other, () => store.listProjects()), []);
      await as(other, () => store.deleteProject(shared.id));
      assert.equal((await as(acme, () => store.getProject(shared.id))).notes, "");
    });

    let member = "";
    let memberId = "";
    await suite.test("an invite link adds a teammate who shares the workspace's projects, once", async () => {
      const url = await as(acme, () => workspaces.createInvite());
      assert.match(url, /^http:\/\/localhost:3000\/join#[a-f0-9]{64}$/);
      const token = url.split("#")[1];
      assert.equal(await auth.inviteWorkspace(token), "Acme Fixture Inspections");
      const joined = await auth.joinWorkspace(token, "fixture_acme_member", passphrase);
      memberId = joined.id;
      member = await signIn(joined);
      await assert.rejects(auth.joinWorkspace(token, "fixture_second_use", passphrase), { status: 410 });
      assert.equal(await auth.inviteWorkspace(token), null);
      assert.deepEqual((await as(member, () => store.listProjects())).map(p => p.id), [shared.id]);
      assert.deepEqual((await as(acme, () => workspaces.listMembers())).map(m => [m.username, m.role]), [["fixture_acme_owner", "owner"], ["fixture_acme_member", "member"]]);
      assert.deepEqual((await as(other, () => workspaces.listMembers())).map(m => m.username), ["fixture_other_owner"]);
    });

    await suite.test("expired and revoked invites don't work", async () => {
      const expired = (await as(acme, () => workspaces.createInvite())).split("#")[1];
      await db().prepare("UPDATE invites SET expires_at = ? WHERE token_hash = ?").bind(Date.now() - 1, auth.hash(expired)).run();
      await assert.rejects(auth.joinWorkspace(expired, "fixture_late", passphrase), { status: 410 });
      const revoked = (await as(acme, () => workspaces.createInvite())).split("#")[1];
      const [pending] = await as(acme, () => workspaces.listInvites());
      await as(other, () => workspaces.revokeInvite(pending.id));  // not theirs: no effect
      assert.equal(await auth.inviteWorkspace(revoked), "Acme Fixture Inspections");
      await as(acme, () => workspaces.revokeInvite(pending.id));
      await assert.rejects(auth.joinWorkspace(revoked, "fixture_revoked", passphrase), { status: 410 });
    });

    await suite.test("only the owner changes the company profile and the team", async () => {
      const company = { name: "Acme Fixture Inspections", phone: "(281) 555-0100", website: "example.com", accent: "#123456" };
      await assert.rejects(as(member, () => workspaces.updateCompany({ ...company, name: "Hijacked" })), { status: 403 });
      await assert.rejects(as(member, () => workspaces.createInvite()), { status: 403 });
      await assert.rejects(as(member, () => workspaces.removeMember(memberId)), { status: 403 });
      await as(acme, () => workspaces.updateCompany(company));
      assert.deepEqual((await as(member, () => workspaces.getWorkspace())).company, company);
      assert.equal((await as(other, () => workspaces.getWorkspace())).company.name, "Other Fixture Motors");
    });

    await suite.test("projects saved before workspaces keep their inspectors", async () => {
      const legacy = { ...newProject(), company: { name: "Old", people: ["Chris"], phone: "", website: "", accent: "" } } as Partial<Project>;
      delete legacy.inspectors;
      await db().prepare("INSERT INTO projects (id, workspace_id, address, revision, data, created_at, updated_at) VALUES (?, (SELECT workspace_id FROM app_users WHERE id = ?), '', 1, ?, '', '')")
        .bind(legacy.id, memberId, JSON.stringify(legacy)).run();
      const loaded = await as(member, () => store.getProject(legacy.id!));
      assert.deepEqual(loaded.inspectors, ["Chris"]);
      assert.equal("company" in loaded, false);
    });

    await suite.test("a queued video is briefed with the workspace's company and taken from its allowance", async () => {
      const p = { ...shared, video: { id: "video", name: "walk.mp4", type: "video/mp4", size: 4, status: "ready" as const } };
      await bucket().put(`${p.id}/source`, "test");
      await as(member, () => jobs.queueRun(p, "produce"));
      const brief = JSON.parse(await readFile(join(jobsDir(), p.id, "brief.json"), "utf8"));
      assert.deepEqual(brief.company, { name: "Acme Fixture Inspections", people: ["Tyler"], phone: "(281) 555-0100", website: "example.com", accent: "#123456" });
      const status = JSON.parse(await readFile(join(jobsDir(), p.id, "status.json"), "utf8"));
      assert.equal(status.workspace, (await as(acme, () => workspaces.getWorkspace())).id);
      // Migrated workspaces are unlimited; new ones are on the free trial, so this one counts.
      assert.deepEqual(await as(acme, () => workspaces.videoUsage(p.id)), { used: 1, limit: 3, counted: true });
      await as(acme, () => jobs.cancelRun(p.id));
      await as(acme, () => jobs.queueRun(p, "produce"));  // starting the same project again is free
      assert.deepEqual(await as(acme, () => workspaces.videoUsage()), { used: 1, limit: 3, counted: false });
    });

    await suite.test("a trial workspace gets three videos; deleting a project doesn't give one back", async () => {
      const first = newProject().id;
      const [second, third, fourth] = [2, 3, 4].map(() => crypto.randomUUID());
      await as(other, () => store.insertProject({ ...newProject(), id: first }));
      await as(other, () => workspaces.countVideo(first));
      await as(other, () => workspaces.countVideo(first));
      await as(other, () => workspaces.countVideo(second));
      // Two projects racing for the last free video: exactly one gets it.
      const race = await Promise.allSettled([as(other, () => workspaces.countVideo(third)), as(other, () => workspaces.countVideo(fourth))]);
      assert.deepEqual(race.map(r => r.status).sort(), ["fulfilled", "rejected"]);
      assert.equal((race.find(r => r.status === "rejected") as PromiseRejectedResult).reason.status, 402);
      const loser = race[0].status === "rejected" ? third : fourth;
      assert.deepEqual(await as(other, () => workspaces.videoUsage()), { used: 3, limit: 3, counted: false });
      await as(other, () => store.deleteProject(first));
      assert.deepEqual(await as(other, () => store.listProjects()), []);
      await assert.rejects(as(other, () => workspaces.countVideo(loser)), { status: 402 });
      await db().prepare("UPDATE workspaces SET plan = 'unlimited' WHERE name = ?").bind("Other Fixture Motors").run();
      await as(other, () => workspaces.countVideo(loser));
      assert.deepEqual(await as(other, () => workspaces.videoUsage(loser)), { used: 4, limit: null, counted: true });
      // The other workspace's allowance is its own.
      assert.equal((await as(acme, () => workspaces.videoUsage())).used, 1);
    });

    await suite.test("a removed teammate is signed out and their projects stay with the workspace", async () => {
      await assert.rejects(as(other, () => workspaces.removeMember(memberId)), { status: 404 });  // not theirs to remove
      assert.equal(await as(member, async () => store.account().role), "member");
      await as(acme, () => workspaces.removeMember(memberId));
      await assert.rejects(as(member, async () => null), { status: 401 });
      assert.equal((await as(acme, () => store.listProjects())).length, 2);
      await assert.rejects(as(acme, async () => workspaces.removeMember(store.account().id)), { status: 409 });
    });
  } finally {
    close();
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
    await rm(directory, { recursive: true, force: true });
  }
});

test("the queue takes turns between workspaces, oldest first within each", async () => {
  const { nextQueued } = await import("../lib/inspection/worker-api");
  const job = (id: string, state: RunStatus["state"], workspace: string | undefined, queuedAt: string) => ({ id, status: { state, workspace, queuedAt } });
  const batch = [job("a1", "queued", "A", "1"), job("a2", "queued", "A", "2"), job("a3", "queued", "A", "3"), job("b1", "queued", "B", "4")];
  assert.equal(nextQueued(batch)?.id, "a1");
  // A already has a job running, so B goes next even though A's jobs are older.
  assert.equal(nextQueued([{ ...batch[0], status: { ...batch[0].status, state: "running" as const } }, ...batch.slice(1)])?.id, "b1");
  // Jobs queued before workspaces existed each count as their own.
  assert.equal(nextQueued([job("old", "queued", undefined, "5"), job("a4", "running", "A", "0"), job("a5", "queued", "A", "1")])?.id, "old");
  assert.equal(nextQueued([job("done", "done", "A", "1"), job("failed", "failed", "B", "1")]), undefined);
});
