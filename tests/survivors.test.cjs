const test = require("node:test");
const assert = require("node:assert/strict");
const Sim = require("../client/games/survivors.js");

const DT = 1 / 60;
const run = (s, secs, input) => {
  for (let i = 0; i < secs * 60; i++) {
    Sim.step(s, DT, typeof input === "function" ? input(i) : input);
    if (s.phase === "levelup") Sim.choose(s, 0);
  }
  return s;
};
// keep the player alive and out of trouble when a test only cares about something else
const god = (s) => { s.p.hp = s.p.maxHp = 1e9; };

test("the same seed and inputs replay the same run", () => {
  const go = () => run(Sim.create({ seed: 7 }), 30, (i) => ({ x: Math.cos(i / 50), y: Math.sin(i / 70) }));
  const a = go(), b = go();
  assert.equal(a.kills, b.kills);
  assert.equal(a.enemies.length, b.enemies.length);
  assert.equal(a.p.hp, b.p.hp);
});

test("the spatial hash finds exactly what brute force finds", () => {
  const s = Sim.create({ seed: 3 });
  for (let i = 0; i < 600; i++) Sim.spawnEnemy(s, "shambler", (s.rng() - 0.5) * 1500, (s.rng() - 0.5) * 1500);
  Sim.buildGrid(s);
  for (const [x, y, r] of [[0, 0, 40], [300, -200, 120], [-500, 500, 260], [0, 0, 900]]) {
    const got = Sim.collect(s, x, y, r, []).map((e) => e.id).sort((a, b) => a - b);
    const want = s.enemies.filter((e) => Math.hypot(e.x - x, e.y - y) <= r + e.r).map((e) => e.id).sort((a, b) => a - b);
    assert.deepEqual(got, want);
  }
});

test("600 enemies still step fast enough for 60fps", () => {
  const s = Sim.create({ seed: 5 });
  god(s);
  for (let i = 0; i < 600; i++) {
    const a = s.rng() * 6.28;
    Sim.spawnEnemy(s, "bat", Math.cos(a) * 300, Math.sin(a) * 300);
  }
  const t0 = process.hrtime.bigint();
  for (let i = 0; i < 120; i++) Sim.step(s, DT, { x: 0, y: 0 });
  const msPerStep = Number(process.hrtime.bigint() - t0) / 1e6 / 120;
  assert.ok(msPerStep < 8, `step took ${msPerStep.toFixed(2)}ms`);
});

test("xp curve rises and levelling asks for a card", () => {
  for (let l = 1; l < 40; l++) assert.ok(Sim.xpFor(l + 1) > Sim.xpFor(l));
  const s = Sim.create();
  Sim.grantXp(s, Sim.xpFor(1));
  Sim.step(s, DT, null);
  assert.equal(s.phase, "levelup");
  assert.ok(s.choices.length >= 3);
  const before = s.weapons.length + Object.keys(s.passives).length;
  assert.ok(Sim.choose(s, 0));
  assert.equal(s.phase, "play");
  assert.ok(s.weapons.length + Object.keys(s.passives).length >= before);
});

test("two level ups in one go give two cards", () => {
  const s = Sim.create();
  Sim.grantXp(s, Sim.xpFor(1) + Sim.xpFor(2));
  Sim.step(s, DT, null);
  Sim.choose(s, 0);
  assert.equal(s.phase, "levelup");
  Sim.choose(s, 0);
  assert.equal(s.phase, "play");
});

test("every race starts with a real weapon", () => {
  for (const race of Object.keys(Sim.START)) assert.ok(Sim.WEAPONS[Sim.START[race].weapon], race);
  assert.ok(Object.keys(Sim.WEAPONS).filter((id) => Sim.WEAPONS[id].up.length).length >= 8);
  assert.ok(Object.keys(Sim.PASSIVES).length >= 8);
});

test("every base weapon has an evolution tied to a real passive", () => {
  for (const [id, def] of Object.entries(Sim.WEAPONS)) {
    if (!def.evolved) continue;
    assert.ok(Sim.WEAPONS[def.evolved], id);
    assert.ok(Sim.PASSIVES[def.evolvesWith], id);
  }
});

test("each weapon kind actually hurts an enemy", () => {
  for (const id of Object.keys(Sim.WEAPONS)) {
    const s = Sim.create({ seed: 2 });
    god(s);
    s.weapons = [{ id, level: 1, timer: 0 }];
    for (let i = 0; i < 6; i++) Sim.spawnEnemy(s, "brute", 60 + i * 15, (i - 3) * 14);
    run(s, 3, { x: 0, y: 0 });
    assert.ok(s.hits > 0, `${id} did nothing`);
  }
});

test("a chest evolves a maxed weapon that has its passive", () => {
  const s = Sim.create({ race: "pixie" });
  s.weapons[0].level = Sim.MAX_LEVEL;
  s.passives.spellbook = 1;
  Sim.openChest(s);
  assert.equal(s.weapons[0].id, "starstorm");
  assert.ok(s.events.some((e) => e.t === "chest" && e.got.includes("Starstorm")));
});

test("a chest with nothing to evolve levels things up instead", () => {
  const s = Sim.create();
  Sim.openChest(s);
  assert.ok(s.weapons[0].level >= 2);
});

test("passives change the numbers", () => {
  const s = Sim.create({ hp: 100 });
  s.passives = { might: 2, heart: 1, boots: 1, plating: 3 };
  Sim.recompute(s);
  assert.ok(Math.abs(s.p.dmgMul - 1.24) < 1e-9);
  assert.equal(s.p.maxHp, 118);
  assert.equal(s.p.armor, 3);
  assert.ok(s.p.speed > 120);
});

test("bosses and the final boss arrive on schedule", () => {
  const s = Sim.create({ seed: 4 });
  god(s);
  const seen = [];
  for (let i = 0; i < 700 * 60; i++) {
    Sim.step(s, DT, { x: 0, y: 0 });
    if (s.phase === "levelup") Sim.choose(s, 0);
    for (const e of s.events) if (e.t === "boss") seen.push(e.name);
    s.events.length = 0;
    s.enemies = s.enemies.filter((e) => e.def.boss); // skip the horde, this test only watches the schedule
  }
  assert.deepEqual(seen, ["Gloom Stag", "Hollow Knight", "Lich Moth", "The Static King"]);
});

test("killing the final boss wins the run and the score pays for it", () => {
  const s = Sim.create();
  god(s);
  s.t = Sim.FINAL_AT;
  const king = Sim.spawnEnemy(s, "boss4", 100, 0);
  const before = Sim.score(s);
  Sim.killEnemy(s, king);
  assert.equal(s.phase, "won");
  assert.ok(Sim.score(s) > before + 9000);
});

test("dying: surrounded and doing nothing ends the run", () => {
  const s = Sim.create({ seed: 9 });
  s.weapons = [];
  run(s, 200, { x: 0, y: 0 });
  assert.equal(s.phase, "dead");
});

test("score rewards time and kills", () => {
  const a = Sim.create(), b = Sim.create();
  b.t = 100;
  assert.ok(Sim.score(b) > Sim.score(a));
  a.kills = 100;
  assert.ok(Sim.score(a) > Sim.score(Sim.create()));
});

test("armor never lowers a hit below 1", () => {
  const s = Sim.create();
  s.passives.plating = 5;
  Sim.recompute(s);
  const hp = s.p.hp;
  Sim.spawnEnemy(s, "gnat", 0, 0);
  Sim.step(s, DT, null);
  assert.ok(hp - s.p.hp >= 1);
});
