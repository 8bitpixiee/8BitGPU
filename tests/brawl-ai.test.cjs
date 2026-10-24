const test = require("node:test");
const assert = require("node:assert/strict");
const Sim = require("../client/shared/brawl-sim.js");
const AI = require("../client/shared/brawl-ai.js");
const { RACES } = require("../client/shared/brawl-races.js");

function play(races, levels, seeds, frames = 60000) {
  const s = Sim.create(races);
  const brains = [AI.create({ side: 0, level: levels[0], seed: seeds[0] }), AI.create({ side: 1, level: levels[1], seed: seeds[1] })];
  let bad = 0;
  for (let i = 0; i < frames && !s.over; i++) {
    const a = levels[0] ? brains[0](s) : 0;
    const b = levels[1] ? brains[1](s) : 0;
    if (a < 0 || a > 127 || b < 0 || b > 127) bad++;
    Sim.step(s, a, b);
  }
  return { s, bad };
}

test("two cpus play a whole match and someone wins it", () => {
  const { s, bad } = play(["pixie", "macho"], ["normal", "normal"], [3, 4]);
  assert.equal(bad, 0);
  assert.equal(s.over, true);
  assert.ok(s.winner === 0 || s.winner === 1 || s.wins[0] + s.wins[1] >= 2);
});

test("a cpu fight is repeatable from the same seeds", () => {
  const a = play(["thixie", "deerbra"], ["hard", "normal"], [9, 10]).s;
  const b = play(["thixie", "deerbra"], ["hard", "normal"], [9, 10]).s;
  assert.equal(JSON.stringify(Sim.snapshot(a)), JSON.stringify(Sim.snapshot(b)));
});

test("a hard cpu beats someone standing still", () => {
  let wins = 0;
  for (const race of Object.keys(RACES)) {
    const { s } = play([race, "pixie"], ["hard", null], [5, 6], 12000);
    if (s.wins[0] >= 1 || s.f[0].hp > s.f[1].hp) wins++;
  }
  assert.ok(wins >= Object.keys(RACES).length - 1, "only " + wins + " races managed to hit a dummy");
});

test("every race can be driven by the cpu without breaking the fight", () => {
  for (const race of Object.keys(RACES)) {
    const { s, bad } = play([race, "bovadill"], ["normal", "easy"], [1, 2], 6000);
    assert.equal(bad, 0, race);
    assert.ok(Number.isFinite(s.f[0].x) && Number.isFinite(s.f[1].x), race);
    assert.ok(s.f[0].hp >= 0 && s.f[1].hp >= 0, race);
  }
});

test("easy is easier to beat than hard", () => {
  let easy = 0;
  let hard = 0;
  for (let seed = 1; seed <= 6; seed++) {
    easy += play(["pixie", "pixie"], [null, "easy"], [seed, seed], 3000).s.f[0].hp;
    hard += play(["pixie", "pixie"], [null, "hard"], [seed, seed], 3000).s.f[0].hp;
  }
  assert.ok(hard <= easy, "hard dealt less damage than easy");
});
