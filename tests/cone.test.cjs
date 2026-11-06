const test = require("node:test");
const assert = require("node:assert/strict");
const Cone = require("../client/games/cone.js");

// park the crane exactly where we want it, then let go
const dropAt = (s, x) => {
  s.mover.x = x;
  return Cone.drop(s);
};

test("a fresh game has a base cone and a crane on the left", () => {
  const s = Cone.create();
  assert.equal(s.stack.length, 1);
  assert.equal(s.phase, "play");
  assert.equal(s.mover.w, Cone.BASE_W);
  assert.equal(s.mover.x, Cone.MARGIN);
});

test("the crane stays inside the walls and speeds up", () => {
  const s = Cone.create();
  for (let i = 0; i < 2000; i++) {
    Cone.step(s);
    assert.ok(s.mover.x >= Cone.MARGIN && s.mover.x <= Cone.W - Cone.MARGIN);
  }
  assert.ok(Cone.speedAt(30) > Cone.speedAt(0));
  assert.equal(Cone.speedAt(10000), 6);
});

test("dead centre is a perfect and builds the combo", () => {
  const s = Cone.create();
  const ev = dropAt(s, 160);
  assert.equal(ev.type, "perfect");
  assert.equal(s.combo, 1);
  assert.equal(s.stack[1].w, Cone.BASE_W);
  assert.ok(s.score > 0);
});

test("three perfects in a row bump the multiplier and regrow a trimmed cone", () => {
  const s = Cone.create();
  dropAt(s, 130); // trim: narrower than base
  const narrow = s.stack[1].w;
  assert.ok(narrow < Cone.BASE_W);
  for (let i = 0; i < 3; i++) dropAt(s, s.stack[s.stack.length - 1].x);
  assert.equal(s.combo, 3);
  assert.equal(Cone.multiplier(s.combo), 2);
  assert.ok(s.stack[s.stack.length - 1].w > narrow);
});

test("off-centre trims the cone and breaks the combo", () => {
  const s = Cone.create();
  dropAt(s, 160);
  const ev = dropAt(s, 160 + 20);
  assert.equal(ev.type, "trim");
  assert.equal(s.combo, 0);
  assert.equal(s.stack[2].w, Cone.BASE_W - 20);
  assert.equal(ev.slice.w, 20);
  assert.equal(ev.slice.side, 1);
  assert.equal(s.stack[2].x, 160 + 10);
});

test("missing the tower ends the run and stops the crane", () => {
  const s = Cone.create();
  const ev = dropAt(s, Cone.MARGIN); // 136 away from a 96 wide cone
  assert.equal(ev.type, "miss");
  assert.equal(s.phase, "over");
  const x = s.mover.x;
  Cone.step(s);
  assert.equal(s.mover.x, x);
  assert.equal(Cone.drop(s), null);
});

test("multiplier is capped", () => {
  assert.equal(Cone.multiplier(0), 1);
  assert.equal(Cone.multiplier(2), 1);
  assert.equal(Cone.multiplier(300), 8);
});

test("modes: classic is free, the rest unlock from best tower or score", () => {
  assert.ok(Object.keys(Cone.MODES).length >= 4);
  assert.ok(Cone.isUnlocked("classic", {}));
  assert.ok(!Cone.isUnlocked("ghost", {}));
  assert.ok(Cone.isUnlocked("ghost", { bestCones: 12 }));
  assert.ok(Cone.isUnlocked("gusty", { bestScore: 1500 }));
  assert.ok(!Cone.isUnlocked("chaos", { bestCones: 24 }));
  assert.ok(Cone.isUnlocked("chaos", { bestCones: 25 }));
  assert.ok(!Cone.isUnlocked("nope", { bestCones: 99 }));
  assert.match(Cone.unlockHint("ghost"), /12 cones/);
});

test("harder modes pay more for the same drop", () => {
  const a = Cone.create({ mode: "classic" });
  const b = Cone.create({ mode: "chaos" });
  assert.ok(dropAt(b, 160).points > dropAt(a, 160).points);
});

test("ghost hides the crane some of the time, but not early", () => {
  const s = Cone.create({ mode: "ghost" });
  s.t = 80;
  assert.ok(Cone.visible(s));
  s.n = 6;
  assert.ok(!Cone.visible(s));
  assert.ok(Cone.visible(Cone.create({ mode: "classic" })));
});

test("chaos reverses the crane mid-swing, and a seed replays the same swing", () => {
  const run = (seed) => {
    const s = Cone.create({ mode: "chaos", seed });
    s.n = 30;
    s.mover.x = 160;
    let flips = 0;
    let dir = s.mover.dir;
    const xs = [];
    for (let i = 0; i < 600; i++) {
      Cone.step(s);
      if (s.mover.dir !== dir) { flips++; dir = s.mover.dir; }
      xs.push(s.mover.x);
    }
    return { flips, xs };
  };
  const a = run(5);
  assert.ok(a.flips > 3);
  assert.deepEqual(a.xs, run(5).xs);
});

test("gusty changes the crane speed over time", () => {
  const s = Cone.create({ mode: "gusty" });
  const speeds = new Set();
  let prev = s.mover.x;
  for (let i = 0; i < 120; i++) {
    Cone.step(s);
    speeds.add(Math.abs(s.mover.x - prev).toFixed(2));
    prev = s.mover.x;
  }
  assert.ok(speeds.size > 20);
});

test("a long perfect run never grows past the base width", () => {
  const s = Cone.create();
  for (let i = 0; i < 40; i++) dropAt(s, s.stack[s.stack.length - 1].x);
  assert.ok(s.stack.every((c) => c.w <= Cone.BASE_W));
  assert.equal(s.perfects, 40);
});
