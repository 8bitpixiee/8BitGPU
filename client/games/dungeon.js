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
