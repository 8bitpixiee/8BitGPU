const test = require("node:test");
const assert = require("node:assert/strict");
const { SPOTS, GATED, spotAt, mayEmote } = require("../client/shared/room-spots.js");

test("drink, smoke and shroom are the gated emotes", () => {
  assert.deepEqual([...GATED].sort(), ["drink", "shroom", "smoke"]);
});

test("standing on a spot finds it, standing across the room does not", () => {
  const bar = SPOTS.arcade.find((spot) => spot.id === "bar");
  assert.equal(spotAt("arcade", bar.x, bar.y)?.id, "bar");
  assert.equal(spotAt("arcade", 49, 73), null);
  assert.equal(spotAt("pillow", bar.x, bar.y), null);
});

test("horizontal distance counts for more on a wide stage", () => {
  const bar = SPOTS.arcade.find((spot) => spot.id === "bar");
  // 7 percent sideways is 10.5 height-percent on a 3:2 room, past the radius
  assert.equal(spotAt("arcade", bar.x + 7, bar.y), null);
  assert.equal(spotAt("arcade", bar.x, bar.y + 7)?.id, "bar");
});

test("each gated emote only works at its own spot", () => {
  const bar = SPOTS.arcade.find((spot) => spot.id === "bar");
  const stump = SPOTS.arcade.find((spot) => spot.id === "stump");
  assert.equal(mayEmote("arcade", "drink", bar.x, bar.y), true);
  assert.equal(mayEmote("arcade", "smoke", bar.x, bar.y), true);
  assert.equal(mayEmote("arcade", "shroom", bar.x, bar.y), false);
  assert.equal(mayEmote("arcade", "shroom", stump.x, stump.y), true);
  assert.equal(mayEmote("arcade", "drink", stump.x, stump.y), false);
});

test("the pillow room has nowhere to drink, and everything else stays free", () => {
  assert.equal(mayEmote("pillow", "drink", 50, 80), false);
  assert.equal(mayEmote("pillow", "dance", 50, 80), true);
  assert.equal(mayEmote("arcade", "wave", 1, 1), true);
});

test("the server's slack lets a slightly late position through", () => {
  const bar = SPOTS.arcade.find((spot) => spot.id === "bar");
  assert.equal(mayEmote("arcade", "drink", bar.x, bar.y + bar.radius * 1.4), true);
  assert.equal(mayEmote("arcade", "drink", bar.x, bar.y + bar.radius * 2), false);
});

test("the arcade cabinets open the games window and are not an emote", () => {
  const cabinets = SPOTS.arcade.find((spot) => spot.id === "cabinets");
  assert.equal(cabinets.actions[0].open, "minigames");
  assert.equal(spotAt("arcade", cabinets.x, cabinets.y)?.id, "cabinets");
  assert.equal(GATED.has(undefined), false);
});
