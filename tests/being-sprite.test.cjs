const test = require("node:test");
const assert = require("node:assert/strict");
const { createPlayer, STATES, DURATIONS, FRAMES, LOOPS } = require("../client/desktop/being-sprite.js");

test("idles on row zero and loops its eight frames", () => {
  const player = createPlayer();
  assert.deepEqual(player.at(0), { state: "idle", row: 0, frame: 0 });
  assert.equal(player.at(DURATIONS[0] * 3).frame, 3);
  assert.equal(player.at(DURATIONS[0] * 9).frame, 1);
});

test("an action starts on its first frame, on its own row", () => {
  const player = createPlayer();
  assert.ok(player.play("wave", 5000));
  assert.deepEqual(player.at(5000), { state: "wave", row: STATES.indexOf("wave"), frame: 0 });
  assert.equal(player.at(5000 + DURATIONS[10] * 2).frame, 2);
});

test("an action hands back to idle after its loops", () => {
  const player = createPlayer();
  player.play("spin", 1000);
  const done = 1000 + DURATIONS[9] * FRAMES * LOOPS;
  assert.equal(player.at(done - 1).state, "spin");
  assert.equal(player.at(done).state, "idle");
});

test("junk and idle are not actions", () => {
  const player = createPlayer();
  assert.equal(player.play("backflip", 0), false);
  assert.equal(player.play("idle", 0), false);
});

test("reduced motion sticks to the first idle frame", () => {
  const player = createPlayer();
  player.play("dance", 0);
  assert.deepEqual(player.at(450, true), { state: "idle", row: 0, frame: 0 });
});
