// Pixie Survivors: a horde survival cabinet. The first half of this file is the pure sim (no DOM, runs in
// node for tests/survivors.test.cjs), the second half is the canvas game that drives it. Times are seconds,
// distances are pixels, the world has no edges and the camera follows the player.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.SurvivorsSim = api;
})(typeof self !== "undefined" ? self : this, function () {
  const TAU = Math.PI * 2;
  const CELL = 64; // spatial hash cell, a bit bigger than the biggest normal enemy
  const BUCKETS = 4096;
  const MAX_ENEMIES = 1100;
  const ENEMY_CAP = 650; // how many the director aims for late in the run
  const SPAWN_R = 470; // just outside the 800x480 view
  const FAR_R = 900; // stragglers past this get recycled to the spawn ring
  const MAX_LEVEL = 5;
  const MAX_SLOTS = 6;
  const FINAL_AT = 660;

  // small seeded rng so tests (and bug reports) can replay a run
  function mulberry(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const xpFor = (level) => Math.floor(4 + 6 * level + 0.35 * level * level);

  // ------------------------------------------------------------------ enemies
  // hp scales with the clock for normal enemies, bosses have fixed hp
  const ENEMIES = {
    gnat: { hp: 3, spd: 88, dmg: 4, r: 5, xp: 1 },
    shambler: { hp: 12, spd: 48, dmg: 6, r: 8, xp: 1 },
    bat: { hp: 6, spd: 105, dmg: 5, r: 6, xp: 1, wobble: true },
    slime: { hp: 24, spd: 42, dmg: 7, r: 10, xp: 2, split: "blob" },
    blob: { hp: 6, spd: 62, dmg: 4, r: 6, xp: 1 },
    archer: { hp: 14, spd: 52, dmg: 6, r: 8, xp: 3, ranged: true },
    ghost: { hp: 20, spd: 72, dmg: 8, r: 8, xp: 3, wobble: true },
    brute: { hp: 95, spd: 34, dmg: 14, r: 14, xp: 8 },
    boss1: { name: "Gloom Stag", hp: 1600, spd: 52, dmg: 16, r: 22, xp: 60, boss: true, moves: ["charge"] },
    boss2: { name: "Hollow Knight", hp: 3400, spd: 46, dmg: 18, r: 24, xp: 90, boss: true, moves: ["ring", "charge"] },
    boss3: { name: "Lich Moth", hp: 5600, spd: 60, dmg: 20, r: 24, xp: 120, boss: true, moves: ["aim", "summon"] },
    boss4: { name: "The Static King", hp: 15000, spd: 50, dmg: 26, r: 30, xp: 400, boss: true, final: true, moves: ["spiral", "ring", "charge"] },
  };

  // which enemies the director draws from, and from what second
  const POOL = [
    ["gnat", 0, 10], ["shambler", 0, 8], ["bat", 60, 6], ["slime", 120, 4],
    ["archer", 180, 3], ["ghost", 240, 4], ["brute", 300, 2],
  ];
  const BOSSES = [{ at: 180, type: "boss1" }, { at: 360, type: "boss2" }, { at: 540, type: "boss3" }, { at: FINAL_AT, type: "boss4" }];
  const ELITES = [90, 270, 450, 630]; // a big brute that drops a chest
  const RINGS = [90, 210, 330, 450, 570]; // swarm rings, bats once the run heats up

  // ------------------------------------------------------------------ weapons
  // base stats plus 4 upgrade steps. dmg, cd (seconds), n (count), spd, area (radius/reach), pierce, life
  const WEAPONS = {
    sparkle: {
      name: "Glitter Bolt", kind: "bolt", evolvesWith: "spellbook", evolved: "starstorm", color: "#ffe27a",
      desc: "Fires sparkling bolts at the nearest enemy.",
      base: { dmg: 8, cd: 1.0, n: 1, spd: 320, area: 6, pierce: 1, life: 1.4 },
      up: [{ n: 1 }, { dmg: 4 }, { n: 1, pierce: 1 }, { dmg: 6, cd: -0.2 }],
    },
    starstorm: {
      name: "Starstorm", kind: "bolt", color: "#fff3b0", desc: "A fan of piercing stars.",
      base: { dmg: 14, cd: 0.6, n: 5, spd: 380, area: 8, pierce: 3, life: 1.6 }, up: [],
    },
    petals: {
      name: "Orbiting Petals", kind: "orbit", evolvesWith: "crown", evolved: "bloomstorm", color: "#ff8ad4",
      desc: "Petals circle you and cut whatever they touch.",
      base: { dmg: 6, cd: 4.5, n: 2, spd: 2.6, area: 70, pierce: 99, life: 3.2 },
      up: [{ n: 1 }, { dmg: 3 }, { life: 0.8, n: 1 }, { dmg: 4, cd: -0.5 }],
    },
    bloomstorm: {
      name: "Bloomstorm", kind: "orbit", color: "#ffb3e8", desc: "A wide ring of razor blossoms.",
      base: { dmg: 12, cd: 5.5, n: 7, spd: 3.2, area: 105, pierce: 99, life: 5 }, up: [],
    },
    whip: {
      name: "Thorn Whip", kind: "whip", evolvesWith: "heart", evolved: "reaper", color: "#9cf29c",
      desc: "Lashes the way you face. Level 3 hits both sides.",
      base: { dmg: 12, cd: 1.4, n: 1, spd: 0, area: 95, pierce: 99, life: 0.2 },
      up: [{ dmg: 4 }, { n: 1, area: 15 }, { dmg: 6 }, { area: 25, cd: -0.25 }],
    },
    reaper: {
      name: "Briar Reaper", kind: "whip", color: "#d6ffb0", desc: "Huge double lash that heals you.",
      base: { dmg: 30, cd: 1.0, n: 2, spd: 0, area: 160, pierce: 99, life: 0.2 }, up: [], leech: true,
    },
    brine: {
      name: "Brine Pulse", kind: "aura", evolvesWith: "magnet", evolved: "tidal", color: "#6ad4ff",
      desc: "A salty ring pulses out of you.",
      base: { dmg: 5, cd: 1.1, n: 1, spd: 0, area: 62, pierce: 99, life: 0.3 },
      up: [{ area: 16 }, { dmg: 3 }, { area: 16, cd: -0.15 }, { dmg: 5 }],
    },
    tidal: {
      name: "Tidal Pulse", kind: "aura", color: "#a8ecff", desc: "A huge slowing wave.",
      base: { dmg: 14, cd: 0.8, n: 1, spd: 0, area: 150, pierce: 99, life: 0.3 }, up: [], slow: true,
    },
    zap: {
      name: "Chain Zap", kind: "zap", evolvesWith: "boots", evolved: "thunder", color: "#c8b6ff",
      desc: "Lightning strikes random enemies near you.",
      base: { dmg: 14, cd: 1.8, n: 1, spd: 0, area: 26, pierce: 1, life: 0.25 },
      up: [{ n: 1 }, { dmg: 6 }, { n: 1 }, { dmg: 8, cd: -0.4 }],
    },
    thunder: {
      name: "Thunderlord", kind: "zap", color: "#efe6ff", desc: "Storm of splashing bolts.",
      base: { dmg: 30, cd: 1.0, n: 6, spd: 0, area: 46, pierce: 1, life: 0.25 }, up: [],
    },
    antlerang: {
      name: "Antler Rang", kind: "boomer", evolvesWith: "might", evolved: "cyclone", color: "#e8c58a",
      desc: "Flies out, pierces, and comes back.",
      base: { dmg: 10, cd: 1.7, n: 1, spd: 260, area: 12, pierce: 99, life: 1.6 },
      up: [{ n: 1 }, { dmg: 4 }, { n: 1 }, { dmg: 6, area: 4 }],
    },
    cyclone: {
      name: "Stag Cyclone", kind: "boomer", color: "#fff0cc", desc: "Four giant antlers, all returning.",
      base: { dmg: 24, cd: 1.4, n: 4, spd: 290, area: 20, pierce: 99, life: 2.2 }, up: [],
    },
    bomb: {
      name: "Glitter Bomb", kind: "bomb", evolvesWith: "plating", evolved: "nova", color: "#ff9ad0",
      desc: "Lobs a bomb that bursts in sparkles.",
      base: { dmg: 20, cd: 2.4, n: 1, spd: 220, area: 70, pierce: 99, life: 0.8 },
      up: [{ area: 10 }, { n: 1 }, { dmg: 8 }, { area: 14, cd: -0.4 }],
    },
    nova: {
      name: "Supernova", kind: "bomb", color: "#ffd2ee", desc: "Three huge blasts.",
      base: { dmg: 50, cd: 2.0, n: 3, spd: 240, area: 130, pierce: 99, life: 0.8 }, up: [],
    },
    thorns: {
      name: "Throwing Thorns", kind: "knife", evolvesWith: "clover", evolved: "hail", color: "#c9f58a",
      desc: "Fast darts fan out the way you move.",
      base: { dmg: 6, cd: 0.7, n: 2, spd: 480, area: 4, pierce: 1, life: 1.0 },
      up: [{ n: 1 }, { dmg: 2 }, { n: 1 }, { cd: -0.15, dmg: 2 }],
    },
    hail: {
      name: "Thorn Hail", kind: "knife", color: "#e8ffb0", desc: "Piercing thorns in every direction.",
      base: { dmg: 10, cd: 0.6, n: 8, spd: 460, area: 5, pierce: 3, life: 1.1 }, up: [], ring: true,
    },
  };
  const WEAPON_IDS = Object.keys(WEAPONS).filter((id) => WEAPONS[id].up.length || WEAPONS[id].evolvesWith);

  const PASSIVES = {
    spellbook: { name: "Spellbook", desc: "Weapons cool down 8% faster.", color: "#7aa8ff" },
    crown: { name: "Pixie Crown", desc: "Bigger area on everything (+12%).", color: "#ffd54a" },
    heart: { name: "Big Heart", desc: "+18 max HP and slow regeneration.", color: "#ff6b81" },
    boots: { name: "Wing Boots", desc: "Move 8% faster.", color: "#9cf29c" },
    magnet: { name: "Magnet Charm", desc: "Gems fly to you from further away.", color: "#ff9aa2" },
    might: { name: "Power Shroom", desc: "All damage +12%.", color: "#ff8a4a" },
    plating: { name: "Tin Plating", desc: "Take 1 less damage from every hit.", color: "#b8c4d6" },
    clover: { name: "Lucky Clover", desc: "More XP, more crits, extra card at level 3.", color: "#5ee08a" },
  };
  const PASSIVE_IDS = Object.keys(PASSIVES);

  // each race opens with a weapon that matches its brawl special
  const START = {
    pixie: { weapon: "sparkle" }, deerbra: { weapon: "antlerang" }, bovadill: { weapon: "brine" },
    thixie: { weapon: "thorns" }, null: { weapon: "zap" }, voidling: { weapon: "zap" },
    clanker: { weapon: "petals" }, mermaid: { weapon: "bomb" }, anthro: { weapon: "whip" },
    macho: { weapon: "whip" }, femme: { weapon: "petals" }, maxie: { weapon: "antlerang" },
    pickle: { weapon: "brine" },
  };

  function weaponStats(id, level) {
    const def = WEAPONS[id];
    const out = { ...def.base };
    for (let i = 0; i < level - 1 && i < def.up.length; i++) for (const k in def.up[i]) out[k] += def.up[i][k];
    return out;
  }
  const deltaText = (d) => {
    const names = { dmg: "damage", n: "projectile", cd: "cooldown", area: "area", pierce: "pierce", life: "duration", spd: "speed" };
    return Object.keys(d).map((k) => `${d[k] > 0 ? "+" : ""}${d[k]} ${names[k]}`).join(", ");
  };

  // ------------------------------------------------------------------ state
  function create(opts = {}) {
    const race = START[opts.race] ? opts.race : "pixie";
    const maxHp = opts.hp || 100;
    const s = {
      t: 0, tick: 0, phase: "play", race, rng: mulberry(opts.seed == null ? 1 : opts.seed),
      p: { x: 0, y: 0, fx: 1, fy: 0, r: 9, hp: maxHp, maxHp, baseHp: maxHp, baseSpeed: 120 * (opts.speed || 1), iframes: 0, moving: false },
      enemies: [], gems: [], pickups: [], shots: [], eshots: [], events: [],
      weapons: [], passives: {}, level: 1, xp: 0, xpNext: xpFor(1), pending: 0, choices: [],
      kills: 0, bonus: 0, spawnAcc: 0, nextId: 1, bossIdx: 0, eliteIdx: 0, ringIdx: 0, boss: null,
      stamp: 0, hits: 0, grid: { head: new Int32Array(BUCKETS), next: new Int32Array(MAX_ENEMIES + 64) },
      near: [], near2: [], won: false,
    };
    addWeapon(s, START[race].weapon);
    recompute(s);
    s.p.hp = s.p.maxHp;
    return s;
  }

  function addWeapon(s, id) {
    s.weapons.push({ id, level: 1, timer: 0.3 });
  }

  // turns passives into the numbers the rest of the sim reads
  function recompute(s) {
    const L = (id) => s.passives[id] || 0;
    const p = s.p;
    p.dmgMul = 1 + 0.12 * L("might");
    p.cdMul = Math.max(0.4, 1 - 0.08 * L("spellbook"));
    p.areaMul = 1 + 0.12 * L("crown");
    p.speed = p.baseSpeed * (1 + 0.08 * L("boots"));
    p.magnetR = 70 * (1 + 0.35 * L("magnet"));
    p.armor = L("plating");
    p.regen = 0.2 * L("heart");
    p.xpMul = 1 + 0.1 * L("clover");
    p.crit = 0.05 + 0.03 * L("clover");
    p.luck = L("clover");
    const maxHp = p.baseHp + 18 * L("heart");
    p.hp += maxHp - p.maxHp;
    p.maxHp = maxHp;
  }

  const emit = (s, ev) => {
    if (s.events.length < 300) s.events.push(ev);
  };
  const rnd = (s, a, b) => a + s.rng() * (b - a);
  const rint = (s, n) => Math.floor(s.rng() * n);

  // ------------------------------------------------------------------ spatial hash
  function buildGrid(s) {
    const g = s.grid;
    g.head.fill(-1);
    const list = s.enemies;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      const h = (Math.imul(Math.floor(e.x / CELL), 73856093) ^ Math.imul(Math.floor(e.y / CELL), 19349663)) & (BUCKETS - 1);
      g.next[i] = g.head[h];
      g.head[h] = i;
    }
  }

  // fills `out` with living enemies whose circle touches the query circle. the stamp stops hash collisions
  // (two cells sharing a bucket) from listing the same enemy twice
  function collect(s, x, y, r, out) {
    out.length = 0;
    const g = s.grid;
    const stamp = ++s.stamp;
    const x1 = Math.floor((x + r) / CELL), y1 = Math.floor((y + r) / CELL);
    for (let cy = Math.floor((y - r) / CELL); cy <= y1; cy++) {
      for (let cx = Math.floor((x - r) / CELL); cx <= x1; cx++) {
        let i = g.head[(Math.imul(cx, 73856093) ^ Math.imul(cy, 19349663)) & (BUCKETS - 1)];
        while (i !== -1) {
          const e = s.enemies[i];
          if (e.stamp !== stamp && !e.dead) {
            e.stamp = stamp;
            const dx = e.x - x, dy = e.y - y, rr = r + e.r;
            if (dx * dx + dy * dy <= rr * rr) out.push(e);
          }
          i = g.next[i];
        }
      }
    }
    return out;
  }

  function nearest(s, x, y, maxR, skip) {
    let best = null, bd = maxR * maxR;
    for (const e of s.enemies) {
      if (e.dead || (skip && skip.includes(e))) continue;
      const dx = e.x - x, dy = e.y - y, d = dx * dx + dy * dy;
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  }

  // ------------------------------------------------------------------ enemies
  function spawnEnemy(s, type, x, y, extra) {
    const def = ENEMIES[type];
    if (s.enemies.length >= MAX_ENEMIES) return null;
    const hpMul = def.boss ? 1 : 1 + (s.t / 60) * 0.28;
    const e = {
      id: s.nextId++, type, def, x, y, r: def.r, hp: def.hp * hpMul, spd: def.spd * (def.boss ? 1 : 1 + s.t / 1800),
      dmg: Math.round(def.dmg * (def.boss ? 1 : 1 + (s.t / 600) * 0.5)), kx: 0, ky: 0, flash: 0, dead: false, stamp: 0,
      t: s.rng() * 6, shoot: 1 + s.rng() * 2, timers: {}, state: 0, dvx: 0, dvy: 0, slow: 0, elite: false, spin: 0,
    };
    if (extra) Object.assign(e, extra);
    e.maxHp = e.hp;
    s.enemies.push(e);
    return e;
  }

  function ringPos(s, r) {
    const a = s.rng() * TAU;
    return [s.p.x + Math.cos(a) * r, s.p.y + Math.sin(a) * r];
  }

  function pickType(s) {
    let total = 0;
    const w = [];
    for (const [id, from, weight] of POOL) {
      let v = s.t >= from ? weight : 0;
      if (id === "gnat") v *= Math.max(0.3, 1 - s.t / 900);
      w.push(v);
      total += v;
    }
    let r = s.rng() * total;
    for (let i = 0; i < POOL.length; i++) {
      r -= w[i];
      if (r <= 0) return POOL[i][0];
    }
    return "gnat";
  }

  function director(s, dt) {
    const n = s.enemies.length;
    const desired = Math.min(ENEMY_CAP, 12 + s.t * 0.6 + Math.pow(s.t / 60, 2) * 3);
    s.spawnAcc += Math.max(0, Math.min(30, (desired - n) * 0.7)) * dt;
    while (s.spawnAcc >= 1) {
      s.spawnAcc -= 1;
      const [x, y] = ringPos(s, SPAWN_R + rnd(s, 0, 60));
      spawnEnemy(s, pickType(s), x, y);
    }
    if (s.ringIdx < RINGS.length && s.t >= RINGS[s.ringIdx]) {
      const type = s.t > 200 ? "bat" : "gnat";
      for (let i = 0; i < 36; i++) {
        const a = (i / 36) * TAU;
        spawnEnemy(s, type, s.p.x + Math.cos(a) * SPAWN_R, s.p.y + Math.sin(a) * SPAWN_R);
      }
      s.ringIdx++;
      emit(s, { t: "swarm" });
    }
    if (s.eliteIdx < ELITES.length && s.t >= ELITES[s.eliteIdx]) {
      const [x, y] = ringPos(s, SPAWN_R);
      const e = spawnEnemy(s, "brute", x, y, { elite: true, r: 20 });
      if (e) { e.hp = e.maxHp = 260 + s.t * 1.4; e.dmg += 6; }
      s.eliteIdx++;
      emit(s, { t: "elite" });
    }
    if (s.bossIdx < BOSSES.length && s.t >= BOSSES[s.bossIdx].at) {
      const [x, y] = ringPos(s, SPAWN_R);
      const b = spawnEnemy(s, BOSSES[s.bossIdx].type, x, y);
      if (b) { s.boss = b; emit(s, { t: "boss", name: b.def.name, final: !!b.def.final }); }
      s.bossIdx++;
    }
  }

  function hurtEnemy(s, e, dmg, fromX, fromY, kb) {
    if (e.dead) return;
    let crit = false;
    if (s.rng() < s.p.crit) { dmg *= 2; crit = true; }
    e.hp -= dmg;
    e.flash = 0.08;
    s.hits++;
    if (kb && !e.def.boss) {
      const dx = e.x - fromX, dy = e.y - fromY, d = Math.hypot(dx, dy) || 1;
      e.kx += (dx / d) * kb;
      e.ky += (dy / d) * kb;
    }
    emit(s, { t: "hit", x: e.x, y: e.y, dmg: Math.round(dmg), crit });
    if (e.hp <= 0) killEnemy(s, e);
  }

  function dropGem(s, x, y, v) {
    if (s.gems.length > 380) {
      // too many on the floor: fold this one into an old one so the run stays cheap
      s.gems[rint(s, s.gems.length)].v += v;
      return;
    }
    s.gems.push({ x: x + rnd(s, -4, 4), y: y + rnd(s, -4, 4), v, pull: false });
  }

  function killEnemy(s, e) {
    if (e.dead) return;
    e.dead = true;
    s.kills++;
    emit(s, { t: "kill", x: e.x, y: e.y, big: !!e.def.boss || e.elite });
    dropGem(s, e.x, e.y, e.elite ? 40 : e.def.xp);
    if (e.def.split) for (let i = 0; i < 2; i++) spawnEnemy(s, e.def.split, e.x + rnd(s, -8, 8), e.y + rnd(s, -8, 8));
    if (e.def.boss || e.elite) {
      s.pickups.push({ kind: "chest", x: e.x, y: e.y });
      if (e.def.boss) for (let i = 0; i < 12; i++) dropGem(s, e.x + rnd(s, -40, 40), e.y + rnd(s, -40, 40), 10);
    } else {
      const r = s.rng();
      if (r < 0.012) s.pickups.push({ kind: "heart", x: e.x, y: e.y });
      else if (r < 0.0165) s.pickups.push({ kind: "magnet", x: e.x, y: e.y });
      else if (r < 0.0185) s.pickups.push({ kind: "bomb", x: e.x, y: e.y });
    }
    if (e === s.boss) s.boss = null;
    if (e.def.final) {
      s.won = true;
      s.phase = "won";
      // the king's last gasp takes the rest of the horde with it
      for (const o of s.enemies) if (!o.dead && o !== e) { o.dead = true; s.kills++; }
      s.eshots.length = 0;
    }
  }

  function fireEshot(s, x, y, ang, spd, dmg) {
    if (s.eshots.length > 260) return;
    s.eshots.push({ x, y, vx: Math.cos(ang) * spd, vy: Math.sin(ang) * spd, dmg, life: 6, r: 5 });
  }

  // boss moves run off timers kept on the boss itself
  function bossMoves(s, e, dt, dx, dy, d) {
    for (const m of e.def.moves) {
      const tm = (e.timers[m] = (e.timers[m] ?? 2.5) - dt);
      if (m === "charge") {
        if (e.state === 0 && tm <= 0) { e.state = 1; e.timers.wind = 0.6; emit(s, { t: "windup", x: e.x, y: e.y }); }
        if (e.state === 1 && (e.timers.wind -= dt) <= 0) {
          e.state = 2; e.timers.dash = 0.75; e.dvx = (dx / d) * 360; e.dvy = (dy / d) * 360;
        }
        if (e.state === 2 && (e.timers.dash -= dt) <= 0) { e.state = 0; e.timers.charge = 4.5; }
      } else if (tm <= 0) {
        if (m === "ring") {
          const n = e.def.final ? 18 : 12, off = s.rng() * TAU;
          for (let i = 0; i < n; i++) fireEshot(s, e.x, e.y, off + (i / n) * TAU, 130, 8);
          e.timers.ring = e.def.final ? 5 : 3.2;
        } else if (m === "aim") {
          const a = Math.atan2(dy, dx);
          for (let i = -1; i <= 1; i++) fireEshot(s, e.x, e.y, a + i * 0.22, 190, 9);
          e.timers.aim = 1.6;
        } else if (m === "summon") {
          for (let i = 0; i < 8; i++) spawnEnemy(s, "bat", e.x + rnd(s, -30, 30), e.y + rnd(s, -30, 30));
          e.timers.summon = 6;
        } else if (m === "spiral") {
          e.spin += 0.45;
          fireEshot(s, e.x, e.y, e.spin, 150, 7);
          fireEshot(s, e.x, e.y, e.spin + Math.PI, 150, 7);
          e.timers.spiral = 0.12;
        }
      }
    }
  }

  function updateEnemies(s, dt) {
    const p = s.p, list = s.enemies, decay = Math.exp(-8 * dt);
    const out = s.near2;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead) continue;
      e.t += dt;
      if (e.flash > 0) e.flash -= dt;
      if (e.slow > 0) e.slow -= dt;
      let dx = p.x - e.x, dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      if (d > FAR_R && !e.def.boss) { const [x, y] = ringPos(s, SPAWN_R); e.x = x; e.y = y; continue; }
      let mx = dx / d, my = dy / d;
      let sp = e.spd * (e.slow > 0 ? 0.5 : 1);
      if (e.def.ranged) {
        if (d < 140) { mx = -mx; my = -my; }
        else if (d < 190) { const tx = mx; mx = -my * 0.6; my = tx * 0.6; }
        if ((e.shoot -= dt) <= 0) { fireEshot(s, e.x, e.y, Math.atan2(dy, dx), 170, e.dmg); e.shoot = 2.3; }
      }
      if (e.def.wobble) { const w = Math.sin(e.t * 4 + e.id) * 0.7; const tx = mx; mx += -my * w; my += tx * w; }
      if (e.def.boss) {
        bossMoves(s, e, dt, dx, dy, d);
        if (e.state === 1) sp = 0;
        if (e.state === 2) { mx = e.dvx / 360; my = e.dvy / 360; sp = 360; }
      }
      e.x += (mx * sp + e.kx) * dt;
      e.y += (my * sp + e.ky) * dt;
      e.kx *= decay;
      e.ky *= decay;
      // soft separation so a horde spreads out instead of stacking into one dot. half the enemies per tick
      if (!e.def.boss && ((i + s.tick) & 1) === 0) {
        const near = collect(s, e.x, e.y, 2, out);
        for (let k = 0; k < near.length && k < 6; k++) {
          const o = near[k];
          if (o === e) continue;
          const ox = e.x - o.x, oy = e.y - o.y, od = Math.hypot(ox, oy) || 0.01, min = (e.r + o.r) * 0.85;
          if (od < min) { const push = (min - od) * 0.5; e.x += (ox / od) * push; e.y += (oy / od) * push; }
        }
      }
    }
  }

  // ------------------------------------------------------------------ weapons
  function hitAll(s, x, y, r, dmg, kb, stunSlow) {
    const found = collect(s, x, y, r, s.near);
    for (let i = 0; i < found.length; i++) {
      if (stunSlow) found[i].slow = 1.5;
      hurtEnemy(s, found[i], dmg, x, y, kb);
    }
    return found.length;
  }

  function fireWeapon(s, w) {
    const def = WEAPONS[w.id], p = s.p, st = weaponStats(w.id, w.level);
    const dmg = st.dmg * p.dmgMul;
    const area = st.area * p.areaMul;
    emit(s, { t: "shoot", kind: def.kind });
    if (def.kind === "bolt") {
      const first = nearest(s, p.x, p.y, 420);
      const used = [];
      for (let i = 0; i < st.n; i++) {
        const target = (i === 0 ? first : nearest(s, p.x, p.y, 420, used)) || first;
        if (target) used.push(target);
        let a = target ? Math.atan2(target.y - p.y, target.x - p.x) : Math.atan2(p.fy, p.fx);
        if (!target || target === first && i > 0) a += (i - (st.n - 1) / 2) * 0.18;
        else if (st.n > 3) a += (i - (st.n - 1) / 2) * 0.12;
        s.shots.push({ kind: "bolt", x: p.x, y: p.y, vx: Math.cos(a) * st.spd, vy: Math.sin(a) * st.spd, r: area, dmg, pierce: st.pierce, life: st.life, hit: [], color: def.color, w: w.id });
      }
    } else if (def.kind === "knife") {
      const base = Math.atan2(p.fy, p.fx);
      for (let i = 0; i < st.n; i++) {
        const a = def.ring ? base + (i / st.n) * TAU : base + (i - (st.n - 1) / 2) * 0.16;
        s.shots.push({ kind: "knife", x: p.x, y: p.y, vx: Math.cos(a) * st.spd, vy: Math.sin(a) * st.spd, r: area, dmg, pierce: st.pierce, life: st.life, hit: [], color: def.color, ang: a });
      }
    } else if (def.kind === "orbit") {
      const off = s.rng() * TAU;
      for (let i = 0; i < st.n; i++) {
        s.shots.push({ kind: "orbit", x: p.x, y: p.y, a: off + (i / st.n) * TAU, rad: area, spin: st.spd, r: 9 + (w.level > 2 ? 3 : 0), dmg, life: st.life, hit: [], tick: 0.4, color: def.color });
      }
    } else if (def.kind === "boomer") {
      const base = Math.atan2(p.fy, p.fx) + (nearest(s, p.x, p.y, 400) ? 0 : 0);
      const target = nearest(s, p.x, p.y, 400);
      const a0 = target ? Math.atan2(target.y - p.y, target.x - p.x) : base;
      for (let i = 0; i < st.n; i++) {
        const a = a0 + (i - (st.n - 1) / 2) * (st.n > 2 ? 0.7 : 0.5);
        s.shots.push({ kind: "boomer", x: p.x, y: p.y, vx: Math.cos(a) * st.spd, vy: Math.sin(a) * st.spd, spd: st.spd, r: area, dmg, life: st.life, max: st.life, hit: [], tick: 0.35, color: def.color, ang: 0 });
      }
    } else if (def.kind === "bomb") {
      for (let i = 0; i < st.n; i++) {
        const t = s.enemies.length ? s.enemies[rint(s, s.enemies.length)] : null;
        const tx = t && !t.dead ? t.x : p.x + rnd(s, -120, 120), ty = t && !t.dead ? t.y : p.y + rnd(s, -120, 120);
        const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1, fuse = Math.min(st.life, d / st.spd + 0.1);
        s.shots.push({ kind: "bomb", x: p.x, y: p.y, vx: (dx / d) * (d / fuse), vy: (dy / d) * (d / fuse), life: fuse, area, dmg, color: def.color });
      }
    } else if (def.kind === "whip") {
      const side = p.fx < 0 ? -1 : 1;
      const sides = st.n >= 2 ? [side, -side] : [side];
      for (const sd of sides) {
        const cx = p.x + sd * area * 0.5, found = collect(s, cx, p.y, area * 0.55, s.near);
        // a long flat box: keep only what's actually in the lash row
        for (const e of found.slice()) if (Math.abs(e.y - p.y) < 26 + e.r && (e.x - p.x) * sd > -10) { hurtEnemy(s, e, dmg, p.x, p.y, 5); if (def.leech && s.hits % 3 === 0) p.hp = Math.min(p.maxHp, p.hp + 1); }
        emit(s, { t: "whip", x: p.x, y: p.y, side: sd, reach: area, color: def.color });
      }
    } else if (def.kind === "aura") {
      hitAll(s, p.x, p.y, area, dmg, 8, def.slow);
      emit(s, { t: "aura", x: p.x, y: p.y, r: area, color: def.color });
    } else if (def.kind === "zap") {
      const cands = collect(s, p.x, p.y, 280, s.near).slice();
      for (let i = 0; i < st.n && cands.length; i++) {
        const e = cands.splice(rint(s, cands.length), 1)[0];
        emit(s, { t: "zap", x: e.x, y: e.y, px: p.x, py: p.y, color: def.color });
        hitAll(s, e.x, e.y, area, dmg, 3);
      }
    }
  }

  function updateWeapons(s, dt) {
    for (const w of s.weapons) {
      w.timer -= dt;
      if (w.timer <= 0) {
        fireWeapon(s, w);
        w.timer = Math.max(0.12, weaponStats(w.id, w.level).cd * s.p.cdMul);
      }
    }
  }

  function updateShots(s, dt) {
    const p = s.p;
    for (const sh of s.shots) {
      sh.life -= dt;
      if (sh.kind === "bolt" || sh.kind === "knife") {
        sh.x += sh.vx * dt;
        sh.y += sh.vy * dt;
        const found = collect(s, sh.x, sh.y, sh.r, s.near);
        for (const e of found) {
          if (sh.hit.includes(e.id)) continue;
          sh.hit.push(e.id);
          hurtEnemy(s, e, sh.dmg, sh.x - sh.vx, sh.y - sh.vy, 4);
          if (--sh.pierce <= 0) { sh.life = 0; break; }
        }
      } else if (sh.kind === "orbit") {
        sh.a += sh.spin * dt;
        sh.x = p.x + Math.cos(sh.a) * sh.rad;
        sh.y = p.y + Math.sin(sh.a) * sh.rad;
        if ((sh.tick -= dt) <= 0) { sh.tick = 0.4; sh.hit.length = 0; }
        for (const e of collect(s, sh.x, sh.y, sh.r, s.near)) {
          if (sh.hit.includes(e.id)) continue;
          sh.hit.push(e.id);
          hurtEnemy(s, e, sh.dmg, p.x, p.y, 7);
        }
      } else if (sh.kind === "boomer") {
        sh.ang += dt * 14;
        if (sh.life < sh.max * 0.5) {
          // coming home: steer at the player, die when caught
          const dx = p.x - sh.x, dy = p.y - sh.y, d = Math.hypot(dx, dy) || 1;
          sh.vx = (dx / d) * sh.spd * 1.15;
          sh.vy = (dy / d) * sh.spd * 1.15;
          if (d < 14) sh.life = 0;
        }
        sh.x += sh.vx * dt;
        sh.y += sh.vy * dt;
        if ((sh.tick -= dt) <= 0) { sh.tick = 0.35; sh.hit.length = 0; }
        for (const e of collect(s, sh.x, sh.y, sh.r, s.near)) {
          if (sh.hit.includes(e.id)) continue;
          sh.hit.push(e.id);
          hurtEnemy(s, e, sh.dmg, sh.x, sh.y, 5);
        }
      } else if (sh.kind === "bomb") {
        sh.x += sh.vx * dt;
        sh.y += sh.vy * dt;
        if (sh.life <= 0) {
          hitAll(s, sh.x, sh.y, sh.area, sh.dmg, 12);
          emit(s, { t: "explode", x: sh.x, y: sh.y, r: sh.area, color: sh.color });
        }
      }
    }
    s.shots = s.shots.filter((sh) => sh.life > 0);
  }

  function hurtPlayer(s, dmg) {
    const p = s.p;
    if (p.iframes > 0 || s.phase !== "play") return;
    p.hp -= Math.max(1, dmg - p.armor);
    p.iframes = 0.6;
    emit(s, { t: "hurt" });
    if (p.hp <= 0) { p.hp = 0; s.phase = "dead"; emit(s, { t: "dead" }); }
  }

  function updateEshots(s, dt) {
    const p = s.p;
    for (const b of s.eshots) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      const dx = b.x - p.x, dy = b.y - p.y, rr = b.r + p.r;
      if (dx * dx + dy * dy < rr * rr) { hurtPlayer(s, b.dmg); b.life = 0; }
    }
    s.eshots = s.eshots.filter((b) => b.life > 0);
  }

  // ------------------------------------------------------------------ pickups, xp, levels
  function grantXp(s, v) {
    s.xp += v * s.p.xpMul;
    while (s.xp >= s.xpNext) {
      s.xp -= s.xpNext;
      s.level++;
      s.pending++;
      s.xpNext = xpFor(s.level);
    }
  }

  function updateLoot(s, dt) {
    const p = s.p;
    for (const g of s.gems) {
      const dx = p.x - g.x, dy = p.y - g.y, d = Math.hypot(dx, dy) || 1;
      if (g.pull || d < p.magnetR) {
        g.pull = true;
        const sp = 280 + (400 - Math.min(400, d)) * 0.5;
        g.x += (dx / d) * sp * dt;
        g.y += (dy / d) * sp * dt;
      }
      if (d < p.r + 6) { g.dead = true; grantXp(s, g.v); emit(s, { t: "gem", v: g.v }); }
    }
    s.gems = s.gems.filter((g) => !g.dead);
    for (const k of s.pickups) {
      const dx = p.x - k.x, dy = p.y - k.y;
      if (dx * dx + dy * dy > 18 * 18) continue;
      k.dead = true;
      if (k.kind === "heart") { p.hp = Math.min(p.maxHp, p.hp + 30); emit(s, { t: "heal" }); }
      else if (k.kind === "magnet") { for (const g of s.gems) g.pull = true; emit(s, { t: "magnet" }); }
      else if (k.kind === "bomb") {
        // screen-wide blast: everything near the player takes a hit, bosses a smaller one
        for (const e of s.enemies) {
          if (e.dead || Math.abs(e.x - p.x) > 420 || Math.abs(e.y - p.y) > 260) continue;
          hurtEnemy(s, e, e.def.boss ? 120 : 400, p.x, p.y, 0);
        }
        emit(s, { t: "nuke" });
      } else if (k.kind === "chest") openChest(s);
    }
    s.pickups = s.pickups.filter((k) => !k.dead);
  }

  // chest: evolve everything that's ready, otherwise bump two random things up a level
  function openChest(s) {
    const got = [];
    for (const w of s.weapons) {
      const def = WEAPONS[w.id];
      if (def.evolved && w.level >= MAX_LEVEL && s.passives[def.evolvesWith] > 0) {
        w.id = def.evolved;
        w.level = 1;
        got.push(WEAPONS[w.id].name);
      }
    }
    if (!got.length) {
      for (let i = 0; i < 2; i++) {
        const opts = s.weapons.filter((w) => WEAPONS[w.id].up.length && w.level < MAX_LEVEL);
        const pass = Object.keys(s.passives).filter((id) => s.passives[id] < MAX_LEVEL);
        if (!opts.length && !pass.length) break;
        if (opts.length && (!pass.length || s.rng() < 0.6)) { const w = opts[rint(s, opts.length)]; w.level++; got.push(WEAPONS[w.id].name + " up"); }
        else { const id = pass[rint(s, pass.length)]; s.passives[id]++; got.push(PASSIVES[id].name + " up"); }
      }
      if (!got.length) { s.bonus += 500; got.push("+500 points"); }
      recompute(s);
    } else recompute(s);
    emit(s, { t: "chest", got });
  }

  function makeChoices(s) {
    const pool = [];
    const weaponsFull = s.weapons.length >= MAX_SLOTS;
    for (const w of s.weapons) {
      const def = WEAPONS[w.id];
      if (def.up.length && w.level < MAX_LEVEL) pool.push({ kind: "weapon", id: w.id, level: w.level + 1, text: deltaText(def.up[w.level - 1]) });
    }
    if (!weaponsFull) for (const id of WEAPON_IDS) if (!s.weapons.some((w) => w.id === id || WEAPONS[w.id].evolved === id)) pool.push({ kind: "weapon", id, level: 1, isNew: true, text: WEAPONS[id].desc });
    const have = Object.keys(s.passives);
    for (const id of have) if (s.passives[id] < MAX_LEVEL) pool.push({ kind: "passive", id, level: s.passives[id] + 1, text: PASSIVES[id].desc });
    if (have.length < MAX_SLOTS) for (const id of PASSIVE_IDS) if (!s.passives[id]) pool.push({ kind: "passive", id, level: 1, isNew: true, text: PASSIVES[id].desc });
    const picks = [];
    const count = s.p.luck >= 3 ? 4 : 3;
    while (picks.length < count && pool.length) picks.push(pool.splice(rint(s, pool.length), 1)[0]);
    if (!picks.length) picks.push({ kind: "heal", id: "heal", level: 0, text: "Restore 40 HP." }, { kind: "bonus", id: "bonus", level: 0, text: "+300 score." });
    return picks;
  }

  function choose(s, i) {
    if (s.phase !== "levelup") return false;
    const c = s.choices[i];
    if (!c) return false;
    if (c.kind === "weapon") {
      const w = s.weapons.find((x) => x.id === c.id);
      if (w) w.level++;
      else addWeapon(s, c.id);
    } else if (c.kind === "passive") s.passives[c.id] = (s.passives[c.id] || 0) + 1;
    else if (c.kind === "heal") s.p.hp = Math.min(s.p.maxHp, s.p.hp + 40);
    else if (c.kind === "bonus") s.bonus += 300;
    recompute(s);
    s.pending--;
    if (s.pending > 0) s.choices = makeChoices(s);
    else { s.choices = []; s.phase = "play"; }
    return true;
  }

  // ------------------------------------------------------------------ main step
  function step(s, dt, input) {
    if (s.phase !== "play") return;
    const p = s.p;
    s.t += dt;
    s.tick++;
    let ix = (input && input.x) || 0, iy = (input && input.y) || 0;
    const len = Math.hypot(ix, iy);
    if (len > 1) { ix /= len; iy /= len; }
    p.moving = len > 0.05;
    if (p.moving) { p.x += ix * p.speed * dt; p.y += iy * p.speed * dt; const l = Math.hypot(ix, iy); p.fx = ix / l; p.fy = iy / l; }
    if (p.iframes > 0) p.iframes -= dt;
    if (p.regen) p.hp = Math.min(p.maxHp, p.hp + p.regen * dt);

    buildGrid(s);
    director(s, dt);
    updateWeapons(s, dt);
    updateShots(s, dt);
    buildGrid(s); // the director and splits added enemies
    updateEnemies(s, dt);

    // touching an enemy hurts. the iframes keep a pile-up from deleting you in one frame
    if (p.iframes <= 0) {
      const touching = collect(s, p.x, p.y, p.r, s.near);
      let worst = 0;
      for (const e of touching) worst = Math.max(worst, e.dmg);
      if (worst) hurtPlayer(s, worst);
    }
    updateEshots(s, dt);
    updateLoot(s, dt);

    if (s.enemies.some((e) => e.dead)) s.enemies = s.enemies.filter((e) => !e.dead);
    if (s.phase === "play" && s.pending > 0) {
      s.choices = makeChoices(s);
      s.phase = "levelup";
      emit(s, { t: "levelup", level: s.level });
    }
  }

  // survival time counts most early on, kills keep it honest, and finishing the king is worth a lot
  function score(s) {
    return Math.floor(s.t) * 10 + s.kills * 5 + (s.level - 1) * 40 + s.bonus + (s.won ? 10000 + Math.max(0, 900 - s.t) * 20 : 0);
  }

  return {
    CELL, MAX_ENEMIES, ENEMY_CAP, MAX_LEVEL, MAX_SLOTS, FINAL_AT, ENEMIES, WEAPONS, PASSIVES, START, BOSSES, POOL,
    create, step, choose, score, xpFor, weaponStats, openChest, makeChoices, spawnEnemy, killEnemy, grantXp, recompute,
    addWeapon, collect, buildGrid, mulberry,
  };
});

// ====================================================================== the cabinet (browser only)
(function () {
  if (typeof window === "undefined" || !window.ArcadeGames || !window.SurvivorsSim) return;
  const Sim = window.SurvivorsSim;
  const W = 800;
  const H = 480;
  const BASE = "client/games/survivors/";
  const SHEETS = "assets/avatar/animations/";
  const ENEMY_ORDER = ["gnat", "shambler", "bat", "slime", "blob", "archer", "ghost", "brute"];
  const BOSS_ORDER = ["boss1", "boss2", "boss3", "boss4"];
  const fmtTime = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t) % 60).padStart(2, "0")}`;

  const loadImg = (src) => {
    const img = new Image();
    img.src = src;
    return img;
  };
  // white copy of a sheet, used for the hit flash (drawing it over the sprite is much cheaper than filters)
  function whiten(img) {
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    const x = c.getContext("2d");
    x.drawImage(img, 0, 0);
    x.globalCompositeOperation = "source-in";
    x.fillStyle = "#fff";
    x.fillRect(0, 0, c.width, c.height);
    return c;
  }

  // ---------------------------------------------------------------- generated sound (nothing to download)
  function makeAudio() {
    let ac = null, master = null, muted = false, timer = 0, step = 0, intensity = 0;
    const last = {};
    const api = {
      get muted() { return muted; },
      init() {
        if (ac) { if (ac.state === "suspended") ac.resume(); return; }
        const A = window.AudioContext || window.webkitAudioContext;
        if (!A) return;
        ac = new A();
        master = ac.createGain();
        master.gain.value = muted ? 0 : 0.5;
        master.connect(ac.destination);
      },
      toggle() {
        muted = !muted;
        if (master) master.gain.value = muted ? 0 : 0.5;
        return muted;
      },
      tone(freq, dur, type = "square", vol = 0.12, slide = 0, at = 0) {
        if (!ac) return;
        const t = ac.currentTime + at;
        const o = ac.createOscillator(), gn = ac.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
        gn.gain.setValueAtTime(vol, t);
        gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(gn).connect(master);
        o.start(t);
        o.stop(t + dur + 0.02);
      },
      noise(dur, vol = 0.1, at = 0) {
        if (!ac) return;
        const t = ac.currentTime + at;
        const buf = ac.createBuffer(1, Math.max(1, Math.floor(ac.sampleRate * dur)), ac.sampleRate);
        const d = buf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
        const src = ac.createBufferSource(), gn = ac.createGain();
        src.buffer = buf;
        gn.gain.value = vol;
        src.connect(gn).connect(master);
        src.start(t);
      },
      // gap stops a 600 enemy fight from turning the speakers into a wall of clicks
      sfx(name, gap = 0.05, arg = 0) {
        if (!ac || muted) return;
        const now = performance.now() / 1000;
        if (now - (last[name] || 0) < gap) return;
        last[name] = now;
        const seq = (freqs, dur, type, vol, step) => freqs.forEach((f, i) => api.tone(f, dur, type, vol, 0, i * step));
        if (name === "shoot") api.tone(660 + Math.random() * 120, 0.07, "square", 0.04, -300);
        else if (name === "hit") api.tone(180 + Math.random() * 60, 0.05, "triangle", 0.07, -80);
        else if (name === "kill") api.noise(0.06, 0.05);
        else if (name === "gem") api.tone(800 + Math.min(12, arg) * 90, 0.06, "sine", 0.06);
        else if (name === "hurt") { api.noise(0.2, 0.18); api.tone(140, 0.2, "sawtooth", 0.12, -90); }
        else if (name === "level") seq([523, 659, 784, 1046], 0.16, "square", 0.08, 0.07);
        else if (name === "chest") seq([392, 523, 659, 784, 1046, 1318], 0.2, "triangle", 0.1, 0.06);
        else if (name === "boom") { api.noise(0.35, 0.2); api.tone(90, 0.3, "sawtooth", 0.15, -50); }
        else if (name === "zap") api.tone(1200, 0.12, "sawtooth", 0.06, -900);
        else if (name === "boss") { api.tone(110, 0.6, "sawtooth", 0.16, -30); api.tone(104, 0.6, "sawtooth", 0.16, -30, 0.3); }
        else if (name === "heal") seq([660, 880], 0.12, "sine", 0.1, 0.08);
        else if (name === "die") seq([330, 262, 196, 131], 0.3, "sawtooth", 0.12, 0.18);
        else if (name === "win") seq([523, 659, 784, 1046, 784, 1046, 1318], 0.22, "square", 0.09, 0.12);
      },
      // simple minor-key loop: bass every other step, arp on top, hats once things get busy
      music(on, heat = 0) {
        clearInterval(timer);
        intensity = heat;
        if (!on || !ac) return;
        let next = ac.currentTime + 0.1;
        const bass = [0, 0, 3, 0, 5, 3, 7, 5];
        const arp = [0, 3, 7, 12, 7, 3, 10, 7];
        const roots = [0, -2, 3, -4];
        timer = setInterval(() => {
          if (muted) { next = ac.currentTime + 0.1; return; }
          while (next < ac.currentTime + 0.4) {
            const at = next - ac.currentTime, i = step % 8;
            const root = 55 * Math.pow(2, roots[Math.floor(step / 8) % 4] / 12);
            if (i % 2 === 0) api.tone(root * Math.pow(2, bass[i] / 12), 0.2, "triangle", 0.1, 0, at);
            api.tone(root * 4 * Math.pow(2, arp[i] / 12), 0.1, "square", 0.025 + intensity * 0.01, 0, at);
            if (intensity > 0 && i % 2 === 1) api.noise(0.03, 0.025, at);
            step++;
            next += intensity > 1 ? 0.17 : 0.2;
          }
        }, 100);
      },
      setHeat(h) { intensity = h; },
      destroy() { clearInterval(timer); if (ac) ac.close().catch(() => {}); ac = null; },
    };
    return api;
  }

  // ---------------------------------------------------------------- the player's Being (body sheet, walk row)
  let manifestP = null;
  function loadAvatar(avatar) {
    const out = { layers: [] };
    manifestP = manifestP || fetch(SHEETS + "manifest.json").then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
    manifestP.then((manifest) => {
      const names = [];
      const base = (v) => (typeof v === "string" ? decodeURIComponent(v.split(/[?#]/)[0].split("/").pop()) : "");
      if (avatar?.bodyAsset) names.push(base(avatar.bodyAsset));
      else if (avatar?.species === "Thixie") names.push("thixie_body_v1.png", "thixie_head_v1.png");
      for (const k of ["ears", "chest", "hair", "eyes", "fit", "extra"]) names.push(base(avatar?.layers?.[k]));
      for (const name of names) {
        if (!name || !manifest[name]) continue;
        const img = loadImg(SHEETS + encodeURIComponent(name));
        // pushed up front so layers keep their stacking order, drawn once their image is in
        const layer = { img, w: manifest[name].width, h: manifest[name].height, ok: false };
        img.onload = () => { layer.ok = true; };
        out.layers.push(layer);
      }
    });
    return out;
  }

  // ---------------------------------------------------------------- the game
  function mount(host, ctx) {
    host.replaceChildren();
    const root = document.createElement("div");
    root.className = "sv-root";
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.className = "sv-canvas";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Pixie Survivors: your Being fights off a growing horde. Move with WASD or the arrow keys, weapons fire on their own.");
    const overlay = document.createElement("div");
    overlay.className = "sv-overlay";
    root.append(canvas, overlay);
    host.append(root);
    const g = canvas.getContext("2d");
    g.imageSmoothingEnabled = false;

    const audio = makeAudio();
    const sheetE = loadImg(BASE + "enemies.png");
    const sheetB = loadImg(BASE + "bosses.png");
    const sheetS = loadImg(BASE + "shots.png");
    let whiteE = null, whiteB = null;
    sheetE.onload = () => { whiteE = whiten(sheetE); };
    sheetB.onload = () => { whiteB = whiten(sheetB); };
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    const me = ctx.me();
    const races = window.BrawlRaces;
    const race = races ? races.raceOf(me?.avatar) : "pixie";
    const raceInfo = races?.RACES?.[race] || { name: "Pixie", hp: 100, speed: 1 };
    const avatar = loadAvatar(me?.avatar);

    let sim = null, mode = "menu", raf = 0, last = 0, acc = 0, lb = null;
    let fx = [], parts = [], texts = [], shake = 0, flash = 0, hurtFlash = 0, banner = null, toast = null, gemChain = 0, gemAt = 0, nukeFlash = 0;
    const keys = new Set();
    let stick = null;

    // ---- input
    const MOVE = { w: [0, -1], arrowup: [0, -1], s: [0, 1], arrowdown: [0, 1], a: [-1, 0], arrowleft: [-1, 0], d: [1, 0], arrowright: [1, 0] };
    function input() {
      let x = 0, y = 0;
      for (const k of keys) if (MOVE[k]) { x += MOVE[k][0]; y += MOVE[k][1]; }
      if (stick) { x += stick.dx; y += stick.dy; }
      return { x, y };
    }
    function onKey(e) {
      if (!host.isConnected) return;
      const k = e.key.toLowerCase();
      if (e.type === "keyup") { keys.delete(k); return; }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (MOVE[k] && mode === "play") e.preventDefault();
      if (MOVE[k]) keys.add(k);
      if (k === "m") { audio.init(); audio.toggle(); }
      else if ((k === "p" || k === "escape") && (mode === "play" || mode === "pause")) { e.preventDefault(); setPause(mode === "play"); }
      else if (mode === "cards" && /^[1-4]$/.test(k)) pickCard(Number(k) - 1);
    }
    function pointer(e) {
      if (mode !== "play") return;
      const r = canvas.getBoundingClientRect();
      const x = ((e.clientX - r.left) / r.width) * W, y = ((e.clientY - r.top) / r.height) * H;
      if (e.type === "pointerdown") { stick = { id: e.pointerId, ox: x, oy: y, x, y, dx: 0, dy: 0 }; canvas.setPointerCapture?.(e.pointerId); }
      else if (stick && stick.id === e.pointerId) {
        if (e.type === "pointermove") {
          stick.x = x; stick.y = y;
          stick.dx = Math.max(-1, Math.min(1, (x - stick.ox) / 45));
          stick.dy = Math.max(-1, Math.min(1, (y - stick.oy) / 45));
        } else stick = null;
      }
    }
    const auto = () => { if (document.hidden && mode === "play") setPause(true); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", auto);
    document.addEventListener("visibilitychange", auto);
    for (const t of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) canvas.addEventListener(t, pointer);
    canvas.style.touchAction = "none";

    // ---- overlay screens
    const el = (tag, cls, text) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    };
    const btn = (label, fn, cls = "") => {
      const b = el("button", "sv-btn " + cls, label);
      b.type = "button";
      b.addEventListener("click", fn);
      return b;
    };
    function screen(...nodes) {
      overlay.replaceChildren(...nodes);
      overlay.classList.toggle("on", nodes.length > 0);
      overlay.querySelector("button")?.focus({ preventScroll: true });
    }
    function menu() {
      mode = "menu";
      audio.music(false);
      const start = Sim.WEAPONS[Sim.START[race]?.weapon || "sparkle"];
      const card = el("div", "sv-panel");
      const board = el("div", "sv-board");
      card.append(
        el("h2", "sv-title", "Pixie Survivors"),
        el("p", "sv-sub", `${raceInfo.name} starts with ${start.name}. Weapons fire on their own. Live for 11 minutes, then take down the Static King.`),
        el("p", "sv-keys", "WASD / arrows or drag to move  -  P pause  -  M sound  -  1-4 pick cards"),
        btn("Start run", startRun, "primary"),
        btn("Back to games", () => ctx.close()),
        board,
      );
      screen(card);
      lb?.destroy();
      lb = ctx.leaderboard?.mountCanvas(board, "survivors", { width: 420, height: 250, me: me?.username, title: "SURVIVORS" }) || null;
    }
    function startRun() {
      audio.init();
      lb?.destroy();
      lb = null;
      sim = Sim.create({ race, hp: raceInfo.hp, speed: raceInfo.speed, seed: (Math.random() * 2 ** 32) >>> 0 });
      fx = []; parts = []; texts = []; shake = flash = hurtFlash = nukeFlash = 0; banner = toast = null; acc = 0; stick = null;
      mode = "play";
      screen();
      audio.music(true, 0);
    }
    function setPause(on) {
      if (on) {
        mode = "pause";
        audio.music(false);
        const panel = el("div", "sv-panel");
        panel.append(
          el("h2", "sv-title", "Paused"),
          btn("Resume", () => setPause(false), "primary"),
          btn(audio.muted ? "Sound: off" : "Sound: on", (e) => { audio.init(); e.target.textContent = audio.toggle() ? "Sound: off" : "Sound: on"; }),
          btn("Quit to menu", menu),
        );
        screen(panel);
      } else {
        mode = "play";
        last = performance.now();
        screen();
        audio.music(true, sim.t > 300 ? 1 : 0);
      }
    }
    function showCards() {
      mode = "cards";
      stick = null;
      const panel = el("div", "sv-panel wide");
      panel.append(el("h2", "sv-title", `Level ${sim.level}`));
      const row = el("div", "sv-cards");
      sim.choices.forEach((c, i) => {
        const def = c.kind === "weapon" ? Sim.WEAPONS[c.id] : c.kind === "passive" ? Sim.PASSIVES[c.id] : { name: c.kind === "heal" ? "Snack" : "Bonus", color: "#ffd54a" };
        const b = el("button", "sv-card");
        b.type = "button";
        b.style.setProperty("--c", def.color || "#ffd54a");
        b.append(el("span", "sv-key", String(i + 1)), el("strong", "", def.name), el("em", "", c.isNew ? "NEW" : c.level ? `Lv ${c.level}` : ""), el("small", "", c.text));
        b.addEventListener("click", () => pickCard(i));
        row.append(b);
      });
      panel.append(row);
      screen(panel);
    }
    function pickCard(i) {
      if (mode !== "cards" || !Sim.choose(sim, i)) return;
      audio.sfx("gem", 0, 8);
      if (sim.phase === "levelup") showCards();
      else { mode = "play"; last = performance.now(); screen(); }
    }
    function finish() {
      const won = sim.phase === "won";
      mode = "over";
      audio.music(false);
      audio.sfx(won ? "win" : "die", 0);
      const score = Sim.score(sim);
      const minutes = Math.round((sim.t / 60) * 10) / 10;
      const panel = el("div", "sv-panel");
      const status = el("p", "sv-sub", "Saving your score...");
      const board = el("div", "sv-board");
      panel.append(
        el("h2", "sv-title", won ? "The Static King falls!" : "You got swarmed"),
        el("p", "sv-big", score.toLocaleString() + " pts"),
        el("p", "sv-sub", `${fmtTime(sim.t)} survived  -  ${sim.kills} kills  -  level ${sim.level}`),
        status,
        btn("Run it back", startRun, "primary"),
        btn("Back to games", () => ctx.close()),
        board,
      );
      screen(panel);
      lb = ctx.leaderboard?.mountCanvas(board, "survivors", { width: 420, height: 250, me: me?.username, title: "SURVIVORS" }) || null;
      Promise.resolve(ctx.leaderboard?.submit("survivors", score, { race, minutes })).then((res) => {
        status.textContent = !res ? "Sign in to save scores on the board." : res.improved ? "New personal best!" : "Your best is still higher.";
        lb?.refresh();
      });
    }

    // ---- turning sim events into juice
    function burst(x, y, color, n, speed = 90, life = 0.5, size = 3) {
      for (let i = 0; i < n && parts.length < 450; i++) {
        const a = Math.random() * 6.283, v = speed * (0.3 + Math.random());
        parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: life * (0.6 + Math.random() * 0.6), max: life, color, size });
      }
    }
    function handle(ev) {
      switch (ev.t) {
        case "hit":
          if (texts.length < 70) texts.push({ x: ev.x + (Math.random() - 0.5) * 10, y: ev.y - 8, text: String(ev.dmg), life: 0.6, crit: ev.crit });
          audio.sfx("hit", 0.04);
          break;
        case "kill":
          burst(ev.x, ev.y, ev.big ? "#ffd54a" : "#d9c9ff", ev.big ? 40 : 5, ev.big ? 220 : 70, 0.5);
          audio.sfx("kill", 0.04);
          if (ev.big) { shake = Math.max(shake, 12); audio.sfx("boom", 0.2); }
          break;
        case "gem": {
          const now = performance.now();
          gemChain = now - gemAt < 350 ? gemChain + 1 : 0;
          gemAt = now;
          audio.sfx("gem", 0.03, gemChain);
          break;
        }
        case "shoot": audio.sfx("shoot", 0.08); break;
        case "hurt": shake = Math.max(shake, 9); hurtFlash = 0.35; audio.sfx("hurt", 0.1); break;
        case "whip": fx.push({ k: "whip", x: ev.x, y: ev.y, side: ev.side, reach: ev.reach, color: ev.color, t: 0, life: 0.18 }); break;
        case "aura": fx.push({ k: "ring", x: ev.x, y: ev.y, r: ev.r, color: ev.color, t: 0, life: 0.3 }); break;
        case "explode":
          fx.push({ k: "ring", x: ev.x, y: ev.y, r: ev.r, color: ev.color, t: 0, life: 0.35, fill: true });
          burst(ev.x, ev.y, ev.color, 14, 160, 0.5, 4);
          shake = Math.max(shake, 5);
          audio.sfx("boom", 0.1);
          break;
        case "zap": fx.push({ k: "zap", x: ev.x, y: ev.y, px: ev.px, py: ev.py, color: ev.color, t: 0, life: 0.2, seed: Math.random() * 99 }); audio.sfx("zap", 0.06); break;
        case "levelup": audio.sfx("level", 0); flash = 0.3; break;
        case "heal": audio.sfx("heal", 0); burst(sim.p.x, sim.p.y, "#ff6b81", 14, 80, 0.6); break;
        case "magnet": audio.sfx("heal", 0); toast = { text: "Magnet! Gems incoming", t: 2 }; break;
        case "nuke": nukeFlash = 0.4; shake = 14; audio.sfx("boom", 0); toast = { text: "Bomb!", t: 1.5 }; break;
        case "chest": audio.sfx("chest", 0); flash = 0.4; toast = { text: "Chest: " + ev.got.join(", "), t: 3.5 }; break;
        case "swarm": banner = { text: "A swarm closes in!", t: 2.5, color: "#ff9aa2" }; break;
        case "elite": banner = { text: "A big one hunts you", t: 2.5, color: "#ffd54a" }; break;
        case "boss": banner = { text: ev.final ? "THE STATIC KING" : ev.name, t: 3.5, color: "#ff5b5b" }; audio.sfx("boss", 0); audio.setHeat(2); break;
        case "windup": fx.push({ k: "ring", x: ev.x, y: ev.y, r: 36, color: "#ff5b5b", t: 0, life: 0.5 }); break;
        default: break;
      }
    }

    // ---- drawing
    let camX = 0, camY = 0;
    const sx = (x) => Math.round(x - camX), sy = (y) => Math.round(y - camY);
    const hash = (a, b) => (Math.imul(a, 374761393) ^ Math.imul(b, 668265263)) >>> 0;
    const dot = (x, y, r, c) => { g.fillStyle = c; g.beginPath(); g.arc(x, y, r, 0, 6.283); g.fill(); };

    function drawBackground() {
      const T = 64, x0 = Math.floor(camX / T), y0 = Math.floor(camY / T);
      for (let ty = y0; ty <= y0 + H / T + 1; ty++) {
        for (let tx = x0; tx <= x0 + W / T + 1; tx++) {
          const h = hash(tx, ty), px = tx * T - Math.round(camX), py = ty * T - Math.round(camY);
          g.fillStyle = (tx + ty) & 1 ? "#1e1337" : "#22163f";
          g.fillRect(px, py, T, T);
          const gx = px + ((h >> 3) % 50) + 4, gy = py + ((h >> 9) % 50) + 6;
          if ((h & 7) === 0) {
            g.fillStyle = "#2f5a4a";
            g.fillRect(gx, gy, 2, 5); g.fillRect(gx + 3, gy + 2, 2, 3); g.fillRect(gx - 3, gy + 1, 2, 4);
          } else if ((h & 31) === 1) {
            g.fillStyle = "#ff8ad4"; g.fillRect(gx, gy, 3, 3);
            g.fillStyle = "#ffe27a"; g.fillRect(gx + 1, gy + 1, 1, 1);
          }
        }
      }
    }

    function drawEnemy(e) {
      const x = sx(e.x), y = sy(e.y), boss = e.def.boss;
      if (x < -90 || x > W + 90 || y < -90 || y > H + 90) return;
      const size = boss ? e.r * 3.6 : e.def.r <= 6 ? 24 : e.def.r <= 10 ? 32 : 40;
      const sz = e.elite ? size * 1.5 : size;
      if (e.elite) dot(x, y, e.r + 6, "rgba(255,213,74,.25)");
      if (e.state === 1) dot(x, y, e.r + 10 + Math.sin(e.t * 30) * 3, "rgba(255,60,60,.3)");
      const bob = e.def.wobble || e.type === "gnat" ? Math.sin(e.t * 8 + e.id) * 2 : 0;
      const cell = boss ? 48 : 16;
      const idx = boss ? BOSS_ORDER.indexOf(e.type) : ENEMY_ORDER.indexOf(e.type);
      const flip = e.x > sim.p.x; // sprites face left, mirror them when the player is to their left
      const dx = Math.round(x - sz / 2), dy = Math.round(y - sz / 2 + bob);
      if (!flip) { g.save(); g.translate(x, 0); g.scale(-1, 1); g.translate(-x, 0); }
      g.drawImage(boss ? sheetB : sheetE, idx * cell, 0, cell, cell, dx, dy, sz, sz);
      const w = boss ? whiteB : whiteE;
      if (e.flash > 0 && w) { g.globalAlpha = 0.85; g.drawImage(w, idx * cell, 0, cell, cell, dx, dy, sz, sz); g.globalAlpha = 1; }
      if (!flip) g.restore();
      if (!boss && e.hp < e.maxHp && e.maxHp > 40) {
        g.fillStyle = "#000"; g.fillRect(x - 12, y - sz / 2 - 5, 24, 3);
        g.fillStyle = "#ff6b81"; g.fillRect(x - 12, y - sz / 2 - 5, 24 * Math.max(0, e.hp / e.maxHp), 3);
      }
    }

    function drawPlayer(now) {
      const p = sim.p, x = sx(p.x), y = sy(p.y);
      if (p.iframes > 0 && Math.floor(now / 60) % 2 === 0) g.globalAlpha = 0.45;
      g.fillStyle = "rgba(0,0,0,.35)";
      g.beginPath(); g.ellipse(x, y + 14, 12, 4, 0, 0, 6.283); g.fill();
      const flip = p.fx < 0;
      if (flip) { g.save(); g.translate(x, 0); g.scale(-1, 1); g.translate(-x, 0); }
      const ready = avatar.layers.filter((l) => l.ok);
      if (ready.length) {
        const row = p.moving ? 1 : 0, frame = Math.floor(now / (p.moving ? 100 : 200)) % 8;
        for (const l of ready) g.drawImage(l.img, frame * l.w, row * l.h, l.w, l.h, Math.round(x - l.w / 2), Math.round(y + 17 - l.h), l.w, l.h);
      } else {
        // no sheet for this outfit (or still loading): a little drawn pixie so the game still reads
        const flap = Math.sin(now / 60) * 5;
        g.fillStyle = "#bff3ff"; g.fillRect(x - 15, y - 12 - flap, 10, 14); g.fillRect(x + 5, y - 12 - flap, 10, 14);
        g.fillStyle = "#ff8ad4"; g.fillRect(x - 5, y - 2, 10, 14);
        g.fillStyle = "#ffe0c8"; g.fillRect(x - 5, y - 12, 10, 10);
        g.fillStyle = "#1a1030"; g.fillRect(x - 3, y - 8, 2, 2); g.fillRect(x + 1, y - 8, 2, 2);
        g.fillStyle = "#ffe27a"; g.fillRect(x - 5, y - 15, 10, 4);
      }
      if (flip) g.restore();
      g.globalAlpha = 1;
      g.fillStyle = "#000"; g.fillRect(x - 16, y + 20, 32, 4);
      g.fillStyle = p.hp / p.maxHp > 0.3 ? "#6be86b" : "#ff5b5b"; g.fillRect(x - 15, y + 21, 30 * Math.max(0, p.hp / p.maxHp), 2);
    }

    function drawShots(now) {
      for (const sh of sim.shots) {
        const x = sx(sh.x), y = sy(sh.y);
        if (sh.kind === "bolt") { g.globalAlpha = 0.5; dot(x, y, sh.r + 3, sh.color); g.globalAlpha = 1; g.drawImage(sheetS, 0, 0, 16, 16, x - 8, y - 8, 16, 16); }
        else if (sh.kind === "knife") { g.save(); g.translate(x, y); g.rotate(sh.ang); g.drawImage(sheetS, 64, 0, 16, 16, -8, -8, 16, 16); g.restore(); }
        else if (sh.kind === "orbit") { g.save(); g.translate(x, y); g.rotate(sh.a + Math.PI / 2); g.drawImage(sheetS, 16, 0, 16, 16, -10, -14, 20, 28); g.restore(); }
        else if (sh.kind === "boomer") { const k = Math.max(1, sh.r / 12); g.save(); g.translate(x, y); g.rotate(sh.ang); g.drawImage(sheetS, 32, 0, 16, 16, -8 * k, -8 * k, 16 * k, 16 * k); g.restore(); }
        else if (sh.kind === "bomb") { const k = 1 + Math.sin(now / 40) * 0.1; g.drawImage(sheetS, 48, 0, 16, 16, x - 8 * k, y - 8 * k, 16 * k, 16 * k); }
      }
      for (const b of sim.eshots) { const x = sx(b.x), y = sy(b.y); dot(x, y, 6, "#ff5b5b"); dot(x, y, 3, "#ffd0b0"); }
    }

    function drawLoot(now) {
      for (const gem of sim.gems) {
        const x = sx(gem.x), y = sy(gem.y);
        if (x < -10 || x > W + 10 || y < -10 || y > H + 10) continue;
        const s = gem.v >= 25 ? 6 : gem.v >= 5 ? 5 : 4;
        g.fillStyle = gem.v >= 25 ? "#ff6bd6" : gem.v >= 5 ? "#ffd54a" : "#5ee0ff";
        g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s - 1, y); g.lineTo(x, y + s); g.lineTo(x - s + 1, y); g.fill();
        g.fillStyle = "rgba(255,255,255,.8)"; g.fillRect(x - 1, y - s + 2, 1, 2);
      }
      for (const k of sim.pickups) {
        const x = sx(k.x), y = Math.round(sy(k.y) + Math.sin(now / 200 + k.x) * 2);
        if (k.kind === "heart") {
          g.fillStyle = "#ff4b6a"; g.fillRect(x - 6, y - 5, 5, 5); g.fillRect(x + 1, y - 5, 5, 5); g.fillRect(x - 6, y - 1, 12, 4); g.fillRect(x - 4, y + 3, 8, 3); g.fillRect(x - 1, y + 6, 2, 2);
        } else if (k.kind === "magnet") {
          g.fillStyle = "#ff5b5b"; g.fillRect(x - 6, y - 6, 4, 9); g.fillRect(x + 2, y - 6, 4, 9); g.fillRect(x - 6, y + 3, 12, 3);
          g.fillStyle = "#e8eef8"; g.fillRect(x - 6, y - 6, 4, 3); g.fillRect(x + 2, y - 6, 4, 3);
        } else if (k.kind === "bomb") {
          dot(x, y + 1, 7, "#222"); g.fillStyle = "#ffd54a"; g.fillRect(x + 2, y - 8, 3, 3);
        } else {
          dot(x, y, 18, `rgba(255,213,74,${0.2 + 0.15 * Math.sin(now / 150)})`);
          g.fillStyle = "#000"; g.fillRect(x - 11, y - 8, 22, 16);
          g.fillStyle = "#a8723e"; g.fillRect(x - 10, y - 7, 20, 14);
          g.fillStyle = "#ffd54a"; g.fillRect(x - 10, y - 2, 20, 3); g.fillRect(x - 2, y - 3, 4, 6);
        }
      }
    }

    function drawFx(dt) {
      for (const f of fx) {
        f.t += dt;
        const k = f.t / f.life, x = sx(f.x), y = sy(f.y);
        g.globalAlpha = Math.max(0, 1 - k);
        if (f.k === "ring") {
          g.strokeStyle = f.color; g.lineWidth = 4; g.beginPath(); g.arc(x, y, f.r * (0.4 + 0.6 * k), 0, 6.283); g.stroke();
          if (f.fill) { g.fillStyle = f.color; g.globalAlpha = Math.max(0, 0.35 * (1 - k)); g.fill(); }
        } else if (f.k === "whip") {
          g.fillStyle = f.color;
          const len = f.reach * Math.min(1, k * 3 + 0.3);
          for (let i = 0; i < 6; i++) g.fillRect(Math.round(x + f.side * ((len * i) / 6) - (f.side < 0 ? len / 6 : 0)), Math.round(y + Math.sin(i + f.t * 30) * 4 - 3), Math.ceil(len / 6) + 1, Math.max(2, 6 - i * 0.6));
        } else if (f.k === "zap") {
          g.strokeStyle = f.color; g.lineWidth = 3; g.beginPath();
          const top = f.y - 400;
          g.moveTo(x + Math.sin(f.seed) * 20, sy(top));
          for (let i = 1; i < 6; i++) g.lineTo(x + Math.sin(f.seed * i) * 14, sy(top + (400 * i) / 6));
          g.lineTo(x, y); g.stroke();
          dot(x, y, 12 * (1 - k), "#fff");
        }
      }
      g.globalAlpha = 1;
      fx = fx.filter((f) => f.t < f.life);
      for (const p of parts) {
        p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.94; p.vy *= 0.94;
        g.globalAlpha = Math.max(0, p.life / p.max);
        g.fillStyle = p.color;
        g.fillRect(sx(p.x), sy(p.y), p.size, p.size);
      }
      g.globalAlpha = 1;
      parts = parts.filter((p) => p.life > 0);
      g.font = "bold 12px monospace";
      g.textAlign = "center";
      for (const t of texts) {
        t.life -= dt; t.y -= 28 * dt;
        g.globalAlpha = Math.min(1, t.life * 3);
        g.fillStyle = "#000"; g.fillText(t.text, sx(t.x) + 1, sy(t.y) + 1);
        g.fillStyle = t.crit ? "#ffd54a" : "#fff"; g.fillText(t.text, sx(t.x), sy(t.y));
      }
      g.globalAlpha = 1;
      texts = texts.filter((t) => t.life > 0);
    }

    function drawHud(dt) {
      const p = sim.p;
      g.fillStyle = "rgba(0,0,0,.6)"; g.fillRect(0, 0, W, 14);
      g.fillStyle = "#5ee0ff"; g.fillRect(0, 0, (W * sim.xp) / sim.xpNext, 14);
      g.textAlign = "left"; g.font = "bold 11px monospace"; g.fillStyle = "#fff"; g.fillText("LV " + sim.level, 6, 11);
      g.textAlign = "center"; g.font = "bold 20px monospace";
      g.fillStyle = "#000"; g.fillText(fmtTime(sim.t), W / 2 + 1, 38); g.fillStyle = "#fff"; g.fillText(fmtTime(sim.t), W / 2, 37);
      g.textAlign = "right"; g.font = "bold 13px monospace"; g.fillStyle = "#fff";
      g.fillText(`${sim.kills} kills`, W - 8, 32);
      g.fillStyle = "#b9a9e8"; g.fillText(`${sim.enemies.length} foes`, W - 8, 47);
      g.textAlign = "left"; g.fillStyle = "#ff8a9a";
      g.fillText(`HP ${Math.ceil(p.hp)}/${p.maxHp}`, 8, 32);
      let ix = 8;
      const slot = (def, level, letter) => {
        g.fillStyle = "rgba(0,0,0,.65)"; g.fillRect(ix, H - 38, 26, 32);
        g.fillStyle = def.color || "#fff"; g.fillRect(ix + 2, H - 36, 22, 20);
        g.fillStyle = "#1a1030"; g.font = "bold 13px monospace"; g.textAlign = "center"; g.fillText(letter, ix + 13, H - 21);
        g.fillStyle = "#fff"; g.font = "bold 9px monospace"; g.fillText(level, ix + 13, H - 9);
        ix += 29;
      };
      for (const w of sim.weapons) { const d = Sim.WEAPONS[w.id]; slot(d, d.evolved ? w.level : "MAX", d.name[0]); }
      ix += 10;
      for (const id of Object.keys(sim.passives)) slot(Sim.PASSIVES[id], sim.passives[id], Sim.PASSIVES[id].name[0]);
      if (sim.boss) {
        const b = sim.boss;
        g.fillStyle = "rgba(0,0,0,.7)"; g.fillRect(W / 2 - 160, 44, 320, 12);
        g.fillStyle = "#ff4b4b"; g.fillRect(W / 2 - 158, 46, 316 * Math.max(0, b.hp / b.maxHp), 8);
        g.fillStyle = "#fff"; g.textAlign = "center"; g.font = "bold 11px monospace"; g.fillText(b.def.name, W / 2, 70);
        if (sx(b.x) < 0 || sx(b.x) > W || sy(b.y) < 0 || sy(b.y) > H) {
          const a = Math.atan2(b.y - p.y, b.x - p.x);
          g.save(); g.translate(W / 2 + Math.cos(a) * 200, H / 2 + Math.sin(a) * 190); g.rotate(a);
          g.fillStyle = "#ff4b4b"; g.beginPath(); g.moveTo(14, 0); g.lineTo(-8, -9); g.lineTo(-8, 9); g.fill(); g.restore();
        }
      }
      if (banner) {
        banner.t -= dt;
        g.globalAlpha = Math.max(0, Math.min(1, banner.t));
        g.font = "bold 30px monospace"; g.textAlign = "center";
        g.fillStyle = "#000"; g.fillText(banner.text, W / 2 + 2, 122); g.fillStyle = banner.color; g.fillText(banner.text, W / 2, 120);
        g.globalAlpha = 1;
        if (banner.t <= 0) banner = null;
      }
      if (toast) {
        toast.t -= dt;
        g.globalAlpha = Math.max(0, Math.min(1, toast.t));
        g.font = "bold 14px monospace"; g.textAlign = "center";
        g.fillStyle = "#000"; g.fillText(toast.text, W / 2 + 1, H - 49); g.fillStyle = "#ffe27a"; g.fillText(toast.text, W / 2, H - 50);
        g.globalAlpha = 1;
        if (toast.t <= 0) toast = null;
      }
      if (stick) {
        g.strokeStyle = "rgba(255,255,255,.35)"; g.lineWidth = 3; g.beginPath(); g.arc(stick.ox, stick.oy, 45, 0, 6.283); g.stroke();
        dot(stick.ox + stick.dx * 45, stick.oy + stick.dy * 45, 18, "rgba(255,255,255,.4)");
      }
    }

    function render(now, dt) {
      const p = sim.p;
      let ox = 0, oy = 0;
      if (shake > 0.3 && !reduced) { ox = (Math.random() - 0.5) * shake; oy = (Math.random() - 0.5) * shake; }
      shake *= Math.exp(-9 * dt);
      camX = p.x - W / 2 + ox;
      camY = p.y - H / 2 + oy;
      drawBackground();
      drawLoot(now);
      for (const e of sim.enemies) drawEnemy(e);
      drawShots(now);
      drawPlayer(now);
      drawFx(dt);
      if (hurtFlash > 0) {
        hurtFlash -= dt;
        const grad = g.createRadialGradient(W / 2, H / 2, 150, W / 2, H / 2, 480);
        grad.addColorStop(0, "rgba(255,0,0,0)"); grad.addColorStop(1, `rgba(255,0,0,${Math.min(0.6, hurtFlash * 1.6)})`);
        g.fillStyle = grad; g.fillRect(0, 0, W, H);
      }
      if (flash > 0 && !reduced) { g.fillStyle = `rgba(255,255,255,${flash * 0.6})`; g.fillRect(0, 0, W, H); }
      flash = Math.max(0, flash - dt);
      if (nukeFlash > 0) { g.fillStyle = `rgba(255,240,200,${Math.min(1, nukeFlash * 1.5)})`; g.fillRect(0, 0, W, H); nukeFlash -= dt; }
      drawHud(dt);
    }

    // the sim runs at a fixed 60Hz no matter the display rate
    function frame(now) {
      raf = requestAnimationFrame(frame);
      const dt = Math.min(0.1, (now - last) / 1000 || 0);
      last = now;
      if (!sim) { g.fillStyle = "#1a1030"; g.fillRect(0, 0, W, H); return; }
      if (mode === "play") {
        acc += dt;
        let n = 0;
        while (acc >= 1 / 60 && n++ < 5 && sim.phase === "play") { Sim.step(sim, 1 / 60, input()); acc -= 1 / 60; }
        if (n >= 5) acc = 0;
        for (const ev of sim.events) handle(ev);
        sim.events.length = 0;
        if (sim.phase === "levelup") showCards();
        else if (sim.phase === "dead" || sim.phase === "won") finish();
      }
      render(now, mode === "play" ? dt : 0);
    }

    menu();
    raf = requestAnimationFrame((t) => { last = t; frame(t); });
    return {
      destroy() {
        cancelAnimationFrame(raf);
        window.removeEventListener("keydown", onKey);
        window.removeEventListener("keyup", onKey);
        window.removeEventListener("blur", auto);
        document.removeEventListener("visibilitychange", auto);
        audio.destroy();
        lb?.destroy();
      },
    };
  }

  window.ArcadeGames.register({
    id: "survivors",
    title: "Pixie Survivors",
    blurb: "Auto-fire horde survival. Level up, evolve, slay the Static King.",
    icon: BASE + "icon.png",
    mount,
  });
})();
