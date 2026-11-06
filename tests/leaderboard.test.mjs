import test from "node:test";
import assert from "node:assert/strict";
import { betterScore, cleanMeta } from "../server/leaderboard.js";

test("lower is better for lap times, higher for points", () => {
  assert.equal(betterScore("low", 40000, 42000), true);
  assert.equal(betterScore("low", 43000, 42000), false);
  assert.equal(betterScore("high", 10, 5), true);
  assert.equal(betterScore("high", 5, 5), false);
});

test("cleanMeta keeps small plain values and drops the rest", () => {
  assert.deepEqual(cleanMeta({ track: "neon", laps: 3, bad: { x: 1 }, "no way": 1, big: "x".repeat(99) }), { track: "neon", laps: 3, big: "x".repeat(32) });
  assert.deepEqual(cleanMeta([1, 2]), {});
});
