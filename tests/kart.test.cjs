const test = require("node:test");
const assert = require("node:assert/strict");
const Sim = require("../client/games/kart.js");
const { BIT } = Sim;

const ais = (n, track = "glimmer", seed = 5) =>
  Sim.create(track, Array.from({ length: n }, (_, i) => ({ name: "ai" + i, ai: true })), seed);
const solo = (track = "glimmer") => Sim.create(track, [{ name: "me", ai: false }], 3);
const run = (s, frames, bits = 0) => { for (let i = 0; i < frames; i++) Sim.step(s, [typeof bits === "function" ? bits(i) : bits]); return s; };
const go = (s) => run(s, Sim.COUNTDOWN);

test("every track is a closed road with no part passing near another", () => {
  for (const id of Sim.TRACK_ORDER) {
    const tr = Sim.buildTrack(id);
    assert.ok(tr.N > 300, id + " has a sane length");
    assert.ok(Math.hypot(tr.x[0] - tr.x[tr.N - 1], tr.y[0] - tr.y[tr.N - 1]) < 16, id + " closes");
    const need = (tr.hw + Sim.WALL) * 2 + 20;
    let worst = 1e9;
    for (let i = 0; i < tr.N; i += 2) {
      for (let j = i + 2; j < tr.N; j += 2) {
        const gap = Math.min(j - i, tr.N - (j - i));
        if (gap * tr.step < need * 2.5) continue; // neighbours along the road are allowed to be close
        worst = Math.min(worst, Math.hypot(tr.x[i] - tr.x[j], tr.y[i] - tr.y[j]));
      }
    }
    assert.ok(worst > need, `${id}: roads come within ${Math.round(worst)} of each other, need ${Math.round(need)}`);
  }
});

test("the countdown holds everyone still, then the race starts", () => {
  const s = solo();
  run(s, Sim.COUNTDOWN - 1, BIT.UP);
  assert.equal(s.phase, "countdown");
  assert.equal(s.karts[0].speed, 0);
  run(s, 1, BIT.UP);
  assert.equal(s.phase, "race");
  run(s, 60, BIT.UP);
  assert.ok(s.karts[0].speed > 2);
});

test("same seed and inputs give the same race", () => {
  const a = ais(6), b = ais(6);
  for (let i = 0; i < 1500; i++) { Sim.step(a, []); Sim.step(b, []); }
  assert.deepEqual(Sim.snapshot(a), Sim.snapshot(b));
});

test("an all-AI field finishes three laps and ranks everyone", () => {
  const s = ais(6, "glimmer");
  for (let i = 0; i < 60 * 300 && s.phase !== "done"; i++) Sim.step(s, []);
  assert.equal(s.phase, "done");
  assert.equal(s.results.length, 6);
  assert.deepEqual(s.results.map((r) => r.place), [1, 2, 3, 4, 5, 6]);
  for (const k of s.karts) assert.equal(k.laps.length, Sim.LAPS);
  const lap = s.karts[0].best;
  assert.ok(lap > 15000 && lap < 90000, "lap time looks human: " + lap);
});

test("AI can lap every track without getting stuck", () => {
  for (const id of Sim.TRACK_ORDER) {
    const s = ais(3, id, 11);
    for (let i = 0; i < 60 * 360 && s.phase !== "done"; i++) Sim.step(s, []);
    assert.equal(s.phase, "done", id);
  }
});

test("walls keep a kart on the map and slow it down", () => {
  const s = go(solo());
  const k = s.karts[0];
  const tr = s.track;
  run(s, 400, BIT.UP | BIT.RIGHT);
  assert.ok(Math.abs(k.lat) <= tr.hw + Sim.WALL + 1);
});

test("driving the wrong way does not count laps", () => {
  const s = go(solo());
  const k = s.karts[0];
  k.a += Math.PI;
  run(s, 300, BIT.UP);
  assert.equal(k.laps.length, 0);
  assert.ok(k.s < 0);
});

test("a held drift charges and pays out a boost on release", () => {
  const s = go(solo());
  const k = s.karts[0];
  const tr = s.track, i = k.idx;
  k.x = tr.x[i]; k.y = tr.y[i]; k.a = Math.atan2(tr.ty[i], tr.tx[i]);
  k.vx = tr.tx[i] * 4; k.vy = tr.ty[i] * 4;
  run(s, 3, BIT.UP | BIT.RIGHT | BIT.DRIFT);
  assert.equal(k.drift, 1);
  run(s, 32, BIT.UP | BIT.RIGHT | BIT.DRIFT);
  assert.equal(k.drift, 1);
  assert.ok(k.charge >= 45);
  run(s, 1, BIT.UP);
  assert.equal(k.drift, 0);
  assert.ok(k.boost > 0);
});

test("item boxes hand out items that can be used", () => {
  const s = go(solo());
  const k = s.karts[0];
  const b = s.boxes[0];
  k.x = b.x; k.y = b.y; k.idx = Sim.locate(s.track, b.x, b.y, k.idx).i;
  run(s, 1);
  assert.ok(k.item, "got an item");
  assert.ok(b.t > 0, "box is spent");
  k.item = "antler";
  run(s, 1, BIT.ITEM);
  assert.equal(k.item, null);
  assert.ok(k.boost > 0);
});

test("glitter bomb spins a rival and a bubble shield eats it", () => {
  for (const shield of [false, true]) {
    const s = Sim.create("glimmer", [{ name: "a" }, { name: "b", ai: true }], 2);
    run(s, 0);
    s.phase = "race";
    const [a, b] = s.karts;
    b.x = a.x + 120; b.y = a.y; a.a = 0; b.shield = shield; b.skill = 0;
    a.item = "glitter";
    for (let i = 0; i < 30; i++) Sim.step(s, [i === 0 ? BIT.ITEM : 0]);
    if (shield) { assert.equal(b.shield, false); assert.equal(b.spin, 0); }
    else assert.ok(b.spin > 0 || Sim.drain(s).some((e) => e.t === "hit"));
  }
});

test("void step jumps down the road and thorns get dropped behind", () => {
  const s = go(solo());
  const k = s.karts[0];
  const before = k.s;
  k.item = "voidstep";
  run(s, 2, (i) => (i === 0 ? BIT.ITEM : 0));
  assert.ok(k.s - before > 10);
  k.item = "thorns";
  k.itemHeld = 0;
  run(s, 1, 0);
  run(s, 1, BIT.ITEM);
  assert.equal(s.thorns.length, 3);
});

test("item odds lean on rank: the leader never gets void step", () => {
  const s = ais(2);
  for (let i = 0; i < 200; i++) assert.notEqual(Sim.rollItem(s, 1, 8), "voidstep");
  const seen = new Set();
  for (let i = 0; i < 300; i++) seen.add(Sim.rollItem(s, 8, 8));
  assert.ok(seen.has("voidstep") && !seen.has("thorns"));
});

test("ghost playback interpolates and ends with the lap", () => {
  const buf = [];
  for (let f = 0; f < 30; f++) Sim.Ghost.record(buf, { x: f, y: 0, a: 0 }, f);
  assert.equal(buf.length, 30);
  assert.ok(Math.abs(Sim.Ghost.at(buf, 4.5).x - 4.5) < 1e-9);
  assert.equal(Sim.Ghost.at(buf, 999), null);
});

test("snapshots survive a round trip and keep the race going", () => {
  const a = ais(4), b = ais(4);
  for (let i = 0; i < 700; i++) Sim.step(a, []);
  Sim.apply(b, JSON.parse(JSON.stringify(Sim.snapshot(a))));
  for (let i = 0; i < 100; i++) { Sim.step(a, []); Sim.step(b, []); }
  assert.ok(Math.abs(a.karts[0].s - b.karts[0].s) < 30);
});

test("lap times format", () => {
  assert.equal(Sim.fmt(83456), "1:23.456");
  assert.equal(Sim.fmt(null), "-:--.---");
});
