import test from "node:test";
import assert from "node:assert/strict";
import { handleStudio, cleanArt, rateLimited, LIMITS } from "../server/studio.js";

// tiny in-memory D1: it only knows the handful of statements studio.js sends
function fakeDb(users = []) {
  const rows = [];
  const prepare = (sql) => {
    let args = [];
    const run = () => {
      if (sql.startsWith("INSERT INTO studio_art")) {
        const [id, user_id, name, w, h, data, thumb, created_at, updated_at] = args;
        rows.push({ id, user_id, name, w, h, data, thumb, shared: 0, created_at, updated_at });
        return { meta: { changes: 1 } };
      }
      if (sql.startsWith("UPDATE studio_art SET name")) {
        const [name, w, h, data, thumb, updated_at, id, user_id] = args;
        const row = rows.find((r) => r.id === id && r.user_id === user_id);
        if (row) Object.assign(row, { name, w, h, data, thumb, updated_at });
        return { meta: { changes: row ? 1 : 0 } };
      }
      if (sql.startsWith("UPDATE studio_art SET shared")) {
        const [shared, id, user_id] = args;
        const row = rows.find((r) => r.id === id && r.user_id === user_id);
        if (row) row.shared = shared;
        return { meta: { changes: row ? 1 : 0 } };
      }
      if (sql.startsWith("DELETE FROM studio_art")) {
        const i = rows.findIndex((r) => r.id === args[0] && r.user_id === args[1]);
        if (i >= 0) rows.splice(i, 1);
        return { meta: { changes: i >= 0 ? 1 : 0 } };
      }
      throw new Error(`fake db does not know: ${sql}`);
    };
    const first = () => {
      if (sql.startsWith("SELECT COUNT")) return { n: rows.filter((r) => r.user_id === args[0]).length };
      if (sql.startsWith("SELECT id FROM studio_art")) return rows.find((r) => r.id === args[0] && r.user_id === args[1]) || null;
      if (sql.startsWith("SELECT * FROM studio_art")) return rows.find((r) => r.id === args[0]) || null;
      if (sql.startsWith("SELECT id, username FROM users")) return users.find((u) => u.username.toLowerCase() === args[0].toLowerCase()) || null;
      throw new Error(`fake db does not know: ${sql}`);
    };
    const all = () => {
      const mine = sql.includes("AND shared=1") ? (r) => r.shared : () => true;
      const list = rows.filter((r) => r.user_id === args[0] && mine(r)).sort((a, b) => b.updated_at - a.updated_at);
      return { results: list.slice(0, args[1]).map((r) => ({ ...r })) };
    };
    return { bind: (...a) => ((args = a), { run: async () => run(), first: async () => first(), all: async () => all() }) };
  };
  return { prepare, exec: async () => {}, rows };
}

const THUMB = "data:image/png;base64,iVBORw0KGgo=";
const alice = { id: "u1", username: "alice" };
const bob = { id: "u2", username: "bob" };
const art = (extra = {}) => ({ name: "cat", w: 16, h: 16, data: '{"px":[]}', thumb: THUMB, ...extra });

function setup() {
  const env = { DB: fakeDb([alice, bob]) };
  const call = async (user, method, path, body) => {
    const request = new Request(`https://x.test${path}`, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    const res = await handleStudio(request, env, user, new URL(request.url));
    return { status: res.status, body: await res.json() };
  };
  return { env, call };
}

test("signed out gets 401 everywhere", async () => {
  const { call } = setup();
  assert.equal((await call(null, "GET", "/api/studio/art")).status, 401);
  assert.equal((await call(null, "POST", "/api/studio/art", art())).status, 401);
});

test("create, list without data, load, update", async () => {
  const { call } = setup();
  const made = await call(alice, "POST", "/api/studio/art", art());
  assert.equal(made.status, 201);
  assert.match(made.body.id, /^[a-f0-9]{32}$/);
  const list = await call(alice, "GET", "/api/studio/art");
  assert.equal(list.body.art.length, 1);
  assert.equal(list.body.art[0].data, undefined);
  assert.equal(list.body.art[0].shared, false);
  const full = await call(alice, "GET", `/api/studio/art/${made.body.id}`);
  assert.equal(full.body.data, '{"px":[]}');
  const upd = await call(alice, "POST", "/api/studio/art", art({ id: made.body.id, name: "dog", data: "v2" }));
  assert.equal(upd.status, 200);
  assert.equal((await call(alice, "GET", `/api/studio/art/${made.body.id}`)).body.name, "dog");
  assert.equal((await call(alice, "GET", "/api/studio/art")).body.art.length, 1);
});

test("other people only see shared pieces, and cannot touch them", async () => {
  const { call } = setup();
  const { id } = (await call(alice, "POST", "/api/studio/art", art())).body;
  assert.equal((await call(bob, "GET", `/api/studio/art/${id}`)).status, 404);
  assert.equal((await call(bob, "POST", `/api/studio/art/${id}/share`, { shared: true })).status, 404);
  assert.equal((await call(bob, "DELETE", `/api/studio/art/${id}`)).status, 404);
  assert.equal((await call(bob, "POST", "/api/studio/art", art({ id }))).status, 404);
  assert.deepEqual((await call(bob, "GET", "/api/studio/gallery/alice")).body.art, []);

  assert.equal((await call(alice, "POST", `/api/studio/art/${id}/share`, { shared: true })).status, 200);
  const seen = await call(bob, "GET", `/api/studio/art/${id}`);
  assert.equal(seen.status, 200);
  assert.equal(seen.body.mine, false);
  const gallery = await call(bob, "GET", "/api/studio/gallery/Alice");
  assert.equal(gallery.body.art.length, 1);
  assert.equal(gallery.body.art[0].data, undefined);
  assert.equal((await call(bob, "GET", "/api/studio/gallery/nobody")).status, 404);

  await call(alice, "POST", `/api/studio/art/${id}/share`, { shared: false });
  assert.equal((await call(bob, "GET", `/api/studio/art/${id}`)).status, 404);
});

test("delete removes it", async () => {
  const { call } = setup();
  const { id } = (await call(alice, "POST", "/api/studio/art", art())).body;
  assert.equal((await call(alice, "DELETE", `/api/studio/art/${id}`)).status, 200);
  assert.equal((await call(alice, "GET", `/api/studio/art/${id}`)).status, 404);
});

test("per-user piece cap", async () => {
  const { env, call } = setup();
  for (let i = 0; i < LIMITS.pieces; i++) env.DB.rows.push({ id: String(i), user_id: "u1", shared: 0 });
  const res = await call(alice, "POST", "/api/studio/art", art());
  assert.equal(res.status, 409);
});

test("cleanArt rejects bad input", () => {
  assert.ok(cleanArt(null).error);
  assert.ok(cleanArt(art({ name: "   " })).error);
  assert.ok(cleanArt(art({ name: "x".repeat(LIMITS.name + 1) })).error);
  assert.ok(cleanArt(art({ w: 0 })).error);
  assert.ok(cleanArt(art({ w: 1.5 })).error);
  assert.ok(cleanArt(art({ h: LIMITS.side + 1 })).error);
  assert.ok(cleanArt(art({ data: 5 })).error);
  assert.ok(cleanArt(art({ data: "x".repeat(LIMITS.data + 1) })).error);
  assert.ok(cleanArt(art({ thumb: "http://evil/x.png" })).error);
  assert.ok(cleanArt(art({ thumb: "data:image/png;base64," + "A".repeat(LIMITS.thumb) })).error);
  assert.equal(cleanArt(art({ name: " ok " })).name, "ok");
  assert.equal(cleanArt(art({ thumb: undefined })).thumb, "");
});

test("bad ids and bad bodies are 400", async () => {
  const { call } = setup();
  assert.equal((await call(alice, "GET", "/api/studio/art/nope")).status, 400);
  assert.equal((await call(alice, "POST", "/api/studio/art", art({ id: "nope" }))).status, 400);
  const { id } = (await call(alice, "POST", "/api/studio/art", art())).body;
  assert.equal((await call(alice, "POST", `/api/studio/art/${id}/share`, { shared: "yes" })).status, 400);
});

test("rate limit kicks in and recovers", () => {
  const t = 1_000_000;
  for (let i = 0; i < LIMITS.perMinute; i++) assert.equal(rateLimited("rl", t), false);
  assert.equal(rateLimited("rl", t + 1), true);
  assert.equal(rateLimited("rl", t + 61_000), false);
});
