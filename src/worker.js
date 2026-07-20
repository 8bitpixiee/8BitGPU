const SESSION_LENGTH_SECONDS = 60 * 60 * 24 * 30;
const encoder = new TextEncoder();

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), {
  status,
  headers: {
    "content-type": "application/json; charset=UTF-8",
    "cache-control": "no-store",
    ...headers
  }
});

function readCookies(request) {
  return Object.fromEntries((request.headers.get("Cookie") || "").split(";").map((part) => {
    const index = part.indexOf("=");
    return index < 0 ? [] : [part.slice(0, index).trim(), decodeURIComponent(part.slice(index + 1))];
  }).filter((pair) => pair.length));
}

function randomBase64(byteLength = 32) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({
    name: "PBKDF2",
    salt: base64ToBytes(salt),
    iterations: 120000,
    hash: "SHA-256"
  }, key, 256);
  return btoa(String.fromCharCode(...new Uint8Array(bits)));
}

function matches(expected, actual) {
  const left = encoder.encode(expected);
  const right = encoder.encode(actual);
  if (left.length !== right.length) return false;
  let different = 0;
  for (let index = 0; index < left.length; index += 1) different |= left[index] ^ right[index];
  return different === 0;
}

function validUsername(username) {
  return /^[a-zA-Z0-9_.-]{3,18}$/.test(username);
}

async function readBody(request) {
  try { return await request.json(); } catch { return null; }
}

async function ensureSchema(database) {
  await database.exec("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at INTEGER NOT NULL);");
  await database.exec("CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id));");
  await database.exec("CREATE TABLE IF NOT EXISTS player_data (user_id TEXT PRIMARY KEY, avatar_json TEXT, updated_at INTEGER NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id));");
}

async function sha256(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function currentUser(request, database) {
  const sessionToken = readCookies(request).eightbit_session;
  if (!sessionToken) return null;
  const tokenHash = await sha256(sessionToken);
  const now = Date.now();
  await database.prepare("DELETE FROM sessions WHERE expires_at <= ?").bind(now).run();
  return database.prepare(`
    SELECT users.id, users.username, player_data.avatar_json AS avatar
    FROM sessions
    JOIN users ON users.id = sessions.user_id
    LEFT JOIN player_data ON player_data.user_id = users.id
    WHERE sessions.token_hash = ? AND sessions.expires_at > ?
  `).bind(tokenHash, now).first();
}

async function createSession(userId, database) {
  const token = randomBase64(32);
  const expiresAt = Date.now() + SESSION_LENGTH_SECONDS * 1000;
  await database.prepare("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
    .bind(await sha256(token), userId, expiresAt).run();
  return `eightbit_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_LENGTH_SECONDS}`;
}

function publicUser(user) {
  return { id: user.id, username: user.username, avatar: user.avatar ? JSON.parse(user.avatar) : null };
}

async function handleApi(request, env, url) {
  if (!env.DB || typeof env.DB.prepare !== "function") {
    return json({ error: "The D1 binding named DB is not available to this deployment." }, 500);
  }
  await ensureSchema(env.DB);
  const path = url.pathname;

  if (path === "/api/auth/me" && request.method === "GET") {
    const user = await currentUser(request, env.DB);
    return json({ user: user ? publicUser(user) : null });
  }

  if (path === "/api/auth/register" && request.method === "POST") {
    const body = await readBody(request);
    const username = body?.username?.trim();
    const password = body?.password;
    if (!validUsername(username || "")) return json({ error: "Use 3–18 letters, numbers, dots, dashes, or underscores." }, 400);
    if (typeof password !== "string" || password.length < 8) return json({ error: "Your passcode needs at least 8 characters." }, 400);

    const existing = await env.DB.prepare("SELECT id FROM users WHERE username = ?").bind(username).first();
    if (existing) return json({ error: "That creature name is already claimed." }, 409);

    const id = crypto.randomUUID();
    const salt = randomBase64(16);
    const passwordHash = await hashPassword(password, salt);
    await env.DB.prepare("INSERT INTO users (id, username, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(id, username, passwordHash, salt, Date.now()).run();
    const cookie = await createSession(id, env.DB);
    return json({ user: { id, username, avatar: null } }, 201, { "set-cookie": cookie });
  }

  if (path === "/api/auth/login" && request.method === "POST") {
    const body = await readBody(request);
    const username = body?.username?.trim();
    const password = body?.password;
    const user = typeof username === "string" ? await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first() : null;
    if (!user || typeof password !== "string" || !matches(user.password_hash, await hashPassword(password, user.password_salt))) {
      return json({ error: "Creature name or passcode is not right." }, 401);
    }
    const cookie = await createSession(user.id, env.DB);
    const avatar = await env.DB.prepare("SELECT avatar_json AS avatar FROM player_data WHERE user_id = ?").bind(user.id).first();
    return json({ user: { id: user.id, username: user.username, avatar: avatar?.avatar ? JSON.parse(avatar.avatar) : null } }, 200, { "set-cookie": cookie });
  }

  if (path === "/api/auth/logout" && request.method === "POST") {
    const token = readCookies(request).eightbit_session;
    if (token) await env.DB.prepare("DELETE FROM sessions WHERE token_hash = ?").bind(await sha256(token)).run();
    return json({ ok: true }, 200, { "set-cookie": "eightbit_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0" });
  }

  if (path === "/api/avatar" && request.method === "PUT") {
    const user = await currentUser(request, env.DB);
    if (!user) return json({ error: "Sign in to save an outfit online." }, 401);
    const avatar = await readBody(request);
    if (!avatar || typeof avatar !== "object" || Array.isArray(avatar) || JSON.stringify(avatar).length > 12000) return json({ error: "That outfit data is not valid." }, 400);
    await env.DB.prepare(`
      INSERT INTO player_data (user_id, avatar_json, updated_at) VALUES (?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET avatar_json = excluded.avatar_json, updated_at = excluded.updated_at
    `).bind(user.id, JSON.stringify(avatar), Date.now()).run();
    return json({ ok: true });
  }

  return json({ error: "That 8BitGPU API path does not exist." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith("/api/")) {
      try { return await handleApi(request, env, url); }
      catch (error) {
        console.error(error);
        return json({ error: "The player database is temporarily unavailable.", detail: error instanceof Error ? error.message : String(error) }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  }
};
