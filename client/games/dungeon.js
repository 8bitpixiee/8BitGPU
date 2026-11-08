// Dungeon Crawl: co-op roguelite. Two parts in this file:
//  1. DungeonSim (UMD, pure): floor generation + the whole simulation. No Math.random, no clock, so the
//     host can run it authoritatively and tests can replay it from a seed (node:test, tests/dungeon.test.cjs).
//  2. the arcade cabinet (browser only): rendering, controls, audio, lobby, networking.
(function (root, factory) {
  const api = factory(root.BrawlRaces || (typeof require === "function" ? require("../shared/brawl-races.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DungeonSim = api;
})(typeof self !== "undefined" ? self : this, function (Races) {
  const { RACES } = Races;
  const TILE = 32;
  const MW = 56;
  const MH = 40;
  const PLAYER_R = 10;
  const MAX_PLAYERS = 4;
  const REVIVE_FRAMES = 120;
  const STAIR_FRAMES = 90;

  // ---------------------------------------------------------------- seeded random
  function hash(...nums) {
    let h = 2166136261 >>> 0;
    for (const n of nums) {
      h ^= n | 0;
      h = Math.imul(h, 16777619) >>> 0;
      h ^= h >>> 13;
    }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    const next = () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      next,
      int: (lo, hi) => lo + Math.floor(next() * (hi - lo + 1)),
      pick: (list) => list[Math.floor(next() * list.length)],
      chance: (p) => next() < p,
    };
  }

  // ---------------------------------------------------------------- content tables
  const ENEMIES = {
    slime: { hp: 22, r: 11, dmg: 8, sd: 0, gold: 3 },
    bat: { hp: 10, r: 8, dmg: 5, sd: 0, gold: 2 },
    archer: { hp: 16, r: 10, dmg: 4, sd: 7, gold: 4 },
    brute: { hp: 64, r: 15, dmg: 15, sd: 0, gold: 8 },
    mage: { hp: 18, r: 10, dmg: 4, sd: 8, gold: 6 },
    boss: { hp: 320, r: 26, dmg: 16, sd: 9, gold: 60 },
  };
  // type, first floor it can appear on, weight
  const SPAWN_TABLE = [["slime", 1, 5], ["bat", 1, 3], ["archer", 2, 3], ["brute", 3, 2], ["mage", 4, 2]];
  const BOSS_NAMES = ["Slime King", "Bone Warden", "Void Weaver"];

  // relics stack: owning two of one doubles the effect. letter/color are for the HUD
  const RELICS = {
    vigor: { name: "Heart Jar", desc: "+15% max HP", letter: "H", color: "#e0455a" },
    fury: { name: "Ember Fang", desc: "+20% damage", letter: "F", color: "#ff9a3c" },
    swift: { name: "Winged Boots", desc: "+8% speed", letter: "S", color: "#7fe0ff" },
    lucky: { name: "Clover Coin", desc: "+25% gold", letter: "L", color: "#ffd54a" },
    vamp: { name: "Leech Fang", desc: "heal 4% of damage dealt", letter: "V", color: "#b0306a" },
    multi: { name: "Twin Charm", desc: "+1 bolt per attack", letter: "T", color: "#9be86b" },
    pierce: { name: "Needle Tip", desc: "shots pierce +1", letter: "P", color: "#cfc6e8" },
    magnet: { name: "Magnet Stone", desc: "wider loot pickup", letter: "M", color: "#6b8cff" },
    haste: { name: "Hourglass", desc: "special recharges 15% faster", letter: "R", color: "#d56bff" },
    guard: { name: "Iron Pin", desc: "take 8% less damage", letter: "G", color: "#b3ab94" },
  };
  const RELIC_IDS = Object.keys(RELICS);

  // these races swing short wide slashes, the rest fire bolts
  const MELEE = new Set(["deerbra", "bovadill", "macho", "anthro", "femme", "pickle"]);
  const KIND_CD = { proj: 300, buff: 600 };

  // ---------------------------------------------------------------- geometry helpers
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const dist = (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by);

  function floorAt(map, tx, ty) {
    return tx >= 0 && ty >= 0 && tx < map.w && ty < map.h && map.tiles[ty * map.w + tx] === 1;
  }
  const solidPx = (map, x, y) => !floorAt(map, Math.floor(x / TILE), Math.floor(y / TILE));
  function boxHits(map, x, y, r) {
    return solidPx(map, x - r, y - r) || solidPx(map, x + r, y - r) || solidPx(map, x - r, y + r) || solidPx(map, x + r, y + r);
  }
  // axis-separated so things slide along walls. returns true when it ran into something
  function slide(map, e, dx, dy) {
    let hit = false;
    if (dx) {
      if (boxHits(map, e.x + dx, e.y, e.r)) hit = true;
      else e.x += dx;
    }
    if (dy) {
      if (boxHits(map, e.x, e.y + dy, e.r)) hit = true;
      else e.y += dy;
    }
    return hit;
  }
  function los(map, x1, y1, x2, y2) {
    const d = dist(x1, y1, x2, y2);
    const steps = Math.ceil(d / 8);
    for (let i = 1; i < steps; i++) {
      const k = i / steps;
      if (solidPx(map, x1 + (x2 - x1) * k, y1 + (y2 - y1) * k)) return false;
    }
    return true;
  }

  // ---------------------------------------------------------------- floor generation
  function generate(seed, floor) {
    const r = rng(hash(seed, floor, 1));
    const boss = floor % 3 === 0;
    const tiles = new Uint8Array(MW * MH);
    const rooms = [];
    const overlaps = (a, b) => a.x - 2 < b.x + b.w && a.x + a.w + 2 > b.x && a.y - 2 < b.y + b.h && a.y + a.h + 2 > b.y;
    const tryAdd = (w, h) => {
      for (let i = 0; i < 60; i++) {
        const room = { x: r.int(1, MW - w - 2), y: r.int(1, MH - h - 2), w, h };
        if (!rooms.some((o) => overlaps(room, o))) {
          rooms.push(room);
          return true;
        }
      }
      return false;
    };
    // the first room is the anchor: the boss arena on boss floors
    if (boss) tryAdd(13, 11);
    const want = Math.min(12, 7 + Math.floor(floor / 2));
    for (let i = 0; i < 500 && rooms.length < want; i++) tryAdd(r.int(5, 10), r.int(5, 8));
    for (const m of rooms) for (let y = m.y; y < m.y + m.h; y++) for (let x = m.x; x < m.x + m.w; x++) tiles[y * MW + x] = 1;
    const mid = (m) => ({ x: m.x + (m.w >> 1), y: m.y + (m.h >> 1) });

    // corridors: connect each new room to its nearest already connected one, then add a couple of loops
    const carve = (x, y) => {
      for (const [ox, oy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const tx = clamp(x + ox, 1, MW - 2);
        const ty = clamp(y + oy, 1, MH - 2);
        tiles[ty * MW + tx] = 1;
      }
    };
    const corridor = (a, b) => {
      const p = mid(a);
      const q = mid(b);
      const horizFirst = r.chance(0.5);
      const hline = (y, x1, x2) => { for (let x = Math.min(x1, x2); x <= Math.max(x1, x2); x++) carve(x, y); };
      const vline = (x, y1, y2) => { for (let y = Math.min(y1, y2); y <= Math.max(y1, y2); y++) carve(x, y); };
      if (horizFirst) { hline(p.y, p.x, q.x); vline(q.x, p.y, q.y); } else { vline(p.x, p.y, q.y); hline(q.y, p.x, q.x); }
    };
    const linked = [0];
    const rest = new Set(rooms.map((_, i) => i).slice(1));
    while (rest.size) {
      let best = null;
      for (const a of linked) {
        for (const b of rest) {
          const pa = mid(rooms[a]);
          const pb = mid(rooms[b]);
          const d = Math.abs(pa.x - pb.x) + Math.abs(pa.y - pb.y);
          if (!best || d < best.d) best = { a, b, d };
        }
      }
      corridor(rooms[best.a], rooms[best.b]);
      linked.push(best.b);
      rest.delete(best.b);
    }
    for (let i = 0; i < 2 && rooms.length > 3; i++) corridor(rooms[r.int(0, rooms.length - 1)], rooms[r.int(0, rooms.length - 1)]);

    // BFS over tiles from the anchor so start/exit are far apart
    const distMap = new Int32Array(MW * MH).fill(-1);
    const a0 = mid(rooms[0]);
    const queue = [a0.y * MW + a0.x];
    distMap[queue[0]] = 0;
    for (let qi = 0; qi < queue.length; qi++) {
      const cur = queue[qi];
      const cx = cur % MW;
      const cy = (cur / MW) | 0;
      for (const [ox, oy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = cx + ox;
        const ny = cy + oy;
        const ni = ny * MW + nx;
        if (nx >= 0 && ny >= 0 && nx < MW && ny < MH && tiles[ni] === 1 && distMap[ni] < 0) {
          distMap[ni] = distMap[cur] + 1;
          queue.push(ni);
        }
      }
    }
    let far = 0;
    rooms.forEach((m, i) => {
      const c = mid(m);
      if (distMap[c.y * MW + c.x] > distMap[mid(rooms[far]).y * MW + mid(rooms[far]).x]) far = i;
    });
    const startIdx = boss ? far : 0;
    const exitIdx = boss ? 0 : far;
    const px = (m) => ({ x: (mid(m).x + 0.5) * TILE, y: (mid(m).y + 0.5) * TILE });

    // enemies per room, chests, wall torches
    const spawns = [];
    const pool = SPAWN_TABLE.filter((t) => t[1] <= floor);
    const total = pool.reduce((n, t) => n + t[2] + (t[0] === "brute" && floor >= 6 ? 1 : 0), 0);
    const pickType = () => {
      let roll = r.next() * total;
      for (const t of pool) {
        roll -= t[2] + (t[0] === "brute" && floor >= 6 ? 1 : 0);
        if (roll < 0) return t[0];
      }
      return "slime";
    };
    rooms.forEach((m, i) => {
      if (i === startIdx || (boss && i === 0)) return;
      const n = clamp(Math.round((m.w * m.h) / 18) + Math.floor(floor / 3), 2, 9);
      for (let k = 0; k < n; k++) {
        spawns.push({ type: pickType(), x: (r.int(m.x + 1, m.x + m.w - 2) + 0.5) * TILE, y: (r.int(m.y + 1, m.y + m.h - 2) + 0.5) * TILE });
      }
    });
    const chests = [];
    const chestRooms = rooms.map((_, i) => i).filter((i) => i !== startIdx && i !== (boss ? 0 : -1));
    for (let k = 0; k < (floor > 3 ? 2 : 1) && chestRooms.length; k++) {
      const i = chestRooms.splice(r.int(0, chestRooms.length - 1), 1)[0];
      const m = rooms[i];
      chests.push({ x: (m.x + m.w - 1.5) * TILE, y: (m.y + 1.5) * TILE });
    }
    const torches = [];
    for (const m of rooms) torches.push({ x: m.x + 1, y: m.y - 1 }, { x: m.x + m.w - 2, y: m.y - 1 });

    return {
      seed, floor, boss, w: MW, h: MH, tiles, rooms, spawns, chests, torches,
      start: px(rooms[startIdx]), exit: px(rooms[exitIdx]), bossRoom: boss ? px(rooms[0]) : null,
    };
  }

  // marks tiles a viewer at (x, y) can see within radius (in tiles) into out[]. cheap ray fan, walls get marked too
  function reveal(map, x, y, radius, out) {
    const rays = 96;
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2;
      const cx = Math.cos(a) * 0.5;
      const cy = Math.sin(a) * 0.5;
      for (let d = 0; d <= radius * 2; d++) {
        const tx = Math.floor(x / TILE + cx * d);
        const ty = Math.floor(y / TILE + cy * d);
        if (tx < 0 || ty < 0 || tx >= map.w || ty >= map.h) break;
        out[ty * map.w + tx] = 1;
        if (map.tiles[ty * map.w + tx] !== 1) break;
      }
    }
  }

  // ---------------------------------------------------------------- state
  const NONE = { dx: 0, dy: 0, atk: 0, sp: 0, ax: 0, ay: 0, manual: 0 };

  function makePlayer(s, info) {
    const R = RACES[info.race] ? info.race : "pixie";
    const p = {
      id: info.id, name: info.name || "player", race: R, x: 0, y: 0, r: PLAYER_R, hp: RACES[R].hp, maxHp: RACES[R].hp,
      face: 0, aim: 0, atkCd: 0, spCd: 0, buffT: 0, inv: 60, down: false, rev: 0, relics: {}, pend: [], dash: null,
    };
    if (s.map) { p.x = s.map.start.x; p.y = s.map.start.y; }
    return p;
  }
  function addPlayer(s, info) {
    if (s.players.length >= MAX_PLAYERS || s.players.some((p) => p.id === info.id)) return null;
    const p = makePlayer(s, info);
    s.players.push(p);
    return p;
  }
  function removePlayer(s, id) {
    s.players = s.players.filter((p) => p.id !== id);
    delete s.inputs[id];
    if (!s.players.length) { s.over = true; s.reason = "empty"; }
  }

  function create(seed, roster) {
    const s = {
      seed: seed >>> 0, floor: 0, t: 0, gold: 0, kills: 0, over: false, reason: "", players: [], enemies: [], shots: [],
      items: [], ev: [], inputs: {}, nextId: 1, stairs: 0, exitOpen: true, bossDead: false, map: null, rng: rng(hash(seed, 99)),
    };
    startFloor(s, 1);
    for (const info of roster) addPlayer(s, info);
    startFloor(s, 1);
    return s;
  }

  const uid = (s) => s.nextId++;
  const emit = (s, k, x, y, v) => s.ev.push([k, Math.round(x), Math.round(y), v === undefined ? 0 : v]);

  function mkEnemy(s, type, x, y, scale) {
    const d = ENEMIES[type];
    const hp = Math.round(d.hp * scale.hp);
    return {
      id: uid(s), type, x, y, r: d.r, hp, maxHp: hp, dmg: Math.round(d.dmg * scale.dmg), sd: Math.round(d.sd * scale.dmg),
      awake: false, cd: 30 + (uid(s) % 40), st: 0, stT: 0, kx: 0, ky: 0, flash: 0, ang: 0, pat: 0, dead: false, blink: 0,
    };
  }
  const scaleFor = (s, n) => {
    const np = Math.max(1, s.players.length);
    return { hp: (1 + 0.22 * (n - 1)) * (1 + 0.5 * (np - 1)), dmg: 1 + 0.07 * (n - 1) };
  };

  function startFloor(s, n) {
    s.floor = n;
    s.map = generate(s.seed, n);
    s.rng = rng(hash(s.seed, n, 7));
    s.enemies = [];
    s.shots = [];
    s.items = [];
    s.stairs = 0;
    s.bossDead = false;
    s.exitOpen = !s.map.boss;
    s.players.forEach((p, i) => {
      p.x = s.map.start.x + (i % 2) * 22 - 11;
      p.y = s.map.start.y + (i >> 1) * 22 - 11;
      p.pend = [];
      p.dash = null;
      p.inv = 90;
      if (p.down) { p.down = false; p.hp = Math.ceil(p.maxHp * 0.4); } else p.hp = Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp * 0.25));
    });
    const sc = scaleFor(s, n);
    for (const sp of s.map.spawns) s.enemies.push(mkEnemy(s, sp.type, sp.x, sp.y, sc));
    if (s.map.boss) {
      const b = mkEnemy(s, "boss", s.map.bossRoom.x, s.map.bossRoom.y, sc);
      b.tier = Math.floor(n / 3);
      b.name = BOSS_NAMES[(b.tier - 1) % BOSS_NAMES.length];
      b.hp = b.maxHp = Math.round(b.maxHp * (1 + 0.5 * (b.tier - 1)));
      s.enemies.push(b);
    }
    for (const c of s.map.chests) s.items.push({ id: uid(s), kind: "chest", x: c.x, y: c.y, v: 0 });
    emit(s, "floor", s.map.start.x, s.map.start.y, n);
  }

  // ---------------------------------------------------------------- stats
  function statsOf(p) {
    const R = RACES[p.race];
    const sp = Races.specialOf(p.race);
    const rl = p.relics;
    const buffed = p.buffT > 0;
    return {
      maxHp: Math.round(R.hp * (1 + 0.15 * (rl.vigor || 0))),
      speed: 2.3 * R.speed * (1 + 0.08 * (rl.swift || 0)) * (buffed ? sp.speedMul || 1 : 1),
      dmg: (1 + 0.2 * (rl.fury || 0)) * (buffed ? sp.dmgMul || 1 : 1),
      shots: 1 + (rl.multi || 0),
      pierce: rl.pierce || 0,
      lifesteal: 0.04 * (rl.vamp || 0),
      magnet: 60 + 45 * (rl.magnet || 0),
      cd: Math.pow(0.85, rl.haste || 0),
      lucky: 1 + 0.25 * (rl.lucky || 0),
      guard: Math.pow(0.92, rl.guard || 0),
    };
  }
  function addRelic(s, p, id) {
    const before = statsOf(p).maxHp;
    p.relics[id] = (p.relics[id] || 0) + 1;
    p.maxHp = statsOf(p).maxHp;
    p.hp += p.maxHp - before;
    emit(s, "relic", p.x, p.y, RELIC_IDS.indexOf(id));
  }

  // ---------------------------------------------------------------- damage
  const alive = (s) => s.players.filter((p) => !p.down);
  function nearestAlive(s, x, y) {
    let best = null;
    let bd = Infinity;
    for (const p of s.players) {
      if (p.down) continue;
      const d = dist(p.x, p.y, x, y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  function dropGold(s, x, y, base, lucky) {
    const v = Math.max(1, Math.round(base * (1 + 0.1 * (s.floor - 1)) * lucky));
    s.items.push({ id: uid(s), kind: "gold", x: x + (s.rng.next() - 0.5) * 12, y: y + (s.rng.next() - 0.5) * 12, v });
  }

  function hurtEnemy(s, e, dmg, from, kbx, kby) {
    if (e.dead) return;
    dmg = Math.max(1, Math.round(dmg));
    e.hp -= dmg;
    e.flash = 6;
    e.awake = true;
    const kbMul = e.type === "boss" ? 0.15 : e.type === "brute" ? 0.5 : 1;
    e.kx += (kbx || 0) * kbMul;
    e.ky += (kby || 0) * kbMul;
    emit(s, "hit", e.x, e.y - e.r, dmg);
    if (from) {
      const st = statsOf(from);
      if (st.lifesteal && !from.down) from.hp = Math.min(from.maxHp, from.hp + dmg * st.lifesteal);
    }
    if (e.hp > 0) return;
    e.dead = true;
    s.kills++;
    emit(s, "kill", e.x, e.y, e.type === "boss" ? 1 : 0);
    const lucky = from ? statsOf(from).lucky : 1;
    dropGold(s, e.x, e.y, ENEMIES[e.type].gold, lucky);
    if (e.type !== "boss" && s.rng.chance(0.12)) s.items.push({ id: uid(s), kind: "potion", x: e.x, y: e.y, v: 0 });
    if (e.type !== "boss" && (e.type === "brute" || e.type === "mage") && s.rng.chance(0.2)) {
      s.items.push({ id: uid(s), kind: "relic", x: e.x, y: e.y, v: s.rng.int(0, RELIC_IDS.length - 1) });
    }
    if (e.type === "boss") {
      s.bossDead = true;
      s.exitOpen = true;
      for (let i = 0; i < 2; i++) s.items.push({ id: uid(s), kind: "relic", x: e.x + (i ? 24 : -24), y: e.y, v: s.rng.int(0, RELIC_IDS.length - 1) });
      s.items.push({ id: uid(s), kind: "potion", x: e.x, y: e.y + 24, v: 0 });
      for (let i = 0; i < 6; i++) dropGold(s, e.x, e.y, 20, lucky);
      s.shots = s.shots.filter((sh) => sh.team === 0);
    }
  }

  function hurtPlayer(s, p, dmg) {
    if (p.down || p.inv > 0) return;
    dmg = Math.max(1, Math.round(dmg * statsOf(p).guard));
    p.hp -= dmg;
    p.inv = 40;
    emit(s, "hurt", p.x, p.y - 12, dmg);
    if (p.hp <= 0) {
      p.hp = 0;
      p.down = true;
      p.rev = 0;
      p.pend = [];
      p.dash = null;
      emit(s, "down", p.x, p.y, 0);
    }
  }

  function spawnShot(s, o) {
    s.shots.push({
      id: uid(s), x: o.x, y: o.y, vx: Math.cos(o.a) * o.speed, vy: Math.sin(o.a) * o.speed, r: o.r, dmg: o.dmg, life: o.life,
      team: o.team, pierce: o.pierce || 0, kind: o.kind, owner: o.owner || 0, hit: [],
    });
  }

  // ---------------------------------------------------------------- player specials
  function burst(s, p, x, y, radius, dmg, kb, heal) {
    emit(s, "ring", x, y, radius);
    for (const e of s.enemies) {
      if (e.dead) continue;
      const d = dist(x, y, e.x, e.y);
      if (d <= radius + e.r) {
        const a = Math.atan2(e.y - y, e.x - x);
        hurtEnemy(s, e, dmg, p, Math.cos(a) * kb, Math.sin(a) * kb);
      }
    }
    // a burst also wipes enemy bullets caught inside it
    s.shots = s.shots.filter((sh) => sh.team === 0 || dist(x, y, sh.x, sh.y) > radius);
    if (heal) {
      for (const q of s.players) {
        if (!q.down && dist(x, y, q.x, q.y) <= radius) q.hp = Math.min(q.maxHp, q.hp + heal);
      }
    }
  }

  function castSpecial(s, p, st) {
    const sp = Races.specialOf(p.race);
    const a = p.aim;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    p.spCd = Math.round((KIND_CD[sp.kind] || 360) * st.cd);
    emit(s, "special", p.x, p.y, 0);
    switch (sp.kind) {
      case "proj":
        for (const sh of sp.shots) p.pend.push({ at: s.t + Math.round(sh.at * 0.6), k: "shot", a, sh });
        break;
      case "dash":
        p.dash = { t: sp.dur, vx: dx * sp.vx * 0.45, vy: dy * sp.vx * 0.45, dmg: sp.dmg * 1.6 * st.dmg, reach: sp.reach * 0.35 + 12, hit: [], kb: sp.kb };
        p.inv = Math.max(p.inv, sp.dur);
        break;
      case "area":
        p.pend.push({ at: s.t, k: "burst", ox: 0, oy: 0, rad: sp.reach * 0.9, dmg: sp.dmg * 2.2 * st.dmg, kb: sp.kb, heal: (sp.heal || 0) * 2 });
        break;
      case "teleport": {
        let moved = 0;
        for (let d = 8; d <= 130; d += 8) {
          if (boxHits(s.map, p.x + dx * d, p.y + dy * d, p.r)) break;
          moved = d;
        }
        p.x += dx * moved;
        p.y += dy * moved;
        p.inv = Math.max(p.inv, 30);
        p.pend.push({ at: s.t + 3, k: "burst", ox: 0, oy: 0, rad: sp.reach * 0.9, dmg: sp.dmg * 2 * st.dmg, kb: sp.kb, heal: 0 });
        break;
      }
      case "buff":
        p.buffT = sp.dur;
        emit(s, "ring", p.x, p.y, 40);
        break;
      case "flurry":
        for (let i = 0; i < sp.hits; i++) p.pend.push({ at: s.t + i * sp.gap * 2, k: "burst", ox: dx * 24, oy: dy * 24, rad: sp.reach * 0.8, dmg: sp.dmg * 2 * st.dmg, kb: sp.kb, heal: 0 });
        break;
      case "melee":
        p.pend.push({ at: s.t + 4, k: "burst", ox: dx * 40, oy: dy * 40, rad: sp.reach * 0.7, dmg: sp.dmg * 3 * st.dmg, kb: sp.kb * 1.2, heal: 0 });
        break;
      default:
        break;
    }
  }

  function runPending(s, p, st) {
    const left = [];
    for (const q of p.pend) {
      if (s.t < q.at) { left.push(q); continue; }
      if (q.k === "shot") {
        const sh = q.sh;
        spawnShot(s, {
          x: p.x, y: p.y, a: q.a, speed: Math.max(3, sh.vx * 0.6), dmg: sh.dmg * 1.7 * st.dmg, r: Math.max(5, sh.r * 0.5),
          life: Math.round(sh.life * 0.9), pierce: (sh.r >= 20 ? 4 : 1) + st.pierce, kind: "spec", team: 0, owner: p.id,
        });
      } else if (q.k === "burst") burst(s, p, p.x + q.ox, p.y + q.oy, q.rad, q.dmg, q.kb, q.heal);
    }
    p.pend = left;
  }

  function autoAim(s, p) {
    let best = null;
    let bd = 300;
    for (const e of s.enemies) {
      if (e.dead) continue;
      const d = dist(p.x, p.y, e.x, e.y);
      if (d < bd && los(s.map, p.x, p.y, e.x, e.y)) { bd = d; best = e; }
    }
    return best ? Math.atan2(best.y - p.y, best.x - p.x) : p.face;
  }

  function updatePlayer(s, p) {
    const st = statsOf(p);
    const inp = s.inputs[p.id] || NONE;
    p.maxHp = st.maxHp;
    if (p.hp > p.maxHp) p.hp = p.maxHp;
    if (p.inv > 0) p.inv--;
    if (p.atkCd > 0) p.atkCd--;
    if (p.spCd > 0) p.spCd--;
    if (p.buffT > 0) p.buffT--;
    if (p.down) {
      const helper = s.players.some((q) => q !== p && !q.down && dist(q.x, q.y, p.x, p.y) < 40);
      p.rev = helper ? p.rev + 1 : Math.max(0, p.rev - 2);
      if (p.rev >= REVIVE_FRAMES) {
        p.down = false;
        p.hp = Math.ceil(p.maxHp * 0.5);
        p.inv = 90;
        p.rev = 0;
        emit(s, "revive", p.x, p.y, 0);
      }
      return;
    }
    runPending(s, p, st);
    let dx = clamp(+inp.dx || 0, -1, 1);
    let dy = clamp(+inp.dy || 0, -1, 1);
    const len = Math.hypot(dx, dy);
    if (len > 1) { dx /= len; dy /= len; }
    if (p.dash) {
      slide(s.map, p, p.dash.vx, p.dash.vy);
      for (const e of s.enemies) {
        if (e.dead || p.dash.hit.includes(e.id) || dist(p.x, p.y, e.x, e.y) > p.dash.reach + e.r) continue;
        p.dash.hit.push(e.id);
        hurtEnemy(s, e, p.dash.dmg, p, Math.sign(p.dash.vx) * p.dash.kb, Math.sign(p.dash.vy) * p.dash.kb);
      }
      if (--p.dash.t <= 0) p.dash = null;
    } else {
      slide(s.map, p, dx * st.speed, dy * st.speed);
      if (dx || dy) p.face = Math.atan2(dy, dx);
    }
    p.aim = inp.manual ? Math.atan2(inp.ay, inp.ax) : autoAim(s, p);
    if (inp.atk && p.atkCd <= 0 && !p.dash) {
      const melee = MELEE.has(p.race);
      for (let i = 0; i < st.shots; i++) {
        const a = p.aim + (i - (st.shots - 1) / 2) * 0.2;
        spawnShot(s, {
          x: p.x + Math.cos(a) * 10, y: p.y + Math.sin(a) * 10, a, speed: melee ? 6.5 : 7.5, dmg: (melee ? 15 : 9) * st.dmg,
          r: melee ? 14 : 5, life: melee ? 12 : 55, pierce: (melee ? 2 : 0) + st.pierce, kind: melee ? "slash" : "bolt", team: 0, owner: p.id,
        });
      }
      p.atkCd = melee ? 18 : 21;
      emit(s, "shoot", p.x, p.y, 0);
    }
    if (inp.sp && p.spCd <= 0) castSpecial(s, p, st);
  }

  // ---------------------------------------------------------------- enemies
  function enemyShot(s, e, a, speed, kind) {
    spawnShot(s, { x: e.x, y: e.y, a, speed, dmg: e.sd, r: kind === "orb" ? 6 : 4, life: 220, team: 1, kind });
  }

  function contact(s, e) {
    for (const p of s.players) {
      if (!p.down && dist(p.x, p.y, e.x, e.y) < e.r + p.r) hurtPlayer(s, p, e.dmg);
    }
  }

  function updateEnemy(s, e) {
    if (e.dead) return;
    const tgt = nearestAlive(s, e.x, e.y);
    if (e.flash > 0) e.flash--;
    // knockback decays
    if (Math.abs(e.kx) > 0.1 || Math.abs(e.ky) > 0.1) {
      slide(s.map, e, e.kx, e.ky);
      e.kx *= 0.8;
      e.ky *= 0.8;
    }
    if (!tgt) return;
    const d = dist(e.x, e.y, tgt.x, tgt.y);
    if (!e.awake) {
      const wake = e.type === "boss" ? 420 : 280;
      if (d < wake && los(s.map, e.x, e.y, tgt.x, tgt.y)) e.awake = true;
      else return;
    }
    const toward = Math.atan2(tgt.y - e.y, tgt.x - e.x);
    const move = (a, sp) => slide(s.map, e, Math.cos(a) * sp, Math.sin(a) * sp);
    if (e.cd > 0) e.cd--;
    e.ang = toward;
    switch (e.type) {
      case "slime":
        // idle, then a short hop at the target
        if (e.st === 0) { if (e.cd <= 0) { e.st = 1; e.stT = 24; } }
        else { move(toward, 2.2); if (--e.stT <= 0) { e.st = 0; e.cd = 28; } }
        break;
      case "bat": {
        const wob = toward + Math.sin(s.t * 0.12 + e.id) * 1.1;
        if (e.st === 1) { move(toward, 4.2); if (--e.stT <= 0) { e.st = 0; e.cd = 150; } }
        else { move(wob, 1.9); if (e.cd <= 0) { e.st = 1; e.stT = 20; } }
        break;
      }
      case "archer": {
        const sees = d < 360 && los(s.map, e.x, e.y, tgt.x, tgt.y);
        if (d < 130) move(toward + Math.PI, 1.2);
        else if (d > 230) move(toward, 1.1);
        else move(toward + Math.PI / 2, 0.6);
        if (sees && e.cd <= 0) { enemyShot(s, e, toward, 3.2, "arrow"); e.cd = 110; }
        break;
      }
      case "brute":
        if (e.st === 0) {
          move(toward, 0.85);
          if (d < 190 && e.cd <= 0) { e.st = 1; e.stT = 36; e.ang = toward; }
        } else if (e.st === 1) {
          if (--e.stT <= 0) { e.st = 2; e.stT = 30; }
        } else if (e.st === 2) {
          if (move(e.ang, 4.6) || --e.stT <= 0) { e.st = 3; e.stT = 50; }
        } else if (--e.stT <= 0) { e.st = 0; e.cd = 120; }
        break;
      case "mage":
        if (e.st === 0) {
          if (d < 140) move(toward + Math.PI, 1);
          if (e.cd <= 0) {
            // blink somewhere around the target, then wind up a fan of orbs
            for (let k = 0; k < 8; k++) {
              const a = s.rng.next() * Math.PI * 2;
              const nx = tgt.x + Math.cos(a) * 150;
              const ny = tgt.y + Math.sin(a) * 150;
              if (!boxHits(s.map, nx, ny, e.r)) { e.x = nx; e.y = ny; emit(s, "blink", nx, ny, 0); break; }
            }
            e.st = 1; e.stT = 20;
          }
        } else if (--e.stT <= 0) {
          const a = Math.atan2(tgt.y - e.y, tgt.x - e.x);
          for (const o of [-0.35, 0, 0.35]) enemyShot(s, e, a + o, 2.6, "orb");
          e.st = 0; e.cd = 170;
        }
        break;
      case "boss":
        updateBoss(s, e, tgt, toward, move);
        break;
      default:
        break;
    }
    contact(s, e);
  }

  function updateBoss(s, e, tgt, toward, move) {
    const phase2 = e.hp < e.maxHp / 2;
    const ringShots = 14 + 4 * e.tier;
    const ring = (off) => { for (let i = 0; i < ringShots; i++) enemyShot(s, e, off + (i / ringShots) * Math.PI * 2, 2.4, "orb"); emit(s, "boom", e.x, e.y, 0); };
    if (e.st === 0) {
      move(toward, 0.7);
      if (e.cd <= 0) {
        const patterns = phase2 ? 4 : 3;
        e.pat = (e.pat + 1) % patterns;
        e.st = e.pat + 1;
        e.stT = [30, 40, 20, 90][e.pat];
        e.ang = toward;
      }
    } else if (e.st === 1) { // ring burst
      if (--e.stT === 0) { ring(e.id); if (phase2) e.cd2 = 30; e.st = 0; e.cd = 70; }
    } else if (e.st === 2) { // telegraphed charge, then dash
      if (e.stT > 0) { if (--e.stT === 0) e.stT = -40; }
      else { move(e.ang, 5); if (++e.stT === 0) { e.st = 0; e.cd = 80; } }
    } else if (e.st === 3) { // summon helpers
      if (--e.stT === 0) {
        const kind = e.tier === 1 ? "slime" : e.tier === 2 ? "archer" : "mage";
        const sc = scaleFor(s, s.floor);
        for (let i = 0; i < 2 + e.tier && s.enemies.length < 16; i++) {
          const a = (i / (2 + e.tier)) * Math.PI * 2;
          const x = e.x + Math.cos(a) * 60;
          const y = e.y + Math.sin(a) * 60;
          if (boxHits(s.map, x, y, 12)) continue;
          const m = mkEnemy(s, kind, x, y, sc);
          m.awake = true;
          s.enemies.push(m);
        }
        e.st = 0; e.cd = 90;
      }
    } else if (e.st === 4) { // spiral, only in phase two
      if (e.stT % 4 === 0) enemyShot(s, e, e.stT * 0.5, 2.6, "orb");
      if (--e.stT <= 0) { e.st = 0; e.cd = 70; }
    }
    if (e.cd2 > 0 && --e.cd2 === 0) ring(e.id + 0.2);
  }

  // ---------------------------------------------------------------- shots, items, floor flow
  function updateShots(s) {
    const keep = [];
    for (const sh of s.shots) {
      sh.x += sh.vx;
      sh.y += sh.vy;
      if (--sh.life <= 0 || solidPx(s.map, sh.x, sh.y)) continue;
      let gone = false;
      if (sh.team === 0) {
        const owner = s.players.find((p) => p.id === sh.owner);
        for (const e of s.enemies) {
          if (e.dead || sh.hit.includes(e.id) || dist(sh.x, sh.y, e.x, e.y) > sh.r + e.r) continue;
          hurtEnemy(s, e, sh.dmg, owner, sh.vx * 0.8, sh.vy * 0.8);
          sh.hit.push(e.id);
          if (sh.pierce-- <= 0) { gone = true; break; }
        }
      } else {
        for (const p of s.players) {
          if (!p.down && dist(sh.x, sh.y, p.x, p.y) < sh.r + p.r) { hurtPlayer(s, p, sh.dmg); gone = true; break; }
        }
      }
      if (!gone) keep.push(sh);
    }
    s.shots = keep;
  }

  function updateItems(s) {
    const keep = [];
    for (const it of s.items) {
      let taken = false;
      for (const p of s.players) {
        if (p.down) continue;
        const d = dist(p.x, p.y, it.x, it.y);
        const st = statsOf(p);
        if ((it.kind === "gold" || it.kind === "potion") && d < st.magnet && d > 1) {
          const a = Math.atan2(p.y - it.y, p.x - it.x);
          it.x += Math.cos(a) * 3;
          it.y += Math.sin(a) * 3;
        }
        if (d > 18) continue;
        if (it.kind === "gold") { s.gold += it.v; emit(s, "gold", it.x, it.y, it.v); taken = true; }
        else if (it.kind === "potion") { p.hp = Math.min(p.maxHp, p.hp + Math.ceil(p.maxHp * 0.35)); emit(s, "potion", it.x, it.y, 0); taken = true; }
        else if (it.kind === "relic") { addRelic(s, p, RELIC_IDS[it.v]); taken = true; }
        else if (it.kind === "chest") {
          addRelic(s, p, RELIC_IDS[s.rng.int(0, RELIC_IDS.length - 1)]);
          for (let i = 0; i < 4; i++) dropGold(s, it.x, it.y, 8, st.lucky);
          emit(s, "chest", it.x, it.y, 0);
          taken = true;
        }
        if (taken) break;
      }
      if (!taken) keep.push(it);
    }
    s.items = keep;
  }

  function step(s) {
    if (s.over) return s;
    s.t++;
    for (const p of s.players) updatePlayer(s, p);
    for (const e of s.enemies.slice()) updateEnemy(s, e);
    updateShots(s);
    s.enemies = s.enemies.filter((e) => !e.dead);
    updateItems(s);
    // anyone alive standing on the open stairs for a moment takes the whole party down
    const onStairs = s.exitOpen && alive(s).some((p) => dist(p.x, p.y, s.map.exit.x, s.map.exit.y) < 28);
    s.stairs = onStairs ? s.stairs + 1 : Math.max(0, s.stairs - 2);
    if (s.stairs >= STAIR_FRAMES) {
      emit(s, "descend", s.map.exit.x, s.map.exit.y, s.floor + 1);
      startFloor(s, s.floor + 1);
    }
    if (s.players.length && s.players.every((p) => p.down)) { s.over = true; s.reason = "dead"; }
    return s;
  }

  function setInput(s, id, inp) { s.inputs[id] = inp; }
  const score = (floors, gold, kills) => floors * 1000 + gold + kills;

  // ---------------------------------------------------------------- snapshots (what the host broadcasts)
  const r1 = (v) => Math.round(v * 10) / 10;
  function snapshot(s) {
    const boss = s.enemies.find((e) => e.type === "boss");
    return {
      n: s.floor, seed: s.seed, t: s.t, gold: s.gold, kills: s.kills, over: s.over ? 1 : 0, reason: s.reason,
      exit: s.exitOpen ? 1 : 0, stairs: s.stairs,
      boss: boss ? { name: boss.name, hp: boss.hp, max: boss.maxHp } : null,
      p: s.players.map((p) => ({
        id: p.id, name: p.name, race: p.race, x: r1(p.x), y: r1(p.y), hp: Math.round(p.hp), max: p.maxHp, face: r1(p.face),
        down: p.down ? 1 : 0, inv: p.inv > 0 ? 1 : 0, buff: p.buffT > 0 ? 1 : 0, sp: p.spCd, rev: p.rev, relics: p.relics,
        dash: p.dash ? 1 : 0,
      })),
      // id, type, x, y, hp, max, flags (1 awake, 2 flash, 4 windup, 8 stunned), facing
      e: s.enemies.map((e) => [e.id, e.type, r1(e.x), r1(e.y), e.hp, e.maxHp,
        (e.awake ? 1 : 0) | (e.flash > 0 ? 2 : 0) | (windup(e) ? 4 : 0) | (e.type === "brute" && e.st === 3 ? 8 : 0), r1(e.ang)]),
      sh: s.shots.map((q) => [q.id, r1(q.x), r1(q.y), q.vx, q.vy, q.r, q.team, q.kind]),
      it: s.items.map((i) => [i.id, i.kind, Math.round(i.x), Math.round(i.y), i.v]),
      ev: [],
    };
  }
  const windup = (e) => (e.type === "brute" && e.st === 1) || (e.type === "boss" && e.st === 2 && e.stT > 0) || (e.type === "mage" && e.st === 1);

  // blends two snapshots for smooth clients. things missing from `a` just snap to their spot in `b`
  function lerpSnap(a, b, k) {
    const out = { ...b };
    const mix = (u, v) => (Math.abs(v - u) > 150 ? v : u + (v - u) * k);
    const pa = new Map(a.p.map((p) => [p.id, p]));
    out.p = b.p.map((p) => { const o = pa.get(p.id); return o ? { ...p, x: mix(o.x, p.x), y: mix(o.y, p.y) } : p; });
    const ea = new Map(a.e.map((e) => [e[0], e]));
    out.e = b.e.map((e) => { const o = ea.get(e[0]); return o ? [e[0], e[1], mix(o[2], e[2]), mix(o[3], e[3]), ...e.slice(4)] : e; });
    const sa = new Map(a.sh.map((q) => [q[0], q]));
    out.sh = b.sh.map((q) => { const o = sa.get(q[0]); return o ? [q[0], mix(o[1], q[1]), mix(o[2], q[2]), ...q.slice(3)] : q; });
    return out;
  }

  return {
    TILE, MW, MH, MAX_PLAYERS, REVIVE_FRAMES, STAIR_FRAMES, ENEMIES, RELICS, RELIC_IDS, BOSS_NAMES, MELEE,
    rng, hash, generate, reveal, floorAt, solidPx, los, slide, create, startFloor, addPlayer, removePlayer, setInput, step,
    statsOf, addRelic, hurtEnemy, hurtPlayer, snapshot, lerpSnap, score, raceOf: Races.raceOf, specialOf: Races.specialOf, RACES: Races.RACES,
  };
});

// ======================================================================== the cabinet (browser only)
(() => {
  if (typeof window === "undefined" || !window.ArcadeGames || !window.DungeonSim) return;
  const Sim = window.DungeonSim;
  const T = Sim.TILE;
  const VW = 640;
  const VH = 400;
  const ART = "client/games/dungeon/";
  const ICON = ART + "icon.png";

  const img = (name) => { const i = new Image(); i.src = ART + name + ".png"; return i; };
  const ready = (i) => i.complete && i.naturalWidth > 0;
  const MON = { slime: 0, bat: 1, archer: 2, brute: 3, mage: 4, boss: 5 };
  const MON_SIZE = { slime: 28, bat: 24, archer: 30, brute: 44, mage: 30, boss: 84 };

  // body color, accent style for the little procedural heroes
  const LOOK = {
    pixie: ["#ff8ad8", "wings"], deerbra: ["#b0763c", "antlers"], bovadill: ["#d8b27a", "horns"], thixie: ["#6bcf5a", "wings"],
    null: ["#3a2f55", "visor"], voidling: ["#4a2f7a", "visor"], clanker: ["#9aa3b5", "visor"], mermaid: ["#4fd0d9", "fin"],
    anthro: ["#f0953a", "ears"], macho: ["#d9453f", "none"], femme: ["#d94fb0", "ears"], maxie: ["#4f7fe0", "none"], pickle: ["#6ba84a", "none"],
  };

  // ---------------------------------------------------------------- sound (tiny synth, no files)
  function makeAudio() {
    let ac = null;
    let muted = false;
    const last = {};
    const tone = (f, d, type = "square", vol = 0.04, slide = 0, delay = 0) => {
      if (muted) return;
      try {
        ac = ac || new (window.AudioContext || window.webkitAudioContext)();
        const t = ac.currentTime + delay;
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = type;
        o.frequency.setValueAtTime(f, t);
        if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, f + slide), t + d);
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        o.connect(g).connect(ac.destination);
        o.start(t);
        o.stop(t + d + 0.02);
      } catch { /* no audio, no problem */ }
    };
    const SFX = {
      shoot: () => tone(520, 0.07, "square", 0.025, -220),
      hit: () => tone(210, 0.08, "sawtooth", 0.04, -120),
      kill: () => { tone(330, 0.14, "square", 0.045, -240); tone(110, 0.2, "sawtooth", 0.04, -60, 0.05); },
      hurt: () => tone(150, 0.22, "sawtooth", 0.07, -90),
      gold: () => { tone(880, 0.05, "square", 0.03); tone(1320, 0.08, "square", 0.03, 0, 0.05); },
      potion: () => tone(500, 0.12, "sine", 0.06, 400),
      relic: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, "triangle", 0.06, 0, i * 0.07)),
      chest: () => [392, 523, 659].forEach((f, i) => tone(f, 0.1, "square", 0.04, 0, i * 0.06)),
      special: () => tone(300, 0.25, "sawtooth", 0.05, 500),
      ring: () => tone(180, 0.2, "triangle", 0.05, 200),
      boom: () => tone(90, 0.35, "sawtooth", 0.07, -50),
      blink: () => tone(900, 0.1, "sine", 0.04, -600),
      down: () => tone(220, 0.5, "sawtooth", 0.07, -170),
      revive: () => [330, 440, 554].forEach((f, i) => tone(f, 0.12, "triangle", 0.06, 0, i * 0.08)),
      descend: () => tone(600, 0.6, "triangle", 0.06, -450),
      floor: () => { tone(196, 0.3, "square", 0.04); tone(147, 0.5, "square", 0.04, 0, 0.18); },
      bossdead: () => [262, 330, 392, 523].forEach((f, i) => tone(f, 0.25, "square", 0.05, 0, i * 0.12)),
    };
    return {
      play(name) {
        const now = performance.now();
        if (now - (last[name] || 0) < 45) return; // many hits in one frame should not stack into noise
        last[name] = now;
        SFX[name]?.();
      },
      toggle: () => (muted = !muted),
      get muted() { return muted; },
      close() { try { ac?.close(); } catch { /* ignore */ } },
    };
  }

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined) n.textContent = text;
    return n;
  };

  // ---------------------------------------------------------------- drawing helpers (no state)
  function bar(g, x, y, w, h, frac, col, back = "#1a1420") {
    g.fillStyle = "#000";
    g.fillRect(x - 1, y - 1, w + 2, h + 2);
    g.fillStyle = back;
    g.fillRect(x, y, w, h);
    g.fillStyle = col;
    g.fillRect(x, y, Math.max(0, Math.min(1, frac)) * w, h);
  }

  function drawHero(g, p, t, isMe) {
    const [col, acc] = LOOK[p.race] || LOOK.pixie;
    const bob = p.down ? 0 : Math.sin(t / 130 + p.x) * 1;
    g.fillStyle = "rgba(0,0,0,.35)";
    g.beginPath();
    g.ellipse(p.x, p.y + 10, 11, 4, 0, 0, 7);
    g.fill();
    if (p.down) {
      g.fillStyle = col;
      g.fillRect(p.x - 12, p.y + 2, 24, 8);
      g.fillStyle = "#f0d0b0";
      g.fillRect(p.x + 8, p.y, 8, 8);
      g.strokeStyle = "#8affb0";
      g.lineWidth = 3;
      g.beginPath();
      g.arc(p.x, p.y - 6, 14, -Math.PI / 2, -Math.PI / 2 + (p.rev / Sim.REVIVE_FRAMES) * Math.PI * 2);
      g.stroke();
      return;
    }
    const y = p.y + bob;
    if (p.inv && Math.floor(t / 70) % 2) g.globalAlpha = 0.45;
    if (acc === "wings") { g.fillStyle = "rgba(200,240,255,.8)"; g.fillRect(p.x - 14, y - 10, 7, 10); g.fillRect(p.x + 7, y - 10, 7, 10); }
    g.fillStyle = "#1a1420";
    g.fillRect(p.x - 8, y - 12, 16, 22);
    g.fillStyle = col;
    g.fillRect(p.x - 7, y - 3, 14, 12);
    g.fillStyle = acc === "visor" ? "#2a2438" : "#f0d0b0";
    g.fillRect(p.x - 6, y - 11, 12, 9);
    g.fillStyle = acc === "visor" ? "#7fe0ff" : "#1a1420";
    const fx = Math.cos(p.face) > 0 ? 1 : -1;
    g.fillRect(p.x - 3 + fx, y - 8, 2, 2);
    g.fillRect(p.x + 1 + fx, y - 8, 2, 2);
    g.fillStyle = col;
    if (acc === "antlers") { g.fillRect(p.x - 8, y - 17, 2, 7); g.fillRect(p.x + 6, y - 17, 2, 7); g.fillRect(p.x - 10, y - 17, 3, 2); g.fillRect(p.x + 7, y - 17, 3, 2); }
    if (acc === "horns") { g.fillRect(p.x - 7, y - 15, 3, 5); g.fillRect(p.x + 4, y - 15, 3, 5); }
    if (acc === "ears") { g.fillRect(p.x - 7, y - 16, 4, 6); g.fillRect(p.x + 3, y - 16, 4, 6); }
    if (acc === "fin") g.fillRect(p.x - 3, y - 16, 6, 6);
    g.globalAlpha = 1;
    if (p.buff) { g.strokeStyle = "#ffd54a"; g.lineWidth = 2; g.strokeRect(p.x - 10, y - 14, 20, 26); }
    if (isMe) {
      g.fillStyle = "#fff";
      g.fillRect(p.x - 3, y - 24, 6, 3);
    } else {
      g.font = "9px monospace";
      g.textAlign = "center";
      g.fillStyle = "#fff";
      g.fillText(String(p.name).slice(0, 10), p.x, y - 20);
    }
  }

  function drawTouch(g, pointers, stick, touchBtn) {
    g.globalAlpha = 0.45;
    const st = [...pointers.values()].find((p) => p.kind === "stick");
    const bx = st ? st.ox : 90;
    const by = st ? st.oy : VH - 90;
    g.strokeStyle = "#fff";
    g.lineWidth = 2;
    g.beginPath();
    g.arc(bx, by, 40, 0, 7);
    g.stroke();
    g.fillStyle = "#fff";
    g.beginPath();
    g.arc(bx + stick.dx * 40, by + stick.dy * 40, 16, 0, 7);
    g.fill();
    g.fillStyle = touchBtn.atk ? "#ffd54a" : "#e0455a";
    g.beginPath();
    g.arc(VW - 70, VH - 70, 34, 0, 7);
    g.fill();
    g.fillStyle = touchBtn.sp ? "#ffd54a" : "#6b5fa8";
    g.beginPath();
    g.arc(VW - 150, VH - 50, 26, 0, 7);
    g.fill();
    g.globalAlpha = 1;
    g.fillStyle = "#fff";
    g.font = "bold 11px monospace";
    g.textAlign = "center";
    g.fillText("ATK", VW - 70, VH - 66);
    g.fillText("SP", VW - 150, VH - 46);
  }

  ArcadeGames.register({
    id: "dungeon",
    title: "Dungeon Crawl",
    blurb: "1-4 player co-op roguelite. Descend, loot relics, beat a boss every third floor.",
    icon: ICON,
    mount(host, ctx) {
      const art = { tiles: img("tiles"), mon: img("monsters"), items: img("items") };
      const audio = makeAudio();
      const me0 = ctx.me();
      const myName = me0?.username || "hero";
      let race = Sim.raceOf(me0?.avatar);
      const raceList = Object.keys(Sim.RACES);

      const root = el("div", "dg-root");
      host.append(root);
      let screen = "menu";
      let net = null;
      let lb = null;
      let game = null; // the running game, see startRun
      let myId = "solo";
      let netHostId = null;
      let lobby = new Map();

      const clear = () => { lb?.destroy(); lb = null; root.replaceChildren(); };
      function stopNet() {
        if (net) { try { net.close(); } catch { /* ignore */ } }
        net = null;
        lobby = new Map();
      }
      const newSeed = () => (Math.floor(Math.random() * 2 ** 32) ^ Date.now()) >>> 0;
      const newCode = () => Array.from({ length: 4 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ"[Math.floor(Math.random() * 24)]).join("");

      // ------------------------------------------------------------ menu
      function showMenu(msg) {
        stopGame();
        stopNet();
        screen = "menu";
        clear();
        root.append(el("h2", "dg-title", "Dungeon Crawl"));
        root.append(el("p", "dg-sub", "Fight down through the floors. Your race decides your special. Bring up to three friends."));
        if (msg) root.append(el("p", "dg-notice", msg));

        const pick = el("div", "dg-race");
        const prev = el("button", "dg-btn small", "<");
        const next = el("button", "dg-btn small", ">");
        const label = el("div", "dg-racename");
        const refresh = () => {
          label.textContent = `${Sim.RACES[race].name} · ${Sim.specialOf(race).name} (${Sim.MELEE.has(race) ? "melee" : "ranged"})`;
        };
        prev.onclick = () => { race = raceList[(raceList.indexOf(race) + raceList.length - 1) % raceList.length]; refresh(); };
        next.onclick = () => { race = raceList[(raceList.indexOf(race) + 1) % raceList.length]; refresh(); };
        refresh();
        pick.append(prev, label, next);
        root.append(pick);

        const row = el("div", "dg-row");
        const solo = el("button", "dg-btn", "Solo run");
        solo.onclick = () => startRun({ role: "solo", seed: newSeed(), roster: [{ id: "solo", name: myName, race }] });
        const hostBtn = el("button", "dg-btn", "Host co-op");
        hostBtn.onclick = () => openRoom(newCode());
        row.append(solo, hostBtn);
        root.append(row);

        const joinRow = el("div", "dg-row");
        const input = el("input", "dg-input");
        input.maxLength = 8;
        input.placeholder = "ROOM CODE";
        input.setAttribute("aria-label", "room code");
        const join = el("button", "dg-btn", "Join");
        join.onclick = () => { const c = input.value.trim().toUpperCase(); if (c.length >= 3) openRoom(c); };
        input.onkeydown = (e) => { e.stopPropagation(); if (e.key === "Enter") join.onclick(); };
        joinRow.append(input, join);
        root.append(joinRow);

        root.append(el("p", "dg-help", "Move: WASD / arrows. Attack: Space or J (auto-aims, or hold the mouse to aim). Special: K / Shift. Mute: M. Touch: on-screen stick and buttons."));
        const lbHost = el("div", "dg-lb");
        root.append(lbHost);
        lb = ctx.leaderboard.mountCanvas(lbHost, "dungeon", { me: me0?.username, width: 380, height: 300, title: "DUNGEON" });
        const quit = el("button", "dg-btn small", "Back to arcade");
        quit.onclick = () => ctx.close();
        root.append(quit);
      }

      // ------------------------------------------------------------ lobby + networking
      function openRoom(code) {
        stopNet();
        screen = "lobby";
        let said = false;
        net = ctx.net("dungeon", code, {
          onHello() {
            myId = net.id;
            netHostId = net.host();
            const info = { id: net.id, name: myName, race };
            if (net.isHost()) lobby.set(info.id, info);
            else if (!said) { said = true; net.send({ t: "join", ...info }, netHostId); }
            showLobby(code);
          },
          onJoin() { if (screen === "lobby") showLobby(code); },
          onLeave(id) {
            lobby.delete(id);
            if (game) {
              if (game.role === "client" && id === game.hostId) endRun("The host left the dungeon.");
              else if (game.role === "host") Sim.removePlayer(game.sim, id);
            } else if (id === netHostId && screen === "lobby") showMenu("The host left the room.");
            else if (screen === "lobby") { broadcastLobby(); showLobby(code); }
          },
          onMsg: (from, d) => onMsg(from, d, code),
          onClose() {
            if (game && !game.ended && game.role !== "solo") endRun("Lost the connection.");
            else if (screen === "lobby") showMenu("Could not stay connected to that room.");
          },
        });
      }

      function broadcastLobby() {
        if (net?.isHost()) net.send({ t: "lobby", list: [...lobby.values()] });
      }

      function onMsg(from, d, code) {
        if (!d || typeof d !== "object") return;
        if (net.isHost()) {
          if (d.t === "join") {
            const info = { id: from, name: String(d.name || "hero").slice(0, 20), race: Sim.RACES[d.race] ? d.race : "pixie" };
            if (game) {
              if (game.role !== "host") return;
              if (Sim.addPlayer(game.sim, info)) net.send({ t: "start", seed: game.sim.seed }, from);
              else net.send({ t: "full" }, from);
            } else {
              lobby.set(from, info);
              broadcastLobby();
              if (screen === "lobby") showLobby(code);
            }
          } else if (d.t === "in" && game?.role === "host" && d.i && typeof d.i === "object") {
            Sim.setInput(game.sim, from, d.i);
          }
          return;
        }
        if (d.t === "lobby" && Array.isArray(d.list)) {
          lobby = new Map(d.list.map((p) => [p.id, p]));
          if (screen === "lobby") showLobby(code);
        } else if (d.t === "start") {
          startRun({ role: "client", seed: d.seed, hostId: from });
        } else if (d.t === "full") {
          showMenu("That run already has four heroes.");
        } else if (d.t === "s" && game?.role === "client" && d.s) {
          game.snaps.push({ at: performance.now(), s: d.s });
          if (game.snaps.length > 4) game.snaps.shift();
          game.lastSnap = performance.now();
          handleEvents(d.s.ev);
          if (d.s.over) endRun(d.s.reason === "dead" ? "Everyone fell." : "The run ended.");
        }
      }

      function showLobby(code) {
        clear();
        screen = "lobby";
        root.append(el("h2", "dg-title", "Co-op lobby"));
        root.append(el("p", "dg-code", code));
        root.append(el("p", "dg-sub", "Friends join with this room code from the Dungeon Crawl menu."));
        const list = el("ul", "dg-players");
        const players = net?.players() || [];
        for (const p of players) {
          const info = lobby.get(p.id);
          list.append(el("li", "", `${p.username}${p.id === net.id ? " (you)" : ""}${info ? " · " + Sim.RACES[info.race].name : " · joining..."}`));
        }
        root.append(list);
        const row = el("div", "dg-row");
        if (net?.isHost()) {
          const start = el("button", "dg-btn", "Start run");
          start.onclick = () => {
            const seed = newSeed();
            const roster = [...lobby.values()].filter((p) => players.some((q) => q.id === p.id)).slice(0, Sim.MAX_PLAYERS);
            net.send({ t: "start", seed });
            startRun({ role: "host", seed, roster });
          };
          row.append(start);
        } else row.append(el("p", "dg-sub", "Waiting for the host to start..."));
        const leave = el("button", "dg-btn small", "Leave");
        leave.onclick = () => showMenu();
        row.append(leave);
        root.append(row);
      }

      // ------------------------------------------------------------ input
      const keys = new Set();
      const pointers = new Map(); // touch id -> { kind, ox, oy }
      let mouse = null; // canvas-space point while the mouse button is held
      let touchMode = false;
      const stick = { dx: 0, dy: 0 };
      const touchBtn = { atk: false, sp: false };

      const onKey = (down) => (e) => {
        if (e.target?.tagName === "INPUT") return;
        const k = e.key.toLowerCase();
        if (down && k === "m") { audio.toggle(); return; }
        keys[down ? "add" : "delete"](k === " " ? "space" : k);
        if (game && ["arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k)) e.preventDefault();
      };
      const kd = onKey(true);
      const ku = onKey(false);
      window.addEventListener("keydown", kd);
      window.addEventListener("keyup", ku);

      function readInput(camPlayer) {
        const h = (a, b) => (keys.has(a) || keys.has(b) ? 1 : 0);
        const dx = Math.max(-1, Math.min(1, h("d", "arrowright") - h("a", "arrowleft") + stick.dx));
        const dy = Math.max(-1, Math.min(1, h("s", "arrowdown") - h("w", "arrowup") + stick.dy));
        const atk = keys.has("space") || keys.has("j") || keys.has("z") || touchBtn.atk || !!mouse;
        const sp = keys.has("k") || keys.has("shift") || keys.has("x") || keys.has("e") || touchBtn.sp;
        const inp = { dx: Math.round(dx * 100) / 100, dy: Math.round(dy * 100) / 100, atk: atk ? 1 : 0, sp: sp ? 1 : 0, ax: 0, ay: 0, manual: 0 };
        if (mouse && camPlayer && game) {
          inp.manual = 1;
          inp.ax = Math.round((mouse.x + game.cam.x - camPlayer.x) * 10) / 10;
          inp.ay = Math.round((mouse.y + game.cam.y - camPlayer.y) * 10) / 10;
        }
        return inp;
      }

      function bindPointers(canvas) {
        const pos = (e) => {
          const r = canvas.getBoundingClientRect();
          return { x: ((e.clientX - r.left) * VW) / r.width, y: ((e.clientY - r.top) * VH) / r.height };
        };
        canvas.addEventListener("pointerdown", (e) => {
          const p = pos(e);
          canvas.setPointerCapture?.(e.pointerId);
          if (e.pointerType === "mouse") { mouse = p; return; }
          touchMode = true;
          if (Math.hypot(p.x - (VW - 70), p.y - (VH - 70)) < 44) { pointers.set(e.pointerId, { kind: "atk" }); touchBtn.atk = true; }
          else if (Math.hypot(p.x - (VW - 150), p.y - (VH - 50)) < 36) { pointers.set(e.pointerId, { kind: "sp" }); touchBtn.sp = true; }
          else pointers.set(e.pointerId, { kind: "stick", ox: p.x, oy: p.y });
        });
        canvas.addEventListener("pointermove", (e) => {
          const p = pos(e);
          if (e.pointerType === "mouse") { if (mouse) mouse = p; return; }
          const t = pointers.get(e.pointerId);
          if (t?.kind !== "stick") return;
          const dx = p.x - t.ox;
          const dy = p.y - t.oy;
          const len = Math.hypot(dx, dy);
          const k = len > 8 ? Math.min(1, len / 40) / len : 0;
          stick.dx = dx * k;
          stick.dy = dy * k;
        });
        const up = (e) => {
          if (e.pointerType === "mouse") { mouse = null; return; }
          const t = pointers.get(e.pointerId);
          if (!t) return;
          if (t.kind === "stick") { stick.dx = 0; stick.dy = 0; }
          if (t.kind === "atk") touchBtn.atk = false;
          if (t.kind === "sp") touchBtn.sp = false;
          pointers.delete(e.pointerId);
        };
        canvas.addEventListener("pointerup", up);
        canvas.addEventListener("pointercancel", up);
        canvas.addEventListener("contextmenu", (e) => e.preventDefault());
      }

      // ------------------------------------------------------------ the run
      function startRun(o) {
        clear();
        screen = "play";
        const canvas = el("canvas", "dg-canvas");
        canvas.width = VW;
        canvas.height = VH;
        canvas.tabIndex = 0;
        const tools = el("div", "dg-bar");
        const muteBtn = el("button", "dg-btn small", audio.muted ? "Sound off" : "Sound on");
        muteBtn.onclick = () => { audio.toggle(); muteBtn.textContent = audio.muted ? "Sound off" : "Sound on"; };
        const quit = el("button", "dg-btn small", "Quit run");
        quit.onclick = () => endRun("You left the dungeon.");
        tools.append(muteBtn, quit);
        root.append(canvas, tools);
        const g2 = canvas.getContext("2d");
        g2.imageSmoothingEnabled = false;
        game = {
          role: o.role, hostId: o.hostId || net?.host(), sim: null, snaps: [], lastSnap: performance.now(), model: null, cam: { x: 0, y: 0 },
          netEv: [], fx: [], banner: null, shake: 0, seen: null, vis: null, mapKey: "", map: null, raf: 0, last: performance.now(), acc: 0,
          lastSend: 0, ended: false, canvas, g2, start: performance.now(),
        };
        if (o.role !== "client") {
          game.sim = Sim.create(o.seed, o.roster);
          myId = o.role === "solo" ? "solo" : net.id;
        }
        bindPointers(canvas);
        game.raf = requestAnimationFrame(frame);
        canvas.focus();
      }

      function stopGame() {
        if (game) cancelAnimationFrame(game.raf);
        game = null;
        keys.clear();
        pointers.clear();
        mouse = null;
        stick.dx = stick.dy = 0;
        touchBtn.atk = touchBtn.sp = false;
      }

      function frame(now) {
        const gm = game;
        if (!gm) return;
        gm.raf = requestAnimationFrame(frame);
        const dt = Math.min(100, now - gm.last);
        gm.last = now;
        if (gm.role === "client") {
          const rt = now - 90; // render a little in the past so there is always a next snapshot to blend toward
          const sn = gm.snaps;
          if (sn.length) {
            let a = sn[0];
            let b = sn[sn.length - 1];
            for (let i = 0; i < sn.length - 1; i++) if (sn[i].at <= rt && sn[i + 1].at >= rt) { a = sn[i]; b = sn[i + 1]; }
            gm.model = rt >= b.at || a === b ? b.s : Sim.lerpSnap(a.s, b.s, (rt - a.at) / Math.max(1, b.at - a.at));
          }
          if (now - gm.lastSend > 33) {
            gm.lastSend = now;
            net?.send({ t: "in", i: readInput(gm.model?.p.find((p) => p.id === myId)) }, gm.hostId);
          }
          if (now - gm.lastSnap > 6000 && now - gm.start > 6000) { endRun("The host stopped responding."); return; }
        } else {
          gm.acc += dt;
          let n = 0;
          while (gm.acc >= 1000 / 60 && n < 5) {
            gm.acc -= 1000 / 60;
            n++;
            Sim.setInput(gm.sim, myId, readInput(gm.sim.players.find((p) => p.id === myId)));
            Sim.step(gm.sim);
            const ev = gm.sim.ev.splice(0);
            handleEvents(ev);
            gm.netEv.push(...ev);
            if (gm.role === "host" && gm.sim.t % 4 === 0) {
              const s = Sim.snapshot(gm.sim);
              s.ev = gm.netEv.splice(0);
              net.send({ t: "s", s });
            }
          }
          if (n === 5) gm.acc = 0;
          gm.model = Sim.snapshot(gm.sim);
          if (gm.sim.over) {
            if (gm.role === "host") { const s = Sim.snapshot(gm.sim); s.ev = gm.netEv.splice(0); net.send({ t: "s", s }); }
            endRun(gm.sim.reason === "dead" ? "Everyone fell." : "The run ended.");
            return;
          }
        }
        if (gm.model) render(gm, now);
      }

      // ------------------------------------------------------------ events: sounds + floating text
      function handleEvents(ev) {
        const gm = game;
        if (!gm || !ev) return;
        const text = (x, y, txt, col, big) => gm.fx.push({ k: "text", x, y, t: 0, txt, col, big });
        for (const [k, x, y, v] of ev) {
          const near = Math.hypot(x - (gm.cam.x + VW / 2), y - (gm.cam.y + VH / 2)) < 520;
          switch (k) {
            case "hit": if (near) { audio.play("hit"); text(x, y, String(v), "#fff"); } break;
            case "hurt": audio.play("hurt"); gm.shake = 8; text(x, y, "-" + v, "#ff6a6a"); break;
            case "shoot": if (near) audio.play("shoot"); break;
            case "kill": if (near) audio.play(v ? "bossdead" : "kill"); break;
            case "gold": audio.play("gold"); text(x, y, "+" + v, "#ffd54a"); break;
            case "potion": audio.play("potion"); text(x, y, "heal", "#8affb0"); break;
            case "relic": {
              audio.play("relic");
              const r = Sim.RELICS[Sim.RELIC_IDS[v]];
              text(x, y - 10, r.name, r.color, 1);
              gm.banner = { text: `${r.name}: ${r.desc}`, t: 0, small: 1 };
              break;
            }
            case "chest": audio.play("chest"); break;
            case "special": if (near) audio.play("special"); break;
            case "ring": gm.fx.push({ k: "ring", x, y, r: v, t: 0 }); if (near) audio.play("ring"); break;
            case "boom": gm.shake = 6; audio.play("boom"); break;
            case "blink": if (near) audio.play("blink"); break;
            case "down": audio.play("down"); break;
            case "revive": audio.play("revive"); break;
            case "descend": audio.play("descend"); break;
            case "floor": audio.play("floor"); gm.banner = { text: v % 3 === 0 ? `FLOOR ${v} - BOSS` : `FLOOR ${v}`, t: 0 }; break;
            default: break;
          }
        }
        if (gm.fx.length > 80) gm.fx.splice(0, gm.fx.length - 80);
      }

      // ------------------------------------------------------------ rendering
      function drawMon(g, type, frame2, cx, cy, size, flash, flip) {
        if (!ready(art.mon)) { g.fillStyle = "#d33"; g.fillRect(cx - size / 2, cy - size / 2, size, size); return; }
        const sx = (MON[type] * 2 + frame2) * 16;
        g.save();
        g.translate(cx, cy - size * 0.2);
        if (flip) g.scale(-1, 1);
        g.drawImage(art.mon, sx, 0, 16, 16, -size / 2, -size / 2, size, size);
        if (flash) { g.globalCompositeOperation = "lighter"; g.drawImage(art.mon, sx, 0, 16, 16, -size / 2, -size / 2, size, size); }
        g.restore();
      }
      function drawItem(g, idx, cx, cy, size) {
        if (ready(art.items)) g.drawImage(art.items, idx * 16, 0, 16, 16, cx - size / 2, cy - size / 2, size, size);
        else { g.fillStyle = "#ffd54a"; g.fillRect(cx - 4, cy - 4, 8, 8); }
      }

      function ensureMap(gm, model) {
        const key = model.seed + ":" + model.n;
        if (gm.mapKey === key) return;
        gm.mapKey = key;
        gm.map = Sim.generate(model.seed, model.n);
        gm.seen = new Uint8Array(gm.map.w * gm.map.h);
        gm.vis = new Uint8Array(gm.map.w * gm.map.h);
        gm.torchSet = new Set(gm.map.torches.map((t) => t.y * gm.map.w + t.x));
      }

      function render(gm, now) {
        const g = gm.g2;
        const model = gm.model;
        ensureMap(gm, model);
        const map = gm.map;
        const mePl = model.p.find((p) => p.id === myId) || model.p[0];
        // spectate a teammate while down
        const focus = mePl?.down ? model.p.find((p) => !p.down) || mePl : mePl;
        if (focus) {
          gm.cam.x = Math.max(0, Math.min(map.w * T - VW, focus.x - VW / 2));
          gm.cam.y = Math.max(0, Math.min(map.h * T - VH, focus.y - VH / 2));
          gm.vis.fill(0);
          Sim.reveal(map, focus.x, focus.y, 9, gm.vis);
          for (let i = 0; i < gm.vis.length; i++) if (gm.vis[i]) gm.seen[i] = 1;
        }
        let cx = Math.round(gm.cam.x);
        let cy = Math.round(gm.cam.y);
        if (gm.shake > 0) { cx += Math.round((Math.sin(now) * gm.shake) / 2); cy += Math.round((Math.cos(now * 1.3) * gm.shake) / 2); gm.shake -= 0.5; }
        g.globalCompositeOperation = "source-over";
        g.fillStyle = "#07040c";
        g.fillRect(0, 0, VW, VH);
        g.save();
        g.translate(-cx, -cy);

        const x0 = Math.max(0, Math.floor(cx / T));
        const y0 = Math.max(0, Math.floor(cy / T));
        const x1 = Math.min(map.w - 1, Math.floor((cx + VW) / T));
        const y1 = Math.min(map.h - 1, Math.floor((cy + VH) / T));
        const tilesOk = ready(art.tiles);
        for (let ty = y0; ty <= y1; ty++) {
          for (let tx = x0; tx <= x1; tx++) {
            const i = ty * map.w + tx;
            if (!gm.seen[i]) continue;
            const isFloor = map.tiles[i] === 1;
            let idx;
            if (isFloor) idx = Sim.hash(tx, ty, 5) % 7 === 0 ? 1 : 0;
            else if (Sim.floorAt(map, tx, ty + 1)) idx = gm.torchSet.has(i) ? 5 : 2;
            else idx = 3;
            if (tilesOk) g.drawImage(art.tiles, idx * 16, 0, 16, 16, tx * T, ty * T, T, T);
            else { g.fillStyle = isFloor ? "#3a3350" : idx === 2 ? "#6b4f5e" : "#1c1626"; g.fillRect(tx * T, ty * T, T, T); }
            if (!gm.vis[i]) { g.fillStyle = "rgba(8,5,16,.62)"; g.fillRect(tx * T, ty * T, T, T); }
          }
        }
        const exT = { x: Math.floor(map.exit.x / T), y: Math.floor(map.exit.y / T) };
        if (gm.seen[exT.y * map.w + exT.x]) {
          g.globalAlpha = model.exit ? 1 : 0.4;
          if (tilesOk) g.drawImage(art.tiles, 64, 0, 16, 16, exT.x * T, exT.y * T, T, T);
          g.globalAlpha = 1;
          g.textAlign = "center";
          if (!model.exit) { g.fillStyle = "#ff6a6a"; g.font = "bold 9px monospace"; g.fillText("SEALED", map.exit.x, map.exit.y + 3); }
          else if (model.stairs > 0) { g.fillStyle = "#8affb0"; g.fillRect(map.exit.x - 24, map.exit.y - 22, (48 * model.stairs) / Sim.STAIR_FRAMES, 4); }
        }
        const visAt = (x, y) => gm.vis[Math.floor(y / T) * map.w + Math.floor(x / T)] === 1;

        for (const [, kind, x, y, v] of model.it) {
          if (!visAt(x, y)) continue;
          const bob = Math.sin(now / 200 + x) * 2;
          if (kind === "gold") drawItem(g, 0, x, y + bob, 14);
          else if (kind === "potion") drawItem(g, 1, x, y + bob, 18);
          else if (kind === "relic") {
            g.fillStyle = Sim.RELICS[Sim.RELIC_IDS[v]].color + "55";
            g.beginPath();
            g.arc(x, y + bob, 13, 0, 7);
            g.fill();
            drawItem(g, 2, x, y + bob, 20);
          } else drawItem(g, 3, x, y, 26);
        }

        // enemies and heroes sorted by y so they overlap sensibly
        const things = [];
        for (const e of model.e) if (visAt(e[2], e[3])) things.push({ y: e[3], e });
        for (const p of model.p) things.push({ y: p.y, p });
        things.sort((a, b) => a.y - b.y);
        for (const th of things) {
          if (th.p) { drawHero(g, th.p, now, th.p.id === myId); continue; }
          const [, type, x, y, hp, max, fl, ang] = th.e;
          const size = MON_SIZE[type];
          g.fillStyle = "rgba(0,0,0,.35)";
          g.beginPath();
          g.ellipse(x, y + size * 0.3, size * 0.4, size * 0.13, 0, 0, 7);
          g.fill();
          if (fl & 4) {
            g.strokeStyle = "rgba(255,70,70,.7)";
            g.lineWidth = type === "boss" ? 6 : 3;
            g.beginPath();
            g.moveTo(x, y);
            g.lineTo(x + Math.cos(ang) * 150, y + Math.sin(ang) * 150);
            g.stroke();
          }
          const f2 = Math.floor(now / 220 + x) % 2;
          drawMon(g, type, fl & 8 ? 0 : f2, x, y - (type === "bat" ? 8 + Math.sin(now / 90 + x) * 3 : 0), size, fl & 2, Math.cos(ang) < 0);
          if (hp < max && type !== "boss") {
            g.fillStyle = "#000";
            g.fillRect(x - 12, y - size * 0.7, 24, 4);
            g.fillStyle = "#e0455a";
            g.fillRect(x - 11, y - size * 0.7 + 1, (22 * hp) / max, 2);
          }
        }

        for (const [, x, y, vx, vy, r, team, kind] of model.sh) {
          if (!visAt(x, y)) continue;
          if (kind === "slash") {
            g.strokeStyle = "#fff";
            g.lineWidth = 3;
            g.beginPath();
            g.arc(x - vx * 2, y - vy * 2, r, Math.atan2(vy, vx) - 1, Math.atan2(vy, vx) + 1);
            g.stroke();
          } else if (kind === "arrow") {
            g.strokeStyle = "#d8c8a0";
            g.lineWidth = 2;
            g.beginPath();
            g.moveTo(x, y);
            g.lineTo(x - vx * 3, y - vy * 3);
            g.stroke();
          } else if (kind === "orb" && ready(art.items)) drawItem(g, 5, x, y, r * 2.6);
          else {
            g.fillStyle = kind === "spec" ? "#ffd54a" : team ? "#ff6a6a" : "#9fe8ff";
            g.beginPath();
            g.arc(x, y, r, 0, 7);
            g.fill();
          }
        }

        for (const f of gm.fx) {
          f.t++;
          if (f.k === "text") {
            g.font = `bold ${f.big ? 11 : 9}px monospace`;
            g.textAlign = "center";
            g.fillStyle = "#000";
            g.fillText(f.txt, f.x + 1, f.y - f.t * 0.6 + 1);
            g.fillStyle = f.col;
            g.fillText(f.txt, f.x, f.y - f.t * 0.6);
          } else {
            g.strokeStyle = `rgba(255,255,255,${1 - f.t / 18})`;
            g.lineWidth = 3;
            g.beginPath();
            g.arc(f.x, f.y, f.r * Math.min(1, f.t / 8), 0, 7);
            g.stroke();
          }
        }
        gm.fx = gm.fx.filter((f) => f.t < (f.k === "text" ? 50 : 18));
        g.restore();

        // light falloff around whoever the camera follows
        if (focus) {
          const lx = focus.x - cx;
          const ly = focus.y - cy;
          const grd = g.createRadialGradient(lx, ly, 70, lx, ly, 290);
          grd.addColorStop(0, "rgba(0,0,0,0)");
          grd.addColorStop(1, "rgba(5,3,12,.72)");
          g.fillStyle = grd;
          g.fillRect(0, 0, VW, VH);
        }
        drawHud(g, gm, model, mePl);
      }

      function drawHud(g, gm, model, mePl) {
        g.textBaseline = "alphabetic";
        g.textAlign = "left";
        if (mePl) {
          bar(g, 8, 8, 120, 10, mePl.hp / mePl.max, mePl.down ? "#555" : "#e0455a");
          g.font = "bold 9px monospace";
          g.fillStyle = "#fff";
          g.fillText(`${mePl.hp}/${mePl.max}`, 12, 16);
          const sp = Sim.specialOf(mePl.race);
          const total = ({ proj: 300, buff: 600 }[sp.kind] || 360) * Math.pow(0.85, mePl.relics.haste || 0);
          bar(g, 8, 22, 120, 6, 1 - mePl.sp / total, mePl.sp > 0 ? "#6b5fa8" : "#ffd54a");
          g.fillStyle = "#cbbcf5";
          g.fillText(mePl.sp > 0 ? sp.name : sp.name + " READY (K)", 8, 38);
          let rx = 8;
          let ry = 44;
          for (const id of Sim.RELIC_IDS) {
            const n = mePl.relics[id];
            if (!n) continue;
            const r = Sim.RELICS[id];
            g.fillStyle = "#000";
            g.fillRect(rx - 1, ry - 1, 17, 17);
            g.fillStyle = r.color;
            g.fillRect(rx, ry, 15, 15);
            g.fillStyle = "#1a1420";
            g.font = "bold 10px monospace";
            g.fillText(r.letter, rx + 4, ry + 11);
            if (n > 1) { g.fillStyle = "#fff"; g.font = "bold 8px monospace"; g.fillText("x" + n, rx + 5, ry + 24); }
            rx += 18;
            if (rx > 150) { rx = 8; ry += 26; }
          }
        }
        // teammates sit under the minimap
        let ty = 6 + gm.map.h * 2 + 14;
        for (const p of model.p) {
          if (p.id === myId) continue;
          g.font = "8px monospace";
          g.fillStyle = "#fff";
          g.textAlign = "right";
          g.fillText(String(p.name).slice(0, 10), VW - 126, ty + 5);
          bar(g, VW - 120, ty, 112, 5, p.hp / p.max, p.down ? "#555" : "#6bcf5a");
          ty += 12;
        }
        g.textAlign = "center";
        g.font = "bold 12px monospace";
        g.fillStyle = "#fff";
        g.fillText(`FLOOR ${model.n}`, VW / 2, 16);
        g.font = "10px monospace";
        g.fillStyle = "#ffd54a";
        g.fillText(`gold ${model.gold}  kills ${model.kills}  score ${Sim.score(model.n, model.gold, model.kills)}`, VW / 2, 29);
        if (model.boss) {
          const w = 260;
          bar(g, VW / 2 - w / 2, VH - 24, w, 10, model.boss.hp / model.boss.max, "#c03a8a");
          g.fillStyle = "#fff";
          g.font = "bold 10px monospace";
          g.fillText(model.boss.name, VW / 2, VH - 28);
        }
        // minimap
        const map = gm.map;
        const mx = VW - map.w * 2 - 6;
        const my = 6;
        g.fillStyle = "rgba(0,0,0,.55)";
        g.fillRect(mx - 2, my - 2, map.w * 2 + 4, map.h * 2 + 4);
        for (let y = 0; y < map.h; y++) {
          for (let x = 0; x < map.w; x++) {
            const i = y * map.w + x;
            if (!gm.seen[i] || map.tiles[i] !== 1) continue;
            g.fillStyle = gm.vis[i] ? "#8d82b0" : "#4d4570";
            g.fillRect(mx + x * 2, my + y * 2, 2, 2);
          }
        }
        const exI = Math.floor(map.exit.y / T) * map.w + Math.floor(map.exit.x / T);
        if (gm.seen[exI]) { g.fillStyle = model.exit ? "#8affb0" : "#ff6a6a"; g.fillRect(mx + Math.floor(map.exit.x / T) * 2 - 1, my + Math.floor(map.exit.y / T) * 2 - 1, 4, 4); }
        for (const p of model.p) {
          g.fillStyle = p.id === myId ? "#fff" : "#6bcf5a";
          g.fillRect(mx + Math.floor(p.x / T) * 2 - 1, my + Math.floor(p.y / T) * 2 - 1, 3, 3);
        }
        g.fillStyle = "#e0455a";
        for (const e of model.e) if (gm.vis[Math.floor(e[3] / T) * map.w + Math.floor(e[2] / T)]) g.fillRect(mx + Math.floor(e[2] / T) * 2, my + Math.floor(e[3] / T) * 2, 2, 2);
        if (gm.banner) {
          gm.banner.t++;
          const a = Math.min(1, (200 - gm.banner.t) / 40);
          if (a <= 0) gm.banner = null;
          else {
            g.globalAlpha = a;
            g.textAlign = "center";
            g.font = gm.banner.small ? "bold 11px monospace" : "bold 26px monospace";
            g.fillStyle = "#000";
            g.fillText(gm.banner.text, VW / 2 + 2, VH / 2 - 60 + 2);
            g.fillStyle = gm.banner.small ? "#fff" : "#ffd54a";
            g.fillText(gm.banner.text, VW / 2, VH / 2 - 60);
            g.globalAlpha = 1;
          }
        }
        if (mePl?.down) {
          g.textAlign = "center";
          g.font = "bold 12px monospace";
          g.fillStyle = "#ff8a8a";
          g.fillText("You are down. A teammate can stand by you to revive you.", VW / 2, VH - 50);
        }
        if (touchMode) drawTouch(g, pointers, stick, touchBtn);
      }

      // ------------------------------------------------------------ end of run
      function endRun(reason) {
        const gm = game;
        if (!gm || gm.ended) return;
        gm.ended = true;
        const m = gm.model || { n: 1, gold: 0, kills: 0, p: [] };
        const floors = m.n;
        const total = Sim.score(floors, m.gold, m.kills);
        const players = Math.max(1, m.p.length);
        stopGame();
        stopNet();
        screen = "end";
        clear();
        root.append(el("h2", "dg-title", "Run over"));
        root.append(el("p", "dg-sub", reason));
        const tbl = el("div", "dg-score");
        tbl.append(el("div", "", `Floor reached: ${floors} (+${floors * 1000})`), el("div", "", `Gold: ${m.gold}`), el("div", "", `Kills: ${m.kills}`), el("strong", "", `Score: ${total.toLocaleString()}`));
        root.append(tbl);
        const status = el("p", "dg-sub", "Saving your score...");
        root.append(status);
        const lbHost = el("div", "dg-lb");
        root.append(lbHost);
        const board = ctx.leaderboard.mountCanvas(lbHost, "dungeon", { me: me0?.username, width: 380, height: 300, title: "DUNGEON" });
        lb = board;
        ctx.leaderboard.submit("dungeon", total, { floors, players }).then((res) => {
          if (screen !== "end") return;
          status.textContent = !res ? "Score not saved (sign in to get on the board)." : res.improved ? "New personal best!" : "Saved. Your best is still higher.";
          board.refresh();
        });
        const row = el("div", "dg-row");
        const again = el("button", "dg-btn", "Play again");
        again.onclick = () => showMenu();
        const quit = el("button", "dg-btn small", "Back to arcade");
        quit.onclick = () => ctx.close();
        row.append(again, quit);
        root.append(row);
      }

      showMenu();
      return {
        destroy() {
          window.removeEventListener("keydown", kd);
          window.removeEventListener("keyup", ku);
          stopGame();
          stopNet();
          lb?.destroy();
          audio.close();
        },
      };
    },
  });
})();
