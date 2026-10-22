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
