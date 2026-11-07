const test = require("node:test");
const assert = require("node:assert/strict");
const Sim = require("../client/shared/brawl-sim.js");
const AI = require("../client/shared/brawl-ai.js");

function play(races, levels, seeds, { frames = 60000, styles = [], stage = 0 } = {}) {
  const s = Sim.create(races, { stage });
  const brains = [0, 1].map((side) => AI.create({ side, level: levels[side], style: styles[side], seed: seeds[side] }));
  let bad = 0;
  for (let i = 0; i < frames && !s.over; i++) {
    const a = brains[0](s);
    const b = brains[1](s);
    if (a < 0 || a > 255 || b < 0 || b > 255) bad++;
    Sim.step(s, a, b);
  }
  return { s, bad };
}

test("every personality at every tier finishes a match on every stage", () => {
  Object.keys(AI.STYLES).forEach((style, i) => {
    Object.keys(AI.LEVELS).forEach((level, j) => {
      const { s, bad } = play(["pixie", "macho"], [level, "normal"], [i + 1, 7], { styles: [style], stage: (i + j) % Sim.STAGES.length });
      assert.equal(bad, 0, style + " " + level);
      assert.equal(s.over, true, style + " " + level + " never finished");
    });
  });
});

test("the cpu uses throws, air attacks, cancels and supers over a few matches", () => {
  const seen = new Set();
  for (let seed = 1; seed <= 16; seed++) {
    const s = Sim.create(["anthro", "bovadill"]);
    const a = AI.create({ side: 0, level: "brutal", seed });
    const b = AI.create({ side: 1, level: "hard", seed: seed + 50 });
    for (let i = 0; i < 20000 && !s.over; i++) {
      Sim.step(s, a(s), b(s));
      for (const e of s.ev) seen.add(e.k);
      for (const f of s.f) if (f.atk) seen.add("atk:" + f.atk);
    }
  }
  for (const k of ["cancel", "super", "throw", "atk:airlight"]) assert.ok(seen.has(k), "never saw " + k);
});

test("brutal beats easy most of the time", () => {
  let brutal = 0;
  for (let seed = 1; seed <= 10; seed++) {
    const { s } = play(["pixie", "pixie"], ["easy", "brutal"], [seed, seed + 100]);
    if (s.winner === 1) brutal++;
  }
  assert.ok(brutal >= 7, "brutal only won " + brutal);
});

test("the gauntlet gets harder and never repeats your own race", () => {
  const pool = ["pixie", "deerbra", "bovadill", "thixie", "null"];
  const levels = [];
  for (let streak = 0; streak < 10; streak++) {
    const foe = AI.gauntletFoe(streak, "pixie", pool);
    assert.notEqual(foe.race, "pixie");
    assert.ok(AI.LEVELS[foe.level] && AI.STYLES[foe.style]);
    levels.push(Object.keys(AI.LEVELS).indexOf(foe.level));
  }
  assert.ok(levels.every((n, i) => i === 0 || n >= levels[i - 1]));
  assert.ok(AI.gauntletFoe(12, "pixie", pool).hp > AI.gauntletFoe(0, "pixie", pool).hp);
});

test("gauntlet score is wins first and health second", () => {
  assert.equal(AI.gauntletScore(3, 120), 3120);
  assert.ok(AI.gauntletScore(4, 0) > AI.gauntletScore(3, 400));
});
