import { once } from "./once.js";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";
const COOKIE = "eightbit_oauth";
const COOKIE_PATH = "/api/auth/google";

const ensureGoogleSchema = once(async (db) => {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS google_accounts (google_sub TEXT PRIMARY KEY, user_id TEXT NOT NULL, email TEXT NOT NULL, created_at INTEGER NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id));",
  );
});

// the id and secret come from the environment (wrangler secrets / .dev.vars), never from the repo.
// Anything empty or still a placeholder counts as "not set up yet".
export function googleConfig(env, origin) {
  const real = (value) => typeof value === "string" && value.trim() && !/^(your|changeme|placeholder)/i.test(value.trim());
  if (!real(env.GOOGLE_CLIENT_ID) || !real(env.GOOGLE_CLIENT_SECRET)) return null;
  return {
    clientId: env.GOOGLE_CLIENT_ID.trim(),
    clientSecret: env.GOOGLE_CLIENT_SECRET.trim(),
    redirectUri: real(env.GOOGLE_REDIRECT_URI) ? env.GOOGLE_REDIRECT_URI.trim() : `${origin}/api/auth/google/callback`,
  };
}

const base64url = (bytes) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const randomToken = (length = 32) => base64url(crypto.getRandomValues(new Uint8Array(length)));

export async function pkceChallenge(verifier) {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
}

export function authorizeUrl(config, state, challenge) {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  return url.toString();
}

// a creature name to start from, taken from the part of the email before the @
export function usernameFrom(email, name) {
  const clean = (value) => String(value || "").replace(/[^a-zA-Z0-9_.-]/g, "");
  let base = clean(String(email || "").split("@")[0]) || clean(name);
  if (base.length < 3) base = (base + "pixie").slice(0, 8);
  return base.slice(0, 14);
}

async function freeUsername(db, base) {
  for (let attempt = 0; attempt < 8; attempt++) {
    const candidate = attempt ? `${base}${Math.floor(Math.random() * 9000 + 1000)}` : base;
    if (!(await db.prepare("SELECT 1 FROM users WHERE username = ?").bind(candidate).first())) return candidate;
  }
  return `${base.slice(0, 8)}${crypto.randomUUID().slice(0, 8)}`;
}

const redirect = (location, cookies = []) => {
  const headers = new Headers({ location, "cache-control": "no-store" });
  for (const cookie of cookies) headers.append("set-cookie", cookie);
  return new Response(null, { status: 302, headers });
};
const clearState = `${COOKIE}=; Path=${COOKIE_PATH}; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

export async function handleGoogle(request, env, url, { db, createSession, readCookies, json }) {
  const config = googleConfig(env, url.origin);
  if (url.pathname === "/api/auth/google/config") return json({ enabled: Boolean(config) });
  if (request.method !== "GET") return json({ error: "Not found." }, 404);
  if (!config) return json({ error: "Google sign-in isn't set up on this deployment yet." }, 503);

  if (url.pathname === "/api/auth/google/start") {
    const state = randomToken(24);
    const verifier = randomToken(48);
    const cookie = `${COOKIE}=${state}.${verifier}; Path=${COOKIE_PATH}; HttpOnly; Secure; SameSite=Lax; Max-Age=600`;
    return redirect(authorizeUrl(config, state, await pkceChallenge(verifier)), [cookie]);
  }

  if (url.pathname === "/api/auth/google/callback") {
    const [state, verifier] = (readCookies(request)[COOKIE] || "").split(".");
    const fail = (reason) => redirect(`/?signin=${reason}`, [clearState]);
    if (url.searchParams.get("error")) return fail("cancelled");
    if (!state || !verifier || url.searchParams.get("state") !== state || !url.searchParams.get("code"))
      return fail("failed");

    const token = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: url.searchParams.get("code"),
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
    }).then((r) => (r.ok ? r.json() : null));
    if (!token?.access_token) return fail("failed");
    const profile = await fetch(USERINFO_URL, { headers: { authorization: `Bearer ${token.access_token}` } }).then((r) =>
      r.ok ? r.json() : null,
    );
    if (!profile?.sub || !profile.email || profile.email_verified !== true) return fail("unverified");

    await ensureGoogleSchema(db);
    let link = await db.prepare("SELECT user_id FROM google_accounts WHERE google_sub = ?").bind(profile.sub).first();
    if (!link) {
      const id = crypto.randomUUID();
      const username = await freeUsername(db, usernameFrom(profile.email, profile.name));
      // no password hash can ever match this placeholder, so these accounts only sign in through Google
      await db.batch([
        db
          .prepare("INSERT INTO users (id, username, password_hash, password_salt, created_at) VALUES (?, ?, 'google-sso', 'google-sso', ?)")
          .bind(id, username, Date.now()),
        db
          .prepare("INSERT INTO google_accounts (google_sub, user_id, email, created_at) VALUES (?, ?, ?, ?)")
          .bind(profile.sub, id, profile.email, Date.now()),
      ]);
      link = { user_id: id };
    }
    return redirect("/?signin=google", [await createSession(link.user_id, db), clearState]);
  }
  return json({ error: "Not found." }, 404);
}
