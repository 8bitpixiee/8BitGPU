import { once } from "./once.js";

// pixel studio saves: one row per piece, owned by an account. The doc is opaque to the server,
// the editor decides what is inside, we only police size and shape.
export const LIMITS = { pieces: 100, data: 1_500_000, thumb: 80_000, name: 40, side: 512, perMinute: 30 };

const ensureSchema = once(async (db) => {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS studio_art (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, name TEXT NOT NULL, w INTEGER NOT NULL, h INTEGER NOT NULL, data TEXT NOT NULL, thumb TEXT NOT NULL DEFAULT '', shared INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);",
  );
  await db.exec("CREATE INDEX IF NOT EXISTS studio_art_user ON studio_art (user_id, updated_at);");
});

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

const ID = /^[a-f0-9]{32}$/;
const THUMB = /^data:image\/png;base64,[A-Za-z0-9+/=]*$/;

// saves per user per minute, kept per isolate (good enough to stop a runaway autosave loop)
const recent = new Map();
export function rateLimited(userId, now = Date.now()) {
  const hits = (recent.get(userId) || []).filter((t) => now - t < 60_000);
  if (hits.length >= LIMITS.perMinute) {
    recent.set(userId, hits);
    return true;
  }
  hits.push(now);
  recent.set(userId, hits);
  return false;
}

// returns { error } or the cleaned fields
export function cleanArt(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { error: "That artwork did not make sense." };
  const name = typeof body.name === "string" ? body.name.trim().replace(/[\u0000-\u001f]/g, "") : "";
  if (!name || name.length > LIMITS.name) return { error: `Give it a name up to ${LIMITS.name} characters.` };
  const { w, h } = body;
  const side = (n) => Number.isInteger(n) && n >= 1 && n <= LIMITS.side;
  if (!side(w) || !side(h)) return { error: `Canvas sides must be 1 to ${LIMITS.side} pixels.` };
  if (typeof body.data !== "string" || !body.data || body.data.length > LIMITS.data) return { error: "That artwork is too big to save." };
  const thumb = body.thumb ?? "";
  if (typeof thumb !== "string" || thumb.length > LIMITS.thumb || (thumb && !THUMB.test(thumb))) return { error: "That preview image was not valid." };
  return { name, w, h, data: body.data, thumb };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

const summary = (row) => ({
  id: row.id,
  name: row.name,
  w: row.w,
  h: row.h,
  thumb: row.thumb,
  shared: !!row.shared,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

async function save(request, db, user) {
  if (rateLimited(user.id)) return json({ error: "Slow down a little, you are saving too fast." }, 429);
  const body = await readJson(request);
  const art = cleanArt(body);
  if (art.error) return json({ error: art.error }, 400);
  const now = Date.now();
  if (body.id !== undefined && body.id !== null) {
    if (typeof body.id !== "string" || !ID.test(body.id)) return json({ error: "That artwork id is not valid." }, 400);
    const own = await db.prepare("SELECT id FROM studio_art WHERE id=? AND user_id=?").bind(body.id, user.id).first();
    if (!own) return json({ error: "That artwork was not found." }, 404);
    await db
      .prepare("UPDATE studio_art SET name=?, w=?, h=?, data=?, thumb=?, updated_at=? WHERE id=? AND user_id=?")
      .bind(art.name, art.w, art.h, art.data, art.thumb, now, body.id, user.id)
      .run();
    return json({ id: body.id, updatedAt: now });
  }
  const count = await db.prepare("SELECT COUNT(*) AS n FROM studio_art WHERE user_id=?").bind(user.id).first();
  if (count.n >= LIMITS.pieces) return json({ error: `You can keep ${LIMITS.pieces} pieces. Delete one first.` }, 409);
  const id = crypto.randomUUID().replaceAll("-", "");
  await db
    .prepare("INSERT INTO studio_art (id,user_id,name,w,h,data,thumb,shared,created_at,updated_at) VALUES (?,?,?,?,?,?,?,0,?,?)")
    .bind(id, user.id, art.name, art.w, art.h, art.data, art.thumb, now, now)
    .run();
  return json({ id, updatedAt: now }, 201);
}

// GET    /api/studio/art                 my pieces, newest first, no doc data
// POST   /api/studio/art                 { id?, name, w, h, data, thumb } create, or update when id is yours
// GET    /api/studio/art/:id             full piece (yours, or anyone's once shared)
// DELETE /api/studio/art/:id
// POST   /api/studio/art/:id/share       { shared: bool }
// GET    /api/studio/gallery/:username   that person's shared pieces, thumbs only
export async function handleStudio(request, env, user, url) {
  if (!user) return json({ error: "Sign in to use your art library." }, 401);
  const db = env.DB;
  await ensureSchema(db);
  const parts = url.pathname.split("/").filter(Boolean).slice(2); // drop "api", "studio"
  const [kind, id, action] = parts;
  const method = request.method;

  if (kind === "art" && !id) {
    if (method === "GET") {
      const rows = await db
        .prepare("SELECT id,name,w,h,thumb,shared,created_at,updated_at FROM studio_art WHERE user_id=? ORDER BY updated_at DESC LIMIT ?")
        .bind(user.id, LIMITS.pieces)
        .all();
      return json({ art: rows.results.map(summary) });
    }
    if (method === "POST") return save(request, db, user);
    return json({ error: "Wrong method." }, 405);
  }

  if (kind === "art" && id) {
    if (!ID.test(id)) return json({ error: "That artwork id is not valid." }, 400);
    if (!action && method === "GET") {
      const row = await db.prepare("SELECT * FROM studio_art WHERE id=?").bind(id).first();
      // a private piece looks exactly like a missing one
      if (!row || (row.user_id !== user.id && !row.shared)) return json({ error: "That artwork was not found." }, 404);
      return json({ ...summary(row), data: row.data, mine: row.user_id === user.id });
    }
    if (!action && method === "DELETE") {
      const res = await db.prepare("DELETE FROM studio_art WHERE id=? AND user_id=?").bind(id, user.id).run();
      if (!res.meta?.changes) return json({ error: "That artwork was not found." }, 404);
      return json({ ok: true });
    }
    if (action === "share" && method === "POST") {
      const body = await readJson(request);
      if (typeof body?.shared !== "boolean") return json({ error: "Say whether it is shared." }, 400);
      const res = await db.prepare("UPDATE studio_art SET shared=? WHERE id=? AND user_id=?").bind(body.shared ? 1 : 0, id, user.id).run();
      if (!res.meta?.changes) return json({ error: "That artwork was not found." }, 404);
      return json({ ok: true, shared: body.shared });
    }
    return json({ error: "Wrong method." }, 405);
  }

  if (kind === "gallery" && id && !action && method === "GET") {
    let name;
    try {
      name = decodeURIComponent(id);
    } catch {
      return json({ error: "That name was not valid." }, 400);
    }
    if (name.length > 40) return json({ error: "That name was not valid." }, 400);
    const owner = await db.prepare("SELECT id, username FROM users WHERE username=?").bind(name).first();
    if (!owner) return json({ error: "Nobody goes by that name." }, 404);
    const rows = await db
      .prepare("SELECT id,name,w,h,thumb,shared,created_at,updated_at FROM studio_art WHERE user_id=? AND shared=1 ORDER BY updated_at DESC LIMIT ?")
      .bind(owner.id, LIMITS.pieces)
      .all();
    return json({ username: owner.username, art: rows.results.map(summary) });
  }

  return json({ error: "Not found." }, 404);
}
