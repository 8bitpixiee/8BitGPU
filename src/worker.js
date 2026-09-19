import { handleChat } from "./chat.js";
import { STORE_PRODUCTS } from "../store-catalog.js";

const SESSION_LENGTH_SECONDS = 60 * 60 * 24 * 30;
const encoder = new TextEncoder();
const PAYPAL_SANDBOX_API = "https://api-m.sandbox.paypal.com";
const PAYPAL_LIVE_API = "https://api-m.paypal.com";

function storeCatalog(env) {
  const price = (name) => {
    const value = Number(env[name]);
    return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
  };
  return STORE_PRODUCTS.filter((product) => product.enabled !== false).map((product) => ({ ...product, price: product.priceKey ? price(product.priceKey) : null }));
}

function paypalApi(env) { return env.PAYPAL_ENV === "live" ? PAYPAL_LIVE_API : PAYPAL_SANDBOX_API; }
async function paypalToken(env) {
  if (!env.PAYPAL_CLIENT_ID || !env.PAYPAL_CLIENT_SECRET) throw new Error("PayPal credentials are not configured.");
  const response = await fetch(`${paypalApi(env)}/v1/oauth2/token`, { method: "POST", headers: { Authorization: `Basic ${btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`)}`, "content-type": "application/x-www-form-urlencoded" }, body: "grant_type=client_credentials" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error_description || "PayPal authentication failed.");
  return data.access_token;
}

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
    iterations: 100000,
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
  if (Number(request.headers.get("content-length")) > 16384) return null;
  const reader = request.body?.getReader();
  if (!reader) return null;
  const chunks=[]; let size=0;
  try {
    while (true) { const {done,value}=await reader.read(); if(done) break; size+=value.length; if(size>16384){await reader.cancel();return null;} chunks.push(value); }
    const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch { return null; }
}

async function ensureSchema(database) {
  await database.exec("CREATE TABLE IF NOT EXISTS profile_images (user_id TEXT NOT NULL, slot TEXT NOT NULL, image_base64 TEXT NOT NULL, mime TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(user_id, slot));");
  await database.exec("CREATE TABLE IF NOT EXISTS recovery_keys (user_id TEXT PRIMARY KEY, token_hash TEXT NOT NULL UNIQUE);");
  await database.exec("CREATE TABLE IF NOT EXISTS auth_limits (bucket TEXT PRIMARY KEY, attempts INTEGER NOT NULL, expires_at INTEGER NOT NULL);");
  await database.exec("CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE COLLATE NOCASE, password_hash TEXT NOT NULL, password_salt TEXT NOT NULL, created_at INTEGER NOT NULL);");
  await database.exec("CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id));");
  await database.exec("CREATE TABLE IF NOT EXISTS player_data (user_id TEXT PRIMARY KEY, avatar_json TEXT, updated_at INTEGER NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id));");
  await database.exec("CREATE TABLE IF NOT EXISTS player_profiles (user_id TEXT PRIMARY KEY, mood TEXT NOT NULL DEFAULT '', about_text TEXT NOT NULL DEFAULT '', favorites_text TEXT NOT NULL DEFAULT '', theme TEXT NOT NULL DEFAULT 'violet', updated_at INTEGER NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id));");
  await database.exec("CREATE TABLE IF NOT EXISTS player_profile_styles (user_id TEXT PRIMARY KEY, background_color TEXT, paper_color TEXT, panel_color TEXT, edge_color TEXT, accent_color TEXT, ink_color TEXT, wallpaper_url TEXT NOT NULL DEFAULT '', updated_at INTEGER NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id));");
  await database.exec("CREATE TABLE IF NOT EXISTS store_orders (paypal_order_id TEXT PRIMARY KEY, status TEXT NOT NULL, amount TEXT NOT NULL, cart_json TEXT NOT NULL, payer_email TEXT, capture_id TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL);");
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

const profileThemes = new Set(["violet", "pink", "aqua", "midnight"]);
const defaultProfileStyles = {
  violet: { background: "#b99ad2", paper: "#fffdf8", panel: "#f0e7f4", edge: "#724a91", accent: "#b95fd4", ink: "#321c48", wallpaperUrl: "" },
  pink: { background: "#ff8fc4", paper: "#fff9fc", panel: "#ffe3f2", edge: "#de559e", accent: "#ef7db9", ink: "#5a174c", wallpaperUrl: "" },
  aqua: { background: "#6ec5de", paper: "#f6fdff", panel: "#d9f4fb", edge: "#397ea8", accent: "#48afd0", ink: "#153c58", wallpaperUrl: "" },
  midnight: { background: "#160f2b", paper: "#2b1b45", panel: "#39285a", edge: "#b075d9", accent: "#d471f2", ink: "#f7e9ff", wallpaperUrl: "" }
};
const colorFields = ["background", "paper", "panel", "edge", "accent", "ink"];
function profileText(value, maxLength) {
  if (typeof value !== "string" || value.length > maxLength || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) return null;
  return value.trim();
}
function profileStyle(value, theme) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const style = {};
  for (const field of colorFields) {
    const color = value[field];
    if (typeof color !== "string" || !/^#[0-9a-fA-F]{6}$/.test(color)) return null;
    style[field] = color.toLowerCase();
  }
  const wallpaperUrl = typeof value.wallpaperUrl === "string" ? value.wallpaperUrl.trim() : "";
  if (wallpaperUrl.length > 2048) return null;
  if (wallpaperUrl) {
    try { if (new URL(wallpaperUrl).protocol !== "https:") return null; }
    catch { return null; }
  }
  return { ...defaultProfileStyles[theme], ...style, wallpaperUrl };
}
function publicProfile(row) {
  const theme = profileThemes.has(row.theme) ? row.theme : "violet";
  return {
    username: row.username,
    joinedAt: row.createdAt,
    avatar: row.avatar ? JSON.parse(row.avatar) : null,
    mood: row.mood || "",
    about: row.about || "",
    favorites: row.favorites || "",
    theme,
    images: Object.fromEntries((row.images || []).map(image => [image.slot, `/api/profile-images/${encodeURIComponent(row.username)}/${image.slot}?v=${image.updated_at}`])),
    style: {
      ...defaultProfileStyles[theme],
      background: row.backgroundColor || defaultProfileStyles[theme].background,
      paper: row.paperColor || defaultProfileStyles[theme].paper,
      panel: row.panelColor || defaultProfileStyles[theme].panel,
      edge: row.edgeColor || defaultProfileStyles[theme].edge,
      accent: row.accentColor || defaultProfileStyles[theme].accent,
      ink: row.inkColor || defaultProfileStyles[theme].ink,
      wallpaperUrl: row.wallpaperUrl || ""
    },
    updatedAt: row.updatedAt || null
  };
}
async function findProfileBy(database, field, value) {
  const row = await database.prepare(`
    SELECT users.id, users.username, users.created_at AS createdAt,
      player_data.avatar_json AS avatar,
      player_profiles.mood,
      player_profiles.about_text AS about,
      player_profiles.favorites_text AS favorites,
      player_profiles.theme,
      player_profiles.updated_at AS updatedAt
      , player_profile_styles.background_color AS backgroundColor
      , player_profile_styles.paper_color AS paperColor
      , player_profile_styles.panel_color AS panelColor
      , player_profile_styles.edge_color AS edgeColor
      , player_profile_styles.accent_color AS accentColor
      , player_profile_styles.ink_color AS inkColor
      , player_profile_styles.wallpaper_url AS wallpaperUrl
    FROM users
    LEFT JOIN player_data ON player_data.user_id = users.id
    LEFT JOIN player_profiles ON player_profiles.user_id = users.id
    LEFT JOIN player_profile_styles ON player_profile_styles.user_id = users.id
    WHERE users.${field} = ?
  `).bind(value).first();
  if (row) row.images = (await database.prepare("SELECT slot, updated_at FROM profile_images WHERE user_id = ?").bind(row.id).all()).results;
  return row;
}

async function handleApi(request, env, url) {
  if (!env.DB || typeof env.DB.prepare !== "function") {
    return json({ error: "The D1 binding named DB is not available to this deployment." }, 500);
  }
  if (!["GET", "HEAD"].includes(request.method) && request.headers.get("Origin") !== url.origin) return json({ error: "Use this website to submit requests." }, 403);
  await ensureSchema(env.DB);
  const path = url.pathname;
  const imageRead = path.match(/^\/api\/profile-images\/([a-zA-Z0-9_.-]{3,18})\/(wall|1|2|3)$/);
  if (imageRead && request.method === "GET") {
    const image = await env.DB.prepare("SELECT image_base64, mime FROM profile_images JOIN users ON users.id = profile_images.user_id WHERE users.username = ? AND slot = ?").bind(imageRead[1], imageRead[2]).first();
    if (!image) return json({error: "Image not found."}, 404);
    return new Response(base64ToBytes(image.image_base64), {headers: {"content-type": image.mime, "cache-control": "no-cache", "x-content-type-options": "nosniff"}});
  }
  const imageWrite = path.match(/^\/api\/profile\/images\/(wall|1|2|3)$/);
  if (imageWrite && ["PUT", "DELETE"].includes(request.method)) {
    const user = await currentUser(request, env.DB);
    if (!user) return json({error: "Sign in to change your images."}, 401);
    const slot = imageWrite[1];
    if (request.method === "DELETE") {
      await env.DB.prepare("DELETE FROM profile_images WHERE user_id = ? AND slot = ?").bind(user.id, slot).run();
      if (slot === 'wall') await env.DB.prepare("UPDATE player_profile_styles SET wallpaper_url = '' WHERE user_id = ?").bind(user.id).run();
      return json({ok: true});
    }
    const reader = request.body?.getReader();
    if (!reader) return json({error: "Choose an image file."}, 400);
    const chunks = []; let size = 0;
    while (true) {
      const {done, value} = await reader.read(); if (done) break;
      size += value.length;
      if (size > 512 * 1024) { await reader.cancel(); return json({error: "Image must be smaller than 512 KB after resizing."}, 413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const ascii = (start, end) => String.fromCharCode(...bytes.slice(start, end));
    const mime = bytes[0] === 137 && ascii(1,4) === "PNG" && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10 ? "image/png" : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 ? "image/jpeg" : ascii(0,4) === "RIFF" && ascii(8,12) === "WEBP" ? "image/webp" : null;
    if (!mime) return json({error: "Use a PNG, JPEG, or WebP image."}, 400);
    let binary = "";
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    const now = Date.now();
    await env.DB.prepare("INSERT INTO profile_images (user_id,slot,image_base64,mime,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(user_id,slot) DO UPDATE SET image_base64=excluded.image_base64,mime=excluded.mime,updated_at=excluded.updated_at").bind(user.id,slot,btoa(binary),mime,now).run();
    if (slot === 'wall') await env.DB.prepare("UPDATE player_profile_styles SET wallpaper_url = '' WHERE user_id = ?").bind(user.id).run();
    return json({url: `/api/profile-images/${encodeURIComponent(user.username)}/${slot}?v=${now}`});
  }
  if (["/api/auth/login", "/api/auth/register", "/api/auth/recover", "/api/auth/recovery-key"].includes(path) && request.method === "POST") {
    const now=Date.now();
    const bucket=await sha256((request.headers.get("CF-Connecting-IP") || "local")+":"+Math.floor(now/600000));
    await env.DB.prepare("DELETE FROM auth_limits WHERE expires_at < ?").bind(now).run();
    const limit=await env.DB.prepare("INSERT INTO auth_limits (bucket,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(bucket) DO UPDATE SET attempts=attempts+1 RETURNING attempts").bind(bucket,now+600000).first();
    if(limit.attempts>20)return json({error:"Too many account attempts. Please wait ten minutes."},429);
  }
  if (path.startsWith("/api/chat/")) return handleChat(request, env, await currentUser(request, env.DB), readBody);

  if (path === "/api/store/catalog" && request.method === "GET") {
    const products = storeCatalog(env);
    return json({ products, checkout: { paypalReady: Boolean(env.PAYPAL_CLIENT_ID && env.PAYPAL_CLIENT_SECRET), clientId: env.PAYPAL_CLIENT_ID || null, environment: env.PAYPAL_ENV === "live" ? "live" : "sandbox" } });
  }

  if (path === "/api/store/orders" && request.method === "POST") {
    const body = await readBody(request);
    if (!Array.isArray(body?.items) || !body.items.length || body.items.length > 20) return json({ error: "Your shopping bag is empty or invalid." }, 400);
    const catalog = new Map(storeCatalog(env).filter((item) => item.price !== null).map((item) => [item.id, item]));
    const items = [];
    let totalCents = 0;
    for (const line of body.items) {
      const product = catalog.get(line?.id);
      const quantity = Number(line?.quantity);
      if (!product || !Number.isInteger(quantity) || quantity < 1 || quantity > 10) return json({ error: "An item in your bag is unavailable." }, 400);
      totalCents += Math.round(product.price * 100) * quantity;
      items.push({ name: product.name, sku: product.id, quantity: String(quantity), unit_amount: { currency_code: "USD", value: product.price.toFixed(2) } });
    }
    const amount = (totalCents / 100).toFixed(2);
    const token = await paypalToken(env);
    const response = await fetch(`${paypalApi(env)}/v2/checkout/orders`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json", "paypal-request-id": crypto.randomUUID() }, body: JSON.stringify({ intent: "CAPTURE", purchase_units: [{ description: "8BitGPU Storefront", amount: { currency_code: "USD", value: amount, breakdown: { item_total: { currency_code: "USD", value: amount } } }, items }] }) });
    const order = await response.json();
    if (!response.ok) return json({ error: order.message || "PayPal could not create the order." }, 502);
    await env.DB.prepare("INSERT INTO store_orders (paypal_order_id,status,amount,cart_json,created_at,updated_at) VALUES (?,?,?,?,?,?)").bind(order.id, order.status, amount, JSON.stringify(body.items), Date.now(), Date.now()).run();
    return json({ id: order.id });
  }

  const captureMatch = path.match(/^\/api\/store\/orders\/([A-Z0-9-]+)\/capture$/i);
  if (captureMatch && request.method === "POST") {
    const orderId = captureMatch[1];
    const localOrder = await env.DB.prepare("SELECT * FROM store_orders WHERE paypal_order_id = ?").bind(orderId).first();
    if (!localOrder) return json({ error: "That order was not created by this store." }, 404);
    const token = await paypalToken(env);
    const response = await fetch(`${paypalApi(env)}/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "content-type": "application/json", "paypal-request-id": crypto.randomUUID() }, body: "{}" });
    const order = await response.json();
    const capture = order.purchase_units?.[0]?.payments?.captures?.[0];
    if (!response.ok || order.status !== "COMPLETED" || capture?.status !== "COMPLETED") return json({ error: order.message || "The payment was not completed." }, 502);
    await env.DB.prepare("UPDATE store_orders SET status=?,payer_email=?,capture_id=?,updated_at=? WHERE paypal_order_id=?").bind(order.status, order.payer?.email_address || null, capture.id, Date.now(), orderId).run();
    return json({ ok: true, orderId, captureId: capture.id });
  }

  if (path === "/api/auth/recovery-key" && request.method === "POST") {
    const user=await currentUser(request,env.DB);
    if(!user)return json({error:"Sign in first."},401);
    const body=await readBody(request);
    const secret=await env.DB.prepare("SELECT password_hash,password_salt FROM users WHERE id=?").bind(user.id).first();
    if(typeof body?.password!=="string" || body.password.length>128 || !matches(secret.password_hash,await hashPassword(body.password,secret.password_salt)))return json({error:"Your current passcode is incorrect."},401);
    const key=randomBase64(32);
    await env.DB.prepare("INSERT INTO recovery_keys (user_id,token_hash) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET token_hash=excluded.token_hash").bind(user.id,await sha256(key)).run();
    return json({recoveryKey:key});
  }
  if (path === "/api/auth/recover" && request.method === "POST") {
    const body=await readBody(request);
    if(typeof body?.recoveryKey!=="string" || body.recoveryKey.length>100 || typeof body?.password!=="string" || body.password.length<8 || body.password.length>128)return json({error:"Enter your recovery key and a new passcode (8–128 characters)."},400);
    const tokenHash=await sha256(body.recoveryKey.trim());
    const salt=randomBase64(16),hash=await hashPassword(body.password,salt);
    const result=await env.DB.batch([
      env.DB.prepare("UPDATE users SET password_hash=?,password_salt=? WHERE id=(SELECT user_id FROM recovery_keys WHERE token_hash=?)").bind(hash,salt,tokenHash),
      env.DB.prepare("DELETE FROM sessions WHERE user_id=(SELECT user_id FROM recovery_keys WHERE token_hash=?)").bind(tokenHash),
      env.DB.prepare("DELETE FROM recovery_keys WHERE token_hash=?").bind(tokenHash)
    ]);
    if(!result[0].meta.changes)return json({error:"That recovery key is invalid or has already been used."},400);
    return json({ok:true},200,{"set-cookie":"eightbit_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"});
  }
  if (path === "/api/auth/me" && request.method === "GET") {
    const user = await currentUser(request, env.DB);
    return json({ user: user ? publicUser(user) : null });
  }

  if (path === "/api/auth/register" && request.method === "POST") {
    const body = await readBody(request);
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const password = body?.password;
    if (!validUsername(username || "")) return json({ error: "Use 3–18 letters, numbers, dots, dashes, or underscores." }, 400);
    if (typeof password !== "string" || password.length < 8 || password.length > 128) return json({ error: "Your passcode needs at least 8 characters." }, 400);

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
    const username = typeof body?.username === "string" ? body.username.trim() : "";
    const password = body?.password;
    const user = typeof username === "string" ? await env.DB.prepare("SELECT * FROM users WHERE username = ?").bind(username).first() : null;
    if (!user || typeof password !== "string" || password.length > 128 || !matches(user.password_hash, await hashPassword(password, user.password_salt))) {
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

  if (path === "/api/profile/me" && request.method === "GET") {
    const user = await currentUser(request, env.DB);
    if (!user) return json({ error: "Sign in to open your profile." }, 401);
    return json({ profile: publicProfile(await findProfileBy(env.DB, "id", user.id)) });
  }

  if (path === "/api/profile/me" && request.method === "PUT") {
    const user = await currentUser(request, env.DB);
    if (!user) return json({ error: "Sign in to update your profile." }, 401);
    const body = await readBody(request);
    const mood = profileText(body?.mood, 80);
    const about = profileText(body?.about, 1000);
    const favorites = profileText(body?.favorites, 240);
    const theme = typeof body?.theme === "string" && profileThemes.has(body.theme) ? body.theme : null;
    const style = body?.style === undefined && theme ? defaultProfileStyles[theme] : profileStyle(body?.style, theme);
    if (mood === null || about === null || favorites === null || !theme) {
      return json({ error: "Use up to 80 characters for mood, 1,000 for About Me, and 240 for favorites." }, 400);
    }
    if (!style) return json({ error: "Those page colors or wall image link are not valid." }, 400);
    await env.DB.prepare(`
      INSERT INTO player_profiles (user_id, mood, about_text, favorites_text, theme, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        mood = excluded.mood,
        about_text = excluded.about_text,
        favorites_text = excluded.favorites_text,
        theme = excluded.theme,
        updated_at = excluded.updated_at
    `).bind(user.id, mood, about, favorites, theme, Date.now()).run();
    await env.DB.prepare(`
      INSERT INTO player_profile_styles (user_id, background_color, paper_color, panel_color, edge_color, accent_color, ink_color, wallpaper_url, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        background_color = excluded.background_color,
        paper_color = excluded.paper_color,
        panel_color = excluded.panel_color,
        edge_color = excluded.edge_color,
        accent_color = excluded.accent_color,
        ink_color = excluded.ink_color,
        wallpaper_url = excluded.wallpaper_url,
        updated_at = excluded.updated_at
    `).bind(user.id, style.background, style.paper, style.panel, style.edge, style.accent, style.ink, style.wallpaperUrl, Date.now()).run();
    return json({ profile: publicProfile(await findProfileBy(env.DB, "id", user.id)) });
  }

  const profileMatch = path.match(/^\/api\/profile\/([a-zA-Z0-9_.-]{3,18})$/);
  if (profileMatch && request.method === "GET") {
    const profile = await findProfileBy(env.DB, "username", profileMatch[1]);
    if (!profile) return json({ error: "That profile does not exist." }, 404);
    return json({ profile: publicProfile(profile) });
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
        return json({ error: "The player database is temporarily unavailable." }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  }
};



