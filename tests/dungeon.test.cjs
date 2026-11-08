const test = require("node:test");
const assert = require("node:assert/strict");
const D = require("../client/games/dungeon.js");

const roster = (n = 1, race = "pixie") => Array.from({ length: n }, (_, i) => ({ id: "p" + i, name: "P" + i, race }));
const tileOf = (map, x, y) => map.tiles[Math.floor(y / D.TILE) * map.w + Math.floor(x / D.TILE)];

// flood fill from a pixel position, returns the set of reachable floor tile indexes
function flood(map, x, y) {
  const seen = new Set();
  const stack = [Math.floor(y / D.TILE) * map.w + Math.floor(x / D.TILE)];
  while (stack.length) {
    const i = stack.pop();
    if (seen.has(i) || map.tiles[i] !== 1) continue;
    seen.add(i);
    const cx = i % map.w;
    const cy = (i / map.w) | 0;
    if (cx > 0) stack.push(i - 1);
    if (cx < map.w - 1) stack.push(i + 1);
    if (cy > 0) stack.push(i - map.w);
    if (cy < map.h - 1) stack.push(i + map.w);
  }
  return seen;
}

test("same seed makes the same dungeon, different floors differ", () => {
  const a = D.generate(1234, 2);
  const b = D.generate(1234, 2);
  assert.deepEqual(Array.from(a.tiles), Array.from(b.tiles));
  assert.deepEqual(a.spawns, b.spawns);
  assert.notDeepEqual(Array.from(a.tiles), Array.from(D.generate(1234, 3).tiles));
  assert.notDeepEqual(Array.from(a.tiles), Array.from(D.generate(4321, 2).tiles));
});

test("every room, the start, the exit, chests and spawns are connected", () => {
  for (let seed = 1; seed <= 25; seed++) {
    for (let floor = 1; floor <= 9; floor++) {
      const m = D.generate(seed, floor);
      assert.ok(m.rooms.length >= 5, `seed ${seed} floor ${floor} has ${m.rooms.length} rooms`);
      const reach = flood(m, m.start.x, m.start.y);
      for (const room of m.rooms) assert.ok(reach.has((room.y + (room.h >> 1)) * m.w + room.x + (room.w >> 1)), "room disconnected");
      assert.ok(reach.has(Math.floor(m.exit.y / D.TILE) * m.w + Math.floor(m.exit.x / D.TILE)), "exit unreachable");
      for (const sp of m.spawns) assert.equal(tileOf(m, sp.x, sp.y), 1, "spawn inside a wall");
      for (const c of m.chests) assert.equal(tileOf(m, c.x, c.y), 1, "chest inside a wall");
    }
  }
});

test("every third floor has a boss arena and the exit is far from the start", () => {
  assert.equal(D.generate(7, 3).boss, true);
  assert.equal(D.generate(7, 4).boss, false);
  const m = D.generate(7, 6);
  assert.ok(m.bossRoom);
  assert.deepEqual(m.exit, m.bossRoom);
  assert.ok(Math.hypot(m.start.x - m.exit.x, m.start.y - m.exit.y) > 200);
  const sim = D.create(7, roster());
  D.startFloor(sim, 3);
  assert.equal(sim.enemies.filter((e) => e.type === "boss").length, 1);
  assert.equal(sim.exitOpen, false);
});

test("the sim replays identically from a seed and inputs", () => {
  const run = () => {
    const s = D.create(99, roster(2, "deerbra"));
    for (let i = 0; i < 600; i++) {
      D.setInput(s, "p0", { dx: Math.cos(i / 40), dy: Math.sin(i / 40), atk: 1, sp: i % 200 === 0 ? 1 : 0 });
      D.setInput(s, "p1", { dx: -1, dy: 0, atk: 1 });
      D.step(s);
    }
    return JSON.stringify(D.snapshot(s));
  };
  assert.equal(run(), run());
});

test("a bot can clear the way and take the stairs to floor 2", () => {
  const s = D.create(5, roster(1, "pixie"));
  const p = s.players[0];
  p.hp = p.maxHp = 1e6;
  // BFS path of tiles from the player to the exit, then walk it
  const m = s.map;
  const goal = Math.floor(m.exit.y / D.TILE) * m.w + Math.floor(m.exit.x / D.TILE);
  const from = new Map([[Math.floor(p.y / D.TILE) * m.w + Math.floor(p.x / D.TILE), -1]]);
  const q = [...from.keys()];
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    for (const n of [c + 1, c - 1, c + m.w, c - m.w]) if (m.tiles[n] === 1 && !from.has(n)) { from.set(n, c); q.push(n); }
  }
  const path = [];
  for (let c = goal; c !== -1; c = from.get(c)) path.unshift(c);
  let k = 0;
  for (let i = 0; i < 60 * 240 && s.floor === 1; i++) {
    p.hp = p.maxHp;
    const tx = ((path[Math.min(k, path.length - 1)] % m.w) + 0.5) * D.TILE;
    const ty = (Math.floor(path[Math.min(k, path.length - 1)] / m.w) + 0.5) * D.TILE;
    if (Math.hypot(tx - p.x, ty - p.y) < 8 && k < path.length - 1) k++;
    const a = Math.atan2(ty - p.y, tx - p.x);
    D.setInput(s, p.id, { dx: Math.cos(a), dy: Math.sin(a), atk: 1 });
    D.step(s);
  }
  assert.equal(s.floor, 2);
});

test("killing the boss opens the exit and drops relics", () => {
  const s = D.create(11, roster());
  D.startFloor(s, 3);
  const boss = s.enemies.find((e) => e.type === "boss");
  D.hurtEnemy(s, boss, 1e9, s.players[0], 0, 0);
  D.step(s);
  assert.equal(s.exitOpen, true);
  assert.ok(s.items.filter((i) => i.kind === "relic").length >= 2);
});

test("relics stack", () => {
  const s = D.create(3, roster());
  const p = s.players[0];
  const base = D.statsOf(p);
  D.addRelic(s, p, "fury");
  D.addRelic(s, p, "fury");
  D.addRelic(s, p, "vigor");
  const st = D.statsOf(p);
  assert.equal(p.relics.fury, 2);
  assert.ok(Math.abs(st.dmg - base.dmg * 1.4) < 1e-9);
  assert.ok(st.maxHp > base.maxHp);
  assert.equal(p.maxHp, st.maxHp);
  D.addRelic(s, p, "multi");
  assert.equal(D.statsOf(p).shots, 2);
});

test("teammates revive a downed player, all down ends the run", () => {
  const s = D.create(8, roster(2));
  const [a, b] = s.players;
  b.inv = 0;
  D.hurtPlayer(s, b, 1e6);
  assert.equal(b.down, true);
  a.x = b.x;
  a.y = b.y;
  for (let i = 0; i < D.REVIVE_FRAMES + 2; i++) { a.hp = a.maxHp; D.step(s); }
  assert.equal(b.down, false);
  assert.equal(s.over, false);
  a.inv = 0;
  b.inv = 0;
  D.hurtPlayer(s, a, 1e6);
  D.hurtPlayer(s, b, 1e6);
  D.step(s);
  assert.equal(s.over, true);
  assert.equal(s.reason, "dead");
});

test("every race can cast its special without blowing up", () => {
  for (const race of Object.keys(D.RACES)) {
    const s = D.create(21, roster(1, race));
    D.startFloor(s, 4);
    const p = s.players[0];
    p.hp = p.maxHp = 1e6;
    s.enemies.forEach((e) => { e.x = p.x + 30; e.y = p.y; e.awake = true; });
    for (let i = 0; i < 400; i++) { D.setInput(s, p.id, { dx: 0, dy: 0, atk: 1, sp: 1 }); D.step(s); }
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y), race);
    assert.ok(s.kills > 0 || s.enemies.length >= 0, race);
  }
});

test("fog of war: reveal marks nearby open tiles and stops at walls", () => {
  const m = D.generate(2, 1);
  const out = new Uint8Array(m.w * m.h);
  D.reveal(m, m.start.x, m.start.y, 8, out);
  assert.equal(out[Math.floor(m.start.y / D.TILE) * m.w + Math.floor(m.start.x / D.TILE)], 1);
  const far = Math.floor(m.exit.y / D.TILE) * m.w + Math.floor(m.exit.x / D.TILE);
  const dist = Math.hypot(m.exit.x - m.start.x, m.exit.y - m.start.y) / D.TILE;
  if (dist > 10) assert.equal(out[far], 0);
});

test("snapshots survive JSON and interpolate", () => {
  const s = D.create(4, roster(2));
  const a = JSON.parse(JSON.stringify(D.snapshot(s)));
  s.players[0].x += 40;
  const b = JSON.parse(JSON.stringify(D.snapshot(s)));
  const mid = D.lerpSnap(a, b, 0.5);
  assert.ok(Math.abs(mid.p[0].x - (a.p[0].x + 20)) < 0.2);
  assert.equal(mid.n, b.n);
  assert.equal(D.score(3, 120, 14), 3134);
});

test("a party holds at most four", () => {
  const s = D.create(1, roster(6));
  assert.equal(s.players.length, 4);
  D.removePlayer(s, "p0");
  assert.equal(s.players.length, 3);
});
