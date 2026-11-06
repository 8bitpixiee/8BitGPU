import { once } from "./once.js";
import { GAMES, SCORE_MAX } from "./games/config.js";

const ensureSchema = once(async (db) => {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS leaderboard_scores (game TEXT NOT NULL, user_id TEXT NOT NULL, username TEXT NOT NULL, score REAL NOT NULL, meta TEXT NOT NULL DEFAULT '{}', updated_at INTEGER NOT NULL, PRIMARY KEY (game, user_id));",
  );
});

const json = (body, status = 200, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

// small bag of extra info a game can attach to a score (character, track, wave...). strings and numbers only
export function cleanMeta(meta) {
  const out = {};
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) return out;
  for (const [key, value] of Object.entries(meta).slice(0, 8)) {
    if (!/^[a-z][a-zA-Z0-9]{0,15}$/.test(key)) continue;
    if (typeof value === "number" && Number.isFinite(value)) out[key] = value;
    else if (typeof value === "string") out[key] = value.slice(0, 32);
  }
  return out;
}

export function betterScore(order, next, old) {
  return order === "low" ? next < old : next > old;
}

export async function topScores(db, game, limit = 20) {
  await ensureSchema(db);
  const order = GAMES[game].leaderboard === "low" ? "ASC" : "DESC";
  const rows = await db
    .prepare(`SELECT username, score, meta, updated_at FROM leaderboard_scores WHERE game=? ORDER BY score ${order}, updated_at ASC LIMIT ?`)
    .bind(game, limit)
    .all();
  return rows.results.map((row, i) => ({ rank: i + 1, username: row.username, score: row.score, meta: JSON.parse(row.meta || "{}"), at: row.updated_at }));
}

export async function submitScore(db, game, user, score, meta) {
  await ensureSchema(db);
  const order = GAMES[game].leaderboard;
  const old = await db.prepare("SELECT score FROM leaderboard_scores WHERE game=? AND user_id=?").bind(game, user.id).first();
  if (old && !betterScore(order, score, old.score)) return { best: old.score, improved: false };
  await db
    .prepare(
      "INSERT INTO leaderboard_scores (game,user_id,username,score,meta,updated_at) VALUES (?,?,?,?,?,?) ON CONFLICT(game,user_id) DO UPDATE SET username=excluded.username, score=excluded.score, meta=excluded.meta, updated_at=excluded.updated_at",
    )
    .bind(game, user.id, user.username, score, JSON.stringify(cleanMeta(meta)), Date.now())
    .run();
  return { best: score, improved: true };
}

// GET /api/leaderboard/:game      top 20 plus your own rank when signed in
// POST /api/leaderboard/:game     { score, meta } keeps your best only
export async function handleLeaderboard(request, env, user, url) {
  const game = url.pathname.split("/")[3];
  if (!GAMES[game]?.leaderboard) return json({ error: "That game has no leaderboard." }, 404);
  if (request.method === "GET") {
    const top = await topScores(env.DB, game);
    let me = null;
    if (user) {
      const row = await env.DB.prepare("SELECT score FROM leaderboard_scores WHERE game=? AND user_id=?").bind(game, user.id).first();
      if (row) {
        const cmp = GAMES[game].leaderboard === "low" ? "<" : ">";
        const ahead = await env.DB.prepare(`SELECT COUNT(*) AS n FROM leaderboard_scores WHERE game=? AND score ${cmp} ?`).bind(game, row.score).first();
        me = { rank: ahead.n + 1, score: row.score };
      }
    }
    return json({ game, order: GAMES[game].leaderboard, top, me }, 200, { "cache-control": "no-store" });
  }
  if (request.method !== "POST") return json({ error: "Wrong method." }, 405);
  if (!user) return json({ error: "Sign in to post a score." }, 401);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "That score did not make sense." }, 400);
  }
  const score = Number(body?.score);
  if (!Number.isFinite(score) || score < 0 || score > SCORE_MAX) return json({ error: "That score did not make sense." }, 400);
  return json(await submitScore(env.DB, game, user, Math.round(score * 1000) / 1000, body.meta));
}
