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
  run(s, Sim.ROUND_END + 100);
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

test("a light that connects cancels into a heavy before it finishes recovering", () => {
  const s = fight();
  close(s);
  s.f[1].hp = s.f[1].max = 500;
  let sawCancel = false;
  for (let i = 0; i < 40; i++) {
    // light on the first frame, heavy tapped on the frame after the light connects
    Sim.step(s, i === 0 ? BIT.A : i === 8 ? BIT.H : 0, 0);
    if (s.ev.some((e) => e.k === "cancel")) sawCancel = true;
    s.f[0].x = 400;
    s.f[1].x = 450;
  }
  assert.ok(sawCancel, "no cancel");
  assert.ok(s.f[1].combo >= 2);
});

test("a whiffed move cannot be cancelled", () => {
  const s = fight();
  s.f[0].x = 100;
  s.f[1].x = 800;
  let cancelled = false;
  for (let i = 0; i < 30; i++) {
    Sim.step(s, i === 0 ? BIT.A : i === 8 ? BIT.H : 0, 0);
    if (s.ev.some((e) => e.k === "cancel")) cancelled = true;
  }
  assert.equal(cancelled, false);
});

test("lights chain at most three times", () => {
  const s = fight();
  close(s);
  s.f[1].hp = s.f[1].max = 5000;
  let cancels = 0;
  for (let i = 0; i < 120; i++) {
    Sim.step(s, i % 4 === 0 ? BIT.A : 0, 0);
    cancels += s.ev.filter((e) => e.k === "cancel").length;
    s.f[0].x = 400;
    s.f[1].x = 450;
  }
  assert.ok(cancels >= 1);
  assert.ok(s.f[0].chain <= Sim.MAX_CHAIN);
});

test("pressing attack in the air does an air attack that hits a standing fighter", () => {
  const s = fight("deerbra", "macho");
  s.f[0].x = 420;
  s.f[1].x = 470;
  run(s, 1, BIT.U);
  run(s, 6, 0);
  assert.ok(s.f[0].y < Sim.FLOOR);
  run(s, 1, BIT.A);
  assert.equal(s.f[0].atk, "airlight");
  run(s, 30, 0);
  assert.ok(s.f[1].hp < s.f[1].max, "air attack missed");
  assert.equal(s.f[0].atk, "");
});

test("block plus special spends a full meter on the super and wind-up cannot be hit", () => {
  const s = fight("macho", "macho");
  s.f[0].meter = 100;
  close(s);
  let supered = false;
  for (let i = 0; i < 120; i++) {
    Sim.step(s, i === 0 ? BIT.B | BIT.S : BIT.B, 0);
    if (s.ev.some((e) => e.k === "super")) supered = true;
    if (i === 3) {
      assert.ok(s.f[0].meter < 5);
      assert.ok(s.f[0].inv > 0);
      assert.equal(s.f[0].atk, "super");
    }
  }
  assert.ok(supered);
  assert.ok(s.f[1].hp < s.f[1].max - 20, "super did little");
});

test("without a full meter block plus special is the normal special", () => {
  const s = fight();
  s.f[0].meter = 70;
  run(s, 2, (i) => (i === 0 ? BIT.B | BIT.S : BIT.B));
  assert.equal(s.f[0].atk, "special");
  assert.ok(s.f[0].meter >= 20 && s.f[0].meter < 25);
});

test("every race super lands or does its job", () => {
  for (const race of Object.keys(RACES)) {
    const s = fight(race, "macho");
    s.f[0].meter = 100;
    s.f[0].x = 420;
    s.f[1].x = 500;
    s.f[0].hp = s.f[0].max - 40;
    const hp = [s.f[0].hp, s.f[1].hp];
    for (let i = 0; i < 200; i++) Sim.step(s, i === 0 ? BIT.B | BIT.S : 0, 0);
    assert.ok(s.f[1].hp < hp[1] || s.f[0].hp > hp[0], race + " super did nothing");
  }
});

test("a throw beats a guard, and two throws at once break apart", () => {
  const s = fight();
  close(s);
  run(s, 12, tap(BIT.T), BIT.B);
  assert.ok(s.f[1].hp < s.f[1].max - 10, "throw did not go through block");
  assert.equal(s.f[1].st === "hit" || s.f[1].stun > 0, true);
  const t = fight();
  close(t);
  const events = [];
  for (let i = 0; i < 20; i++) {
    Sim.step(t, i === 0 ? BIT.T : 0, i === 0 ? BIT.T : 0);
    events.push(...t.ev.map((e) => e.k));
  }
  assert.ok(events.includes("tech"));
  assert.equal(t.f[0].hp, t.f[0].max);
  assert.equal(t.f[1].hp, t.f[1].max);
});

test("a throw whiffs on someone in the air", () => {
  const s = fight();
  close(s);
  s.f[1].y = Sim.FLOOR - 120;
  s.f[1].vy = -2;
  run(s, 10, tap(BIT.T));
  assert.equal(s.f[1].hp, s.f[1].max);
});

test("blocking too many hits breaks the guard", () => {
  const s = fight();
  close(s);
  let broke = false;
  for (let i = 0; i < 600 && !broke; i++) {
    s.f[0].x = 400;
    s.f[1].x = 450;
    Sim.step(s, i % 30 === 0 ? BIT.H : 0, BIT.B);
    if (s.ev.some((e) => e.k === "gbreak")) broke = true;
  }
  assert.ok(broke, "guard never broke");
  assert.ok(s.f[1].stun > 20);
});

test("the guard gauge drains again while you are not blocking", () => {
  const s = fight();
  s.f[1].gd = 30;
  run(s, 200);
  assert.equal(s.f[1].gd, 0);
});

test("the knockout plays in slow motion and still ends", () => {
  const s = fight();
  s.f[1].hp = 1;
  close(s);
  run(s, 20, tap(BIT.A));
  const start = s.pt;
  run(s, 30);
  assert.ok(start - s.pt < 15, "not slowed: " + (start - s.pt));
  run(s, Sim.ROUND_END + 100);
  assert.equal(s.phase, "intro");
});

test("stages: the same match id always gets the same stage", () => {
  assert.equal(Sim.stageFor("abc"), Sim.stageFor("abc"));
  const seen = new Set(["a", "bb", "ccc", "dddd", "eeeee", "ffffff"].map(Sim.stageFor));
  assert.ok(seen.size > 1);
  for (const id of seen) assert.ok(id >= 0 && id < Sim.STAGES.length);
});

test("neon stage zap hurts grounded fighters in the middle and not those outside it", () => {
  const s = Sim.create(["pixie", "pixie"], { stage: Sim.STAGES.findIndex((x) => x.hazard === "zap") });
  while (s.phase === "intro") Sim.step(s, 0, 0);
  s.timer = Sim.ROUND - 355;
  s.f[0].x = 470;
  s.f[1].x = 150;
  assert.equal(Sim.zapState(s), 1);
  run(s, 12);
  assert.ok(s.f[0].hp < s.f[0].max);
  assert.equal(s.f[1].hp, s.f[1].max);
});

test("docks barrels drop on a timer and hit whoever is under them", () => {
  const s = Sim.create(["pixie", "pixie"], { stage: Sim.STAGES.findIndex((x) => x.hazard === "barrel") });
  while (s.phase === "intro") Sim.step(s, 0, 0);
  s.timer = Sim.ROUND - 399;
  run(s, 2);
  assert.equal(s.h.length, 1);
  s.f[0].x = s.h[0].x;
  s.f[1].x = Math.min(Sim.RIGHT, s.h[0].x + 400);
  run(s, 120);
  assert.equal(s.h.length, 0);
  assert.ok(s.f[0].hp < s.f[0].max);
});

test("rooftop wind pushes fighters and a copy of the state keeps pushing the same", () => {
  const s = Sim.create(["pixie", "pixie"], { stage: Sim.STAGES.findIndex((x) => x.hazard === "wind") });
  while (s.phase === "intro") Sim.step(s, 0, 0);
  s.timer = Sim.ROUND - 100;
  s.f[0].x = 300;
  s.f[1].x = 600;
  const copy = JSON.parse(JSON.stringify(Sim.snapshot(s)));
  copy.ev = [];
  run(s, 60);
  run(copy, 60);
  assert.ok(s.f[0].x > 300);
  assert.equal(JSON.stringify(Sim.snapshot(s)), JSON.stringify(Sim.snapshot(copy)));
});

test("the protocol version is a number the server can check", () => {
  assert.ok(Number.isInteger(Sim.PROTOCOL) && Sim.PROTOCOL >= 2);
});
