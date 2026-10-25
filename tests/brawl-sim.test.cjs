const test = require("node:test");
const assert = require("node:assert/strict");
const Sim = require("../client/shared/brawl-sim.js");
const { RACES } = require("../client/shared/brawl-races.js");
const { BIT } = Sim;

const fight = (a = "pixie", b = "pixie") => {
  const s = Sim.create([a, b]);
  while (s.phase === "intro") Sim.step(s, 0, 0);
  return s;
};
const run = (s, frames, b0 = 0, b1 = 0) => {
  for (let i = 0; i < frames; i++) Sim.step(s, typeof b0 === "function" ? b0(i) : b0, typeof b1 === "function" ? b1(i) : b1);
  return s;
};
const close = (s) => {
  s.f[0].x = 400;
  s.f[1].x = 450;
};
const tap = (bit) => (i) => (i === 0 ? bit : 0);

test("the intro counts down into the fight", () => {
  const s = Sim.create(["pixie", "pixie"]);
  assert.equal(s.phase, "intro");
  run(s, Sim.INTRO);
  assert.equal(s.phase, "fight");
});

test("the same inputs always give the same fight", () => {
  const script = (i) => (i % 40 < 20 ? BIT.R : 0) | (i % 25 === 0 ? BIT.A : 0) | (i % 90 === 0 ? BIT.H : 0);
  const other = (i) => (i % 33 < 10 ? BIT.L : 0) | (i % 17 === 0 ? BIT.A : 0) | (i % 60 === 0 ? BIT.S : 0);
  const a = run(fight("clanker", "mermaid"), 1200, script, other);
  const b = run(fight("clanker", "mermaid"), 1200, script, other);
  assert.equal(JSON.stringify(Sim.snapshot(a)), JSON.stringify(Sim.snapshot(b)));
});

test("a snapshot sent over json carries on exactly like the original", () => {
  const live = run(fight("deerbra", "anthro"), 300, (i) => (i % 30 === 0 ? BIT.A : BIT.R), (i) => (i % 20 === 0 ? BIT.H : 0));
  const copy = JSON.parse(JSON.stringify(Sim.snapshot(live)));
  copy.ev = [];
  run(live, 200, BIT.A, BIT.L);
  run(copy, 200, BIT.A, BIT.L);
  assert.equal(JSON.stringify(Sim.snapshot(copy)), JSON.stringify(Sim.snapshot(live)));
});

test("a light attack lands on someone in reach and not on someone far away", () => {
  const near = fight();
  close(near);
  run(near, 20, tap(BIT.A));
  assert.ok(near.f[1].hp < near.f[1].max);
  const far = fight();
  far.f[0].x = 100;
  far.f[1].x = 800;
  run(far, 30, tap(BIT.A));
  assert.equal(far.f[1].hp, far.f[1].max);
});

test("blocking takes a sliver of the damage", () => {
  const open = fight();
  close(open);
  run(open, 20, tap(BIT.H));
  const guarded = fight();
  close(guarded);
  run(guarded, 20, tap(BIT.H), BIT.B);
  const lostOpen = open.f[1].max - open.f[1].hp;
  const lostBlocked = guarded.f[1].max - guarded.f[1].hp;
  assert.ok(lostBlocked > 0 && lostBlocked < lostOpen / 4);
});

test("a special needs meter and spends it", () => {
  const s = fight();
  close(s);
  run(s, 40, tap(BIT.S));
  assert.equal(s.f[0].atk, "");
  s.f[0].meter = 100;
  run(s, 2, tap(BIT.S));
  assert.ok(s.f[0].meter < 60);
});

test("every race has a special that does something", () => {
  for (const race of Object.keys(RACES)) {
    const s = fight(race, "macho");
    s.f[0].meter = 100;
    s.f[0].hp = s.f[0].max - 20;
    s.f[0].x = 420;
    s.f[1].x = 500;
    const before = { hp: s.f[1].hp, mine: s.f[0].hp };
    const seen = new Set();
    for (let i = 0; i < 160; i++) {
      Sim.step(s, i === 0 ? BIT.S : 0, 0);
      for (const e of s.ev) seen.add(e.k);
    }
    const did = s.f[1].hp < before.hp || s.f[0].buff > 0 || s.f[0].hp > before.mine || seen.has("shoot") || seen.has("appear");
    assert.ok(did, race + " special did nothing");
  }
});

test("projectiles fly across the arena and hurt", () => {
  const s = fight("thixie", "bovadill");
  s.f[0].meter = 100;
  s.f[0].x = 200;
  s.f[1].x = 600;
  run(s, 140, tap(BIT.S));
  assert.ok(s.f[1].hp < s.f[1].max);
});

test("void step puts you behind the other fighter", () => {
  const s = fight("null", "pixie");
  s.f[0].meter = 100;
  s.f[0].x = 300;
  s.f[1].x = 500;
  run(s, 14, tap(BIT.S));
  assert.ok(s.f[0].x > s.f[1].x);
  assert.equal(s.f[0].face, -1);
});

test("overclock buffs damage and fades", () => {
  const s = fight("clanker", "pixie");
  s.f[0].meter = 100;
  run(s, 12, tap(BIT.S));
  assert.ok(s.f[0].buff > 200);
  run(s, 320);
  assert.equal(s.f[0].buff, 0);
});

test("bovadill is tougher and slower than a pixie", () => {
  assert.ok(RACES.bovadill.hp > RACES.pixie.hp);
  assert.ok(RACES.bovadill.speed < RACES.pixie.speed);
});

test("pixies get one extra jump in the air and others do not", () => {
  const pixie = fight("pixie", "macho");
  run(pixie, 1, BIT.U);
  run(pixie, 8, 0);
  const before = pixie.f[0].vy;
  run(pixie, 1, BIT.U);
  assert.ok(pixie.f[0].vy < before - 5);
  const macho = fight("macho", "pixie");
  run(macho, 1, BIT.U);
  run(macho, 8, 0);
  const vy = macho.f[0].vy;
  run(macho, 1, BIT.U);
  assert.ok(macho.f[0].vy >= vy);
});

test("knocking someone out ends the round and a second round win ends the match", () => {
  const s = fight();
  s.f[1].hp = 1;
  close(s);
  run(s, 20, tap(BIT.A));
  assert.equal(s.phase, "roundend");
  assert.deepEqual(s.wins, [1, 0]);
  assert.equal(s.f[1].st, "ko");
  run(s, Sim.ROUND_END + 1);
  assert.equal(s.phase, "intro");
  assert.equal(s.round, 2);
  assert.equal(s.f[1].hp, s.f[1].max);
  run(s, Sim.INTRO);
  s.f[1].hp = 1;
  close(s);
  run(s, 20, tap(BIT.A));
  assert.equal(s.phase, "matchend");
  assert.equal(s.winner, 0);
  assert.equal(s.over, true);
});

test("when the clock runs out the healthier fighter takes the round", () => {
  const s = fight();
  s.f[0].hp = 60;
  s.timer = 3;
  run(s, 5);
  assert.equal(s.phase, "roundend");
  assert.deepEqual(s.wins, [0, 1]);
});

test("a chain of hits wears off in damage", () => {
  const s = fight();
  close(s);
  let last = s.f[1].hp;
  const lost = [];
  for (let i = 0; i < 4; i++) {
    run(s, 14, tap(BIT.A));
    s.f[0].x = 400;
    s.f[1].x = 450;
    lost.push(last - s.f[1].hp);
    last = s.f[1].hp;
  }
  assert.ok(lost[0] > 0);
  assert.ok(lost.every((n) => n <= lost[0] + 0.001));
});

test("walls and bodies keep fighters apart and inside", () => {
  const s = fight();
  run(s, 400, BIT.L, BIT.L);
  assert.ok(s.f[0].x >= Sim.LEFT && s.f[1].x >= Sim.LEFT);
  s.f[0].x = 500;
  s.f[1].x = 505;
  run(s, 2);
  assert.ok(Math.abs(s.f[0].x - s.f[1].x) >= Sim.BODY_HALF * 2 - 0.5);
});
