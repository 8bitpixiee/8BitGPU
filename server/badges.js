import { once } from "./once.js";

// badges anyone can hand themselves
export const SELF_BADGES = [
  "night-owl",
  "early-bird",
  "gamer",
  "artist",
  "musician",
  "streamer",
  "builder",
  "dancer",
  "collector",
  "cozy",
  "chaotic",
  "plant-parent",
  "tea-person",
  "cat-person",
];
export const MAX_PICKS = 5;

// the two devs hand out a badge to whoever is on their friends list
export const CREW = { "8bit_pixiee.dev": "pixiee-pal", pickle: "pickle-pal" };

const ensureBadgeSchema = once(async (db) => {
  await db.exec(
    "CREATE TABLE IF NOT EXISTS player_badges (user_id TEXT PRIMARY KEY, picks TEXT NOT NULL DEFAULT '[]', updated_at INTEGER NOT NULL);",
  );
});

export function cleanPicks(value) {
  if (!Array.isArray(value) || value.length > MAX_PICKS) return null;
  if (new Set(value).size !== value.length) return null;
  return value.every((id) => SELF_BADGES.includes(id)) ? value : null;
}

export function earnedBadges(username, friendNames) {
  const earned = [];
  if (CREW[String(username).toLowerCase()]) earned.push("crew");
  for (const name of friendNames) {
    const badge = CREW[String(name).toLowerCase()];
    if (badge && !earned.includes(badge)) earned.push(badge);
  }
  return earned;
}

export async function badgesFor(db, userId, username) {
  await ensureBadgeSchema(db);
  const saved = await db.prepare("SELECT picks FROM player_badges WHERE user_id=?").bind(userId).first();
  let friends = [];
  try {
    friends = (
      await db
        .prepare(
          "SELECT u.username FROM social_pairs p JOIN users u ON u.id=CASE WHEN p.a=? THEN p.b ELSE p.a END WHERE (p.a=? OR p.b=?) AND p.status='accepted'",
        )
        .bind(userId, userId, userId)
        .all()
    ).results.map((row) => row.username);
  } catch {
    // nobody has opened Social yet, so there is no friends table to read
  }
  return { picks: cleanPicks(JSON.parse(saved?.picks || "[]")) || [], earned: earnedBadges(username, friends) };
}

export async function savePicks(db, userId, picks) {
  await ensureBadgeSchema(db);
  await db
    .prepare(
      "INSERT INTO player_badges (user_id, picks, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET picks=excluded.picks, updated_at=excluded.updated_at",
    )
    .bind(userId, JSON.stringify(picks), Date.now())
    .run();
}

// who earned what for a whole list of names, so a chat window needs one request, not one per message
export function assembleBadges(users, pickRows, pairRows, devs) {
  const picks = new Map(pickRows.map((row) => [row.user_id, row.picks]));
  const paired = new Set(pairRows.map((row) => `${row.a}|${row.b}`));
  const result = {};
  for (const user of users) {
    const friendNames = devs
      .filter((dev) => paired.has(`${user.id}|${dev.id}`) || paired.has(`${dev.id}|${user.id}`))
      .map((dev) => dev.username);
    let own = [];
    try {
      own = cleanPicks(JSON.parse(picks.get(user.id) || "[]")) || [];
    } catch {
      /* a bad row just shows no picks */
    }
    result[user.username] = { picks: own, earned: earnedBadges(user.username, friendNames) };
  }
  return result;
}

export async function badgesForMany(db, usernames) {
  await ensureBadgeSchema(db);
  const marks = (list) => list.map(() => "?").join(",");
  const users = (
    await db.prepare(`SELECT id, username FROM users WHERE username IN (${marks(usernames)})`).bind(...usernames).all()
  ).results;
  if (!users.length) return {};
  const ids = users.map((user) => user.id);
  const pickRows = (
    await db.prepare(`SELECT user_id, picks FROM player_badges WHERE user_id IN (${marks(ids)})`).bind(...ids).all()
  ).results;
  const devNames = Object.keys(CREW);
  const devs = (
    await db.prepare(`SELECT id, username FROM users WHERE username IN (${marks(devNames)})`).bind(...devNames).all()
  ).results;
  let pairRows = [];
  if (devs.length) {
    const devIds = devs.map((dev) => dev.id);
    try {
      pairRows = (
        await db
          .prepare(
            `SELECT a, b FROM social_pairs WHERE status='accepted' AND ((a IN (${marks(devIds)}) AND b IN (${marks(ids)})) OR (b IN (${marks(devIds)}) AND a IN (${marks(ids)})))`,
          )
          .bind(...devIds, ...ids, ...devIds, ...ids)
          .all()
      ).results;
    } catch {
      /* no friends table yet */
    }
  }
  return assembleBadges(users, pickRows, pairRows, devs);
}
