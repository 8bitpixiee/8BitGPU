import test from "node:test";
import assert from "node:assert/strict";
import { once } from "../server/once.js";
import { portrait, roomAvatar } from "../server/chat/chat-avatar.js";

test("once only runs setup one time even when calls pile up", async () => {
  let runs = 0;
  const ready = once(async () => {
    runs++;
    await new Promise((resolve) => setTimeout(resolve, 5));
  });
  await Promise.all([ready({}), ready({}), ready({})]);
  await ready({});
  assert.equal(runs, 1);
});

test("once tries again after setup blows up", async () => {
  let runs = 0;
  const ready = once(async () => {
    if (++runs === 1) throw new Error("d1 had a moment");
  });
  await assert.rejects(ready({}), /d1 had a moment/);
  await ready({});
  assert.equal(runs, 2);
});

test("portrait shrugs off junk", () => {
  assert.equal(portrait("not json"), null);
  assert.equal(portrait("null"), null);
  assert.equal(portrait(JSON.stringify({ bodyAsset: "../../secrets.png" })), null);
});

test("roomAvatar falls back to the default pixie", () => {
  const avatar = roomAvatar("garbage");
  assert.ok(avatar.layers.body);
  assert.ok(avatar.layers.head);
});

test("roomAvatar drops layer paths that try to climb out", () => {
  const avatar = roomAvatar(
    JSON.stringify({
      species: "Pixie",
      skinTone: "Nutmeg",
      build: "Fae",
      layers: { hair: "assets/avatar/../../x.png", eyes: "assets/avatar/eyes_fem_v1.png" },
    }),
  );
  assert.equal(avatar.layers.hair, undefined);
  assert.equal(avatar.layers.eyes, "assets/avatar/eyes_fem_v1.png");
});

test("roomAvatar only trusts the new layout flag when it is really there", () => {
  assert.equal(roomAvatar(JSON.stringify({ species: "Pixie", skinTone: "Nutmeg", build: "Fae" })).layout, 1);
  assert.equal(
    roomAvatar(JSON.stringify({ species: "Pixie", skinTone: "Nutmeg", build: "Fae", layout: 2 })).layout,
    2,
  );
});

test("cleanPicks only takes real badges, five at most, no repeats", async () => {
  const { cleanPicks } = await import("../server/badges.js");
  assert.deepEqual(cleanPicks(["gamer", "cozy"]), ["gamer", "cozy"]);
  assert.equal(cleanPicks(["gamer", "gamer"]), null);
  assert.equal(cleanPicks(["pixiee-pal"]), null);
  assert.equal(cleanPicks(["gamer", "cozy", "artist", "dancer", "builder", "streamer"]), null);
  assert.equal(cleanPicks("gamer"), null);
});

test("friends of the devs earn their badge, case doesn't matter", async () => {
  const { earnedBadges } = await import("../server/badges.js");
  assert.deepEqual(earnedBadges("someone", ["8Bit_Pixiee.dev", "bob"]), ["pixiee-pal"]);
  assert.deepEqual(earnedBadges("someone", ["PICKLE", "8bit_pixiee.dev"]), ["pickle-pal", "pixiee-pal"]);
  assert.deepEqual(earnedBadges("someone", ["bob"]), []);
  assert.deepEqual(earnedBadges("Pickle", []), ["crew"]);
});

test("pickle's body stays on pickle's account", async () => {
  const { mayUseBody } = await import("../server/chat/chat-avatar.js");
  assert.equal(mayUseBody("Pickle", "pickle.png"), true);
  assert.equal(mayUseBody("someone", "pickle.png"), false);
  assert.equal(mayUseBody("someone", "Null.png"), true);
  assert.equal(mayUseBody("someone", undefined), true);
});

test("assembleBadges gives each name its own picks and friend badges", async () => {
  const { assembleBadges } = await import("../server/badges.js");
  const users = [
    { id: "1", username: "mossy" },
    { id: "2", username: "plain" },
    { id: "9", username: "pickle" },
  ];
  const picks = [{ user_id: "1", picks: JSON.stringify(["gamer", "cozy"]) }, { user_id: "2", picks: "not json" }];
  const pairs = [{ a: "1", b: "9" }];
  const devs = [{ id: "9", username: "pickle" }];
  const badges = assembleBadges(users, picks, pairs, devs);
  assert.deepEqual(badges.mossy, { picks: ["gamer", "cozy"], earned: ["pickle-pal"] });
  assert.deepEqual(badges.plain, { picks: [], earned: [] });
  assert.deepEqual(badges.pickle.earned, ["crew"]);
});

test("once doesn't wedge when the request that started setup is cancelled", async () => {
  let runs = 0;
  // the first run never settles, like an I/O promise whose request was dropped
  const ready = once(async () => {
    if (++runs === 1) await new Promise(() => {});
  }, 25);
  const started = Date.now();
  await ready({});
  assert.equal(runs, 2);
  assert.ok(Date.now() - started < 1000);
  await ready({});
  assert.equal(runs, 2);
});

test("once still shares one setup between calls that pile up", async () => {
  let runs = 0;
  const ready = once(async () => {
    runs++;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }, 1000);
  await Promise.all([ready({}), ready({}), ready({}), ready({})]);
  assert.equal(runs, 1);
});

test("admin and administrator are boss names, any case", async () => {
  const { isBossName } = await import("../server/boss.js");
  assert.equal(isBossName("admin"), true);
  assert.equal(isBossName("  Administrator "), true);
  assert.equal(isBossName("adminton"), false);
  assert.equal(isBossName(undefined), false);
});

test("saved accounts keep order, dedupe and cap at five", async () => {
  const { addAccount, parseAccounts, removeAccount, accountsCookie } = await import("../server/accounts.js");
  const tokens = ["a".repeat(24), "b".repeat(24), "c".repeat(24), "d".repeat(24), "e".repeat(24), "f".repeat(24)];
  let saved = [];
  for (const token of tokens) saved = addAccount(saved, token);
  assert.deepEqual(saved, tokens.slice(1));
  assert.deepEqual(addAccount(saved, tokens[2]).at(-1), tokens[2]);
  assert.equal(addAccount(saved, tokens[2]).length, 5);
  assert.deepEqual(removeAccount(saved, tokens[3]).includes(tokens[3]), false);
  const cookie = accountsCookie(saved, 100);
  assert.deepEqual(parseAccounts(cookie.split(";")[0].split("=")[1]), saved);
});

test("parseAccounts ignores junk and base64 tokens survive the round trip", async () => {
  const { parseAccounts, accountsCookie } = await import("../server/accounts.js");
  assert.deepEqual(parseAccounts(undefined), []);
  assert.deepEqual(parseAccounts("short.%E0%A4%A.<script>"), []);
  const token = "ab+/cd==ab+/cd==ab+/cd==ab+/cd==";
  assert.deepEqual(parseAccounts(accountsCookie([token], 5).split(";")[0].split("=").slice(1).join("=")), [token]);
  assert.match(accountsCookie([], 5), /Max-Age=0/);
});
