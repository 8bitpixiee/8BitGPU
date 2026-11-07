// Pixie Kart: top-down arcade racer. Two halves in this one file:
//   1. KartSim, pure and deterministic (no DOM), so node can test it (tests/kart.test.cjs)
//   2. the cabinet: canvas drawing, input, sound, menus, ghost, online rooms (browser only)
// Sim time is fixed 60 steps a second. Distances are world units, speeds are units per step.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.KartSim = api;
})(typeof self !== "undefined" ? self : this, function (root) {
  const FPS = 60;
  const BIT = { UP: 1, DOWN: 2, LEFT: 4, RIGHT: 8, DRIFT: 16, ITEM: 32, RESET: 64 };
  const LAPS = 3;
  const COUNTDOWN = 180;
  const SPACING = 12; // centerline sample spacing, also how coarse "which part of the track am I on" is
  const R = 13; // kart radius
  const MAX = 4.2;
  const ACC = 0.1;
  const BRAKE = 0.2;
  const REV = 1.5;
  const TURN = 0.05;
  const WALL = 28; // grass strip past the road edge, then a wall
  const GHOST_EVERY = 3;
  const FINISH_GRACE = 25 * FPS; // after the first human finishes everyone else gets this long

  // closed loops of control points. hw is half the road width. theme is just colors for the painter
  const TRACKS = {
    glimmer: {
      id: "glimmer", name: "Glimmer Loop", blurb: "Wide and friendly. Learn to drift here.", hw: 100,
      pts: [[1700, 0], [1350, -700], [500, -1050], [-600, -1000], [-1500, -550], [-1700, 250], [-1100, 800], [-100, 980], [750, 800], [1400, 520]],
      theme: { grass: "#2c6b3f", rough: "#3f8a50", road: "#57527a", curb: "#ff6fb5", wall: "#173d27", deco: "#ffd54a" },
    },
    thorn: {
      id: "thorn", name: "Thorn Hairpins", blurb: "Tight corners that punish a lazy drift.", hw: 85,
      pts: [[0, 0], [900, -150], [1800, -150], [2300, 350], [1800, 850], [900, 600], [300, 950], [450, 1500], [1300, 1650], [2000, 2050], [1500, 2550], [300, 2450], [-700, 2100], [-1000, 1300], [-800, 500], [-500, 100]],
      theme: { grass: "#3d2c5c", rough: "#55407c", road: "#4a4a58", curb: "#9dffb8", wall: "#1d1233", deco: "#7cf0a5" },
    },
    void: {
      id: "void", name: "Void Spiral", blurb: "Long, twisty, and a little bit rude.", hw: 90,
      pts: [[0, 0], [900, -100], [1700, -500], [2300, -200], [2500, 500], [1900, 1000], [1100, 800], [700, 1250], [1000, 1900], [400, 2350], [-500, 2150], [-800, 1450], [-1400, 1000], [-1500, 200], [-900, -350]],
      theme: { grass: "#161b3a", rough: "#232b5c", road: "#3a3355", curb: "#b277ff", wall: "#080b1e", deco: "#6ad8ff" },
    },
  };
  const TRACK_ORDER = ["glimmer", "thorn", "void"];

  // ------------------------------------------------------------------ track geometry
  const built = new Map();

  function catmull(a, b, c, d, t) {
    const t2 = t * t, t3 = t2 * t;
    return 0.5 * (2 * b + (c - a) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (3 * b - a - 3 * c + d) * t3);
  }

  // smooth spline through the control points, then resampled so the samples are evenly spaced
  function buildTrack(id) {
    if (built.has(id)) return built.get(id);
    const def = TRACKS[id];
    const n = def.pts.length;
    const dense = [];
    for (let i = 0; i < n; i++) {
      const p0 = def.pts[(i + n - 1) % n], p1 = def.pts[i], p2 = def.pts[(i + 1) % n], p3 = def.pts[(i + 2) % n];
      for (let k = 0; k < 40; k++) dense.push([catmull(p0[0], p1[0], p2[0], p3[0], k / 40), catmull(p0[1], p1[1], p2[1], p3[1], k / 40)]);
    }
    const cum = [0];
    for (let i = 1; i <= dense.length; i++) {
      const a = dense[i - 1], b = dense[i % dense.length];
      cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const total = cum[cum.length - 1];
    const N = Math.round(total / SPACING);
    const step = total / N;
    const x = [], y = [];
    let seg = 0;
    for (let j = 0; j < N; j++) {
      const want = j * step;
      while (cum[seg + 1] < want) seg++;
      const f = (want - cum[seg]) / (cum[seg + 1] - cum[seg] || 1);
      const a = dense[seg], b = dense[(seg + 1) % dense.length];
      x.push(a[0] + (b[0] - a[0]) * f);
      y.push(a[1] + (b[1] - a[1]) * f);
    }
    const tx = [], ty = [], turn = [];
    for (let i = 0; i < N; i++) {
      const a = (i + N - 1) % N, b = (i + 1) % N;
      const l = Math.hypot(x[b] - x[a], y[b] - y[a]) || 1;
      tx.push((x[b] - x[a]) / l);
      ty.push((y[b] - y[a]) / l);
    }
    // how sharply the road bends over the next ~100 units, used by AI to pick corner speed
    for (let i = 0; i < N; i++) {
      const j = (i + 8) % N;
      turn.push(Math.abs(Math.atan2(tx[i] * ty[j] - ty[i] * tx[j], tx[i] * tx[j] + ty[i] * ty[j])));
    }
    let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
    for (let i = 0; i < N; i++) {
      minX = Math.min(minX, x[i]); maxX = Math.max(maxX, x[i]);
      minY = Math.min(minY, y[i]); maxY = Math.max(maxY, y[i]);
    }
    const tr = { id, def, hw: def.hw, N, step, length: total, x, y, tx, ty, turn, bounds: { minX, minY, maxX, maxY } };
    built.set(id, tr);
    return tr;
  }

  // nearest centerline sample near the hint (wrapping). lat is signed distance, positive on the right
  function locate(tr, px, py, hint) {
    const W = 40;
    let best = 1e18, bi = hint;
    for (let d = -W; d <= W; d++) {
      const j = (((hint + d) % tr.N) + tr.N) % tr.N;
      const dx = px - tr.x[j], dy = py - tr.y[j];
      const q = dx * dx + dy * dy;
      if (q < best) { best = q; bi = j; }
    }
    const dx = px - tr.x[bi], dy = py - tr.y[bi];
    const lat = dx * -tr.ty[bi] + dy * tr.tx[bi];
    const along = (dx * tr.tx[bi] + dy * tr.ty[bi]) / tr.step;
    return { i: bi, lat, pos: bi + Math.max(-0.5, Math.min(0.5, along)) };
  }

  // ------------------------------------------------------------------ rng
  function rand(s) {
    s.rng = (s.rng + 0x6d2b79f5) >>> 0;
    let t = s.rng;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

  // ------------------------------------------------------------------ items, themed on the races in brawl-races.js
  const ITEMS = {
    glitter: { name: "Glitter Bomb", note: "Pixie. Homes in on whoever is ahead.", color: "#ff9ee0" },
    antler: { name: "Antler Charge", note: "Deerbra. A big shoulder-down dash.", color: "#ffb35c" },
    thorns: { name: "Thorn Volley", note: "Thixie. Sows thorns behind you.", color: "#7cf0a5" },
    bubble: { name: "Bubble Shield", note: "Mermaid. Pops instead of you.", color: "#7fd8ff" },
    overclock: { name: "Overclock", note: "Clanker. A long, steady speed-up.", color: "#ffe14a" },
    voidstep: { name: "Void Step", note: "Null. Blink down the road.", color: "#b277ff" },
  };
  // [weight when leading, weight when last]
  const ITEM_ODDS = {
    thorns: [3, 0], bubble: [3, 1], overclock: [2, 2], glitter: [2, 3], antler: [1, 3], voidstep: [0, 3],
  };

  function rollItem(s, rank, count) {
    const r = count > 1 ? (rank - 1) / (count - 1) : 0;
    const names = Object.keys(ITEM_ODDS);
    const w = names.map((n) => ITEM_ODDS[n][0] * (1 - r) + ITEM_ODDS[n][1] * r);
    let roll = rand(s) * w.reduce((a, b) => a + b, 0);
    for (let i = 0; i < names.length; i++) {
      roll -= w[i];
      if (roll < 0) return names[i];
    }
    return names[0];
  }

  // ------------------------------------------------------------------ state
  const AI_NAMES = ["Glimmer", "Thistle", "Bramble", "Fennel", "Dewdrop", "Moth", "Sorrel", "Pip"];
  const COLORS = ["#ff5fa8", "#5fb6ff", "#ffd54a", "#7cf0a5", "#b277ff", "#ff9a4d", "#52e0d0", "#e8e8f5"];

  // racers: [{ name, ai, color }]. grid slot = array order
  function create(trackId, racers, seed) {
    const tr = buildTrack(trackId);
    const s = {
      track: tr, tid: trackId, rng: (seed >>> 0) || 1, frame: 0, t: 0, phase: "countdown", deadline: null,
      finishCount: 0, results: null, karts: [], shots: [], thorns: [], boxes: [], events: [],
    };
    racers.forEach((r, k) => {
      const row = Math.floor(k / 2);
      const i = (((tr.N - 4 - row * 3) % tr.N) + tr.N) % tr.N;
      const lat = (k % 2 ? 1 : -1) * tr.hw * 0.35;
      const x = tr.x[i] - tr.ty[i] * lat, y = tr.y[i] + tr.tx[i] * lat;
      s.karts.push({
        id: k, name: r.name || "Racer " + (k + 1), ai: !!r.ai, color: r.color || COLORS[k % COLORS.length],
        x, y, a: Math.atan2(tr.ty[i], tr.tx[i]), vx: 0, vy: 0, speed: 0, lat, idx: i, pos: i, s: i - tr.N,
        drift: 0, charge: 0, boost: 0, bm: 0, spin: 0, shield: false, item: null, itemAge: 0, itemHeld: 0,
        bits: 0, lapStart: -1, laps: [], best: null, finished: null, place: 0, rank: k + 1, stuck: 0,
        lane: r.ai ? (rand(s) - 0.5) * 0.9 : 0, skill: r.ai ? 0.9 + rand(s) * 0.08 : 1, maxMul: 1,
      });
    });
    for (const frac of [0.1, 0.35, 0.6, 0.85]) {
      const i = Math.floor(tr.N * frac);
      for (const side of [-0.55, 0, 0.55]) {
        s.boxes.push({ x: tr.x[i] - tr.ty[i] * side * tr.hw, y: tr.y[i] + tr.tx[i] * side * tr.hw, t: 0 });
      }
    }
    ranks(s);
    return s;
  }

  const humans = (s) => s.karts.filter((k) => !k.ai);
  const emit = (s, e) => { if (s.events.length < 64) s.events.push(e); };
  function drain(s) {
    const out = s.events;
    s.events = [];
    return out;
  }

  function ranks(s) {
    const order = s.karts.slice().sort((a, b) => {
      if (a.finished != null || b.finished != null) {
        if (a.finished == null) return 1;
        if (b.finished == null) return -1;
        return a.place - b.place;
      }
      return b.s - a.s;
    });
    order.forEach((k, i) => { k.rank = i + 1; });
    return order;
  }

  // ------------------------------------------------------------------ AI driver
  function aiInput(s, k) {
    const tr = s.track;
    const sp = Math.max(0, k.speed);
    const look = 7 + Math.floor(sp * 3.5);
    const ti = (k.idx + look) % tr.N;
    const lane = k.lane * tr.hw;
    const gx = tr.x[ti] - tr.ty[ti] * lane, gy = tr.y[ti] + tr.tx[ti] * lane;
    const diff = wrapAngle(Math.atan2(gy - k.y, gx - k.x) - k.a);
    let bits = 0;
    if (diff > 0.05) bits |= BIT.RIGHT;
    else if (diff < -0.05) bits |= BIT.LEFT;
    let curve = 0;
    for (let j = 6; j <= 26; j += 4) curve = Math.max(curve, tr.turn[(k.idx + j) % tr.N]);
    const limit = MAX * k.maxMul * (1 - Math.min(0.55, curve * 0.7));
    if (sp < limit * 1.02) bits |= BIT.UP;
    else if (sp > limit * 1.25) bits |= BIT.DOWN;
    if (Math.abs(diff) > 0.4 && sp > MAX * 0.7 && curve > 0.5) bits |= BIT.DRIFT;
    if (k.drift && Math.abs(diff) > 0.1) bits |= BIT.DRIFT;
    k.stuck = sp < 0.4 && s.t > 60 ? k.stuck + 1 : 0;
    if (k.stuck > 150) { bits |= BIT.RESET; k.stuck = 0; }
    if (k.item) {
      let use = k.itemAge > 50 + (k.id * 17) % 60;
      if (k.item === "glitter" || k.item === "thorns") {
        use = false;
        for (const o of s.karts) {
          if (o === k) continue;
          const dx = o.x - k.x, dy = o.y - k.y, d = Math.hypot(dx, dy);
          const front = (dx * Math.cos(k.a) + dy * Math.sin(k.a)) / (d || 1);
          if (k.item === "glitter" && front > 0.85 && d < 380) use = true;
          if (k.item === "thorns" && front < -0.85 && d < 160) use = true;
        }
        if (k.itemAge > 420) use = true;
      }
      if (use && !k.itemHeld) bits |= BIT.ITEM;
    }
    return bits;
  }

  // ------------------------------------------------------------------ one kart, one step
  function hit(s, k, byShot) {
    if (k.spin > 0) return;
    if (k.shield) {
      k.shield = false;
      emit(s, { t: "pop", id: k.id });
      return;
    }
    k.spin = 50;
    k.boost = 0;
    k.bm = 0;
    k.drift = 0;
    k.charge = 0;
    k.vx *= 0.35;
    k.vy *= 0.35;
    emit(s, { t: "hit", id: k.id, by: byShot });
  }

  function giveBoost(k, frames, mul) {
    k.boost = Math.max(k.boost, frames);
    k.bm = Math.max(k.bm, mul);
  }

  function useItem(s, k) {
    const tr = s.track;
    const item = k.item;
    if (!item) return;
    k.item = null;
    k.itemAge = 0;
    emit(s, { t: "use", id: k.id, item });
    const co = Math.cos(k.a), si = Math.sin(k.a);
    if (item === "glitter") {
      s.shots.push({ x: k.x + co * 24, y: k.y + si * 24, vx: co * 8.5, vy: si * 8.5, life: 140, owner: k.id });
    } else if (item === "antler") {
      giveBoost(k, 90, 0.75);
    } else if (item === "thorns") {
      for (const d of [28, 46, 64]) {
        s.thorns.push({ x: k.x - co * d + (rand(s) - 0.5) * 22, y: k.y - si * d + (rand(s) - 0.5) * 22, life: 1500, owner: k.id });
      }
    } else if (item === "bubble") {
      k.shield = true;
    } else if (item === "overclock") {
      giveBoost(k, 300, 0.3);
    } else if (item === "voidstep") {
      const hop = 16;
      const i = (k.idx + hop) % tr.N;
      const lat = Math.max(-tr.hw * 0.8, Math.min(tr.hw * 0.8, k.lat));
      k.x = tr.x[i] - tr.ty[i] * lat;
      k.y = tr.y[i] + tr.tx[i] * lat;
      k.a = Math.atan2(tr.ty[i], tr.tx[i]);
      k.vx = tr.tx[i] * k.speed;
      k.vy = tr.ty[i] * k.speed;
      giveBoost(k, 25, 0.3);
    }
  }

  function moveKart(s, k, bits) {
    const tr = s.track;
    let up = bits & BIT.UP, down = bits & BIT.DOWN;
    let steer = (bits & BIT.RIGHT ? 1 : 0) - (bits & BIT.LEFT ? 1 : 0);
    let wantDrift = bits & BIT.DRIFT;

    if (bits & BIT.RESET && k.spin <= 0) {
      const i = k.idx;
      k.x = tr.x[i]; k.y = tr.y[i];
      k.a = Math.atan2(tr.ty[i], tr.tx[i]);
      k.vx = k.vy = 0;
      k.drift = 0; k.charge = 0; k.boost = 0; k.bm = 0;
      k.spin = 20; // the wobble doubles as the reset penalty
    }
    if (k.spin > 0) {
      k.spin--;
      k.a += 0.3;
      k.vx *= 0.94; k.vy *= 0.94;
      up = down = 0; steer = 0; wantDrift = 0;
    }

    const co0 = Math.cos(k.a), si0 = Math.sin(k.a);
    const vf0 = k.vx * co0 + k.vy * si0;
    const off = Math.abs(k.lat) > tr.hw;
    let max = MAX * k.maxMul;
    let acc = ACC;
    if (k.boost > 0) {
      k.boost--;
      max *= 1 + k.bm;
      acc *= 3;
      if (k.boost === 0) k.bm = 0;
    } else if (off) max *= 0.5;

    // drift: hold the button while steering at speed. let go after a good charge for a mini-turbo
    if (!k.drift && wantDrift && steer && vf0 > MAX * 0.55 && !off) {
      k.drift = steer;
      k.charge = 0;
      emit(s, { t: "driftstart", id: k.id });
    }
    if (k.drift) {
      if (!wantDrift || vf0 < MAX * 0.35 || off) {
        if (k.charge >= 95) { giveBoost(k, 75, 0.5); emit(s, { t: "boost", id: k.id, level: 2 }); }
        else if (k.charge >= 45) { giveBoost(k, 40, 0.4); emit(s, { t: "boost", id: k.id, level: 1 }); }
        k.drift = 0;
        k.charge = 0;
      } else k.charge += steer === k.drift ? 1.4 : 0.8;
    }

    // steering. a drift swings wider or tighter depending on how you lean on the stick
    const sf = Math.min(1, Math.abs(vf0) / 2.2) * (vf0 < 0 ? -1 : 1);
    const t = k.drift ? k.drift * 0.8 + steer * 0.45 : steer;
    k.a += TURN * t * sf;

    // move velocity into the new heading's frame, push throttle on forward, and let grip eat sideways slide
    const co = Math.cos(k.a), si = Math.sin(k.a);
    let vf = k.vx * co + k.vy * si;
    let vs = -k.vx * si + k.vy * co;
    if (up) { if (vf < max) vf = Math.min(max, vf + acc * (vf < 0 ? 3 : 1)); }
    else if (down) vf = Math.max(-REV, vf - (vf > 0 ? BRAKE : ACC * 0.6));
    else vf *= 0.988;
    if (vf > max) vf = max + (vf - max) * 0.9;
    vs *= k.drift ? 0.965 : 0.8;
    k.vx = co * vf - si * vs;
    k.vy = si * vf + co * vs;
    k.x += k.vx;
    k.y += k.vy;

    // where am I on the road now, and did that cross the wall
    let loc = locate(tr, k.x, k.y, k.idx);
    if (Math.abs(loc.lat) > tr.hw + WALL) {
      const sign = loc.lat > 0 ? 1 : -1;
      const nx = -tr.ty[loc.i] * sign, ny = tr.tx[loc.i] * sign;
      const lim = tr.hw + WALL - 1;
      k.x = tr.x[loc.i] + nx * lim;
      k.y = tr.y[loc.i] + ny * lim;
      const vn = k.vx * nx + k.vy * ny;
      if (vn > 0) {
        k.vx -= nx * vn * 1.4;
        k.vy -= ny * vn * 1.4;
        k.vx *= 0.8; k.vy *= 0.8;
        if (vn > 1.5) emit(s, { t: "bump", id: k.id });
      }
      loc = locate(tr, k.x, k.y, k.idx);
    }
    let d = loc.pos - k.pos;
    d -= Math.round(d / tr.N) * tr.N;
    k.s += d;
    k.pos = ((loc.pos % tr.N) + tr.N) % tr.N;
    k.idx = loc.i;
    k.lat = loc.lat;
    k.speed = Math.hypot(k.vx, k.vy);
  }

  // ------------------------------------------------------------------ the step
  function step(s, inputs) {
    s.frame++;
    if (s.phase === "countdown") {
      if (s.frame >= COUNTDOWN) { s.phase = "race"; s.t = 0; emit(s, { t: "go" }); }
      return;
    }
    s.t++;
    const tr = s.track;
    const leader = s.karts.reduce((m, k) => Math.max(m, k.s), -1e9);
    for (const k of s.karts) {
      let bits;
      if (k.ai || k.finished != null) {
        // rubber band: stragglers get a nudge, the leader eases off a hair
        const gap = Math.max(-0.12, Math.min(0.12, (leader - k.s) / tr.N));
        k.maxMul = k.skill * (1 + gap * 0.35);
        bits = aiInput(s, k);
      } else {
        bits = inputs?.[k.id] | 0;
        k.bits = bits;
      }
      const wasHeld = k.itemHeld;
      k.itemHeld = bits & BIT.ITEM ? 1 : 0;
      moveKart(s, k, bits);
      if (k.item) k.itemAge++;
      if (bits & BIT.ITEM && !wasHeld && k.item) useItem(s, k);

      // item boxes
      if (!k.item) {
        for (const b of s.boxes) {
          if (b.t > 0 || Math.hypot(b.x - k.x, b.y - k.y) > 26) continue;
          b.t = 300;
          k.item = rollItem(s, k.rank, s.karts.length);
          k.itemAge = 0;
          emit(s, { t: "item", id: k.id, item: k.item });
          break;
        }
      }
      // laps. s crosses 0 at the start line (not a lap), then each multiple of N is a finished lap
      const done = Math.floor(k.s / tr.N);
      if (k.lapStart < 0 && done >= 0) k.lapStart = s.t;
      if (k.lapStart >= 0 && done >= 1 + k.laps.length && k.finished == null) {
        const ms = Math.round(((s.t - k.lapStart) * 1000) / FPS);
        k.lapStart = s.t;
        k.laps.push(ms);
        const best = k.best == null || ms < k.best;
        if (best) k.best = ms;
        emit(s, { t: "lap", id: k.id, ms, n: k.laps.length, best });
        if (k.laps.length >= LAPS) {
          k.finished = s.t;
          k.place = ++s.finishCount;
          emit(s, { t: "finish", id: k.id, place: k.place });
          if (s.deadline == null && !k.ai) s.deadline = s.t + FINISH_GRACE;
        }
      }
    }
    for (const b of s.boxes) if (b.t > 0) b.t--;

    // glitter bombs fly, home a little, and hit
    for (const p of s.shots) {
      p.life--;
      let best = null, bd = 420;
      const sp = Math.hypot(p.vx, p.vy) || 1;
      for (const k of s.karts) {
        if (k.id === p.owner) continue;
        const dx = k.x - p.x, dy = k.y - p.y, d = Math.hypot(dx, dy);
        if (d < bd && (dx * p.vx + dy * p.vy) / (d * sp || 1) > 0.7) { bd = d; best = k; }
      }
      if (best) {
        const want = Math.atan2(best.y - p.y, best.x - p.x);
        const cur = Math.atan2(p.vy, p.vx);
        const na = cur + Math.max(-0.045, Math.min(0.045, wrapAngle(want - cur)));
        p.vx = Math.cos(na) * sp; p.vy = Math.sin(na) * sp;
      }
      p.x += p.vx; p.y += p.vy;
      const l = locate(tr, p.x, p.y, nearIdx(tr, p));
      if (Math.abs(l.lat) > tr.hw + WALL) p.life = 0;
      for (const k of s.karts) {
        if (k.id !== p.owner && Math.hypot(k.x - p.x, k.y - p.y) < R + 8) { hit(s, k, p.owner); p.life = 0; break; }
      }
    }
    s.shots = s.shots.filter((p) => p.life > 0);
    for (const th of s.thorns) {
      th.life--;
      for (const k of s.karts) {
        if (Math.hypot(k.x - th.x, k.y - th.y) < R + 5 && !(k.id === th.owner && th.life > 1440)) {
          hit(s, k, th.owner);
          th.life = 0;
          break;
        }
      }
    }
    s.thorns = s.thorns.filter((th) => th.life > 0);

    // karts shove each other
    for (let i = 0; i < s.karts.length; i++) {
      for (let j = i + 1; j < s.karts.length; j++) {
        const a = s.karts[i], b = s.karts[j];
        const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d >= R * 2 || d === 0) continue;
        const push = (R * 2 - d) / 2, nx = dx / d, ny = dy / d;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        const rel = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
        if (rel < 0) {
          a.vx += nx * rel * 0.5; a.vy += ny * rel * 0.5;
          b.vx -= nx * rel * 0.5; b.vy -= ny * rel * 0.5;
        }
      }
    }

    ranks(s);
    if (s.phase === "race") {
      const hs = humans(s);
      const everyoneIn = hs.length > 0 && hs.every((k) => k.finished != null);
      const allIn = s.karts.every((k) => k.finished != null);
      if (everyoneIn || allIn || (s.deadline != null && s.t >= s.deadline)) finish(s);
    }
  }

  // projectiles do not track an index, so find one close to them (cheap coarse scan of a few hundred samples)
  function nearIdx(tr, p) {
    if (p.i != null) {
      const l = locate(tr, p.x, p.y, p.i);
      p.i = l.i;
      return p.i;
    }
    let best = 1e18, bi = 0;
    for (let i = 0; i < tr.N; i += 4) {
      const q = (tr.x[i] - p.x) ** 2 + (tr.y[i] - p.y) ** 2;
      if (q < best) { best = q; bi = i; }
    }
    p.i = bi;
    return bi;
  }

  function finish(s) {
    s.phase = "done";
    const order = ranks(s);
    s.results = order.map((k, i) => ({
      id: k.id, name: k.name, place: i + 1, ai: k.ai,
      ms: k.finished != null ? Math.round((k.finished * 1000) / FPS) : null, best: k.best,
    }));
    emit(s, { t: "done" });
  }

  // ------------------------------------------------------------------ net snapshots (host sends, clients overwrite)
  const round = (o) => {
    if (typeof o === "number") return Math.round(o * 100) / 100;
    if (Array.isArray(o)) return o.map(round);
    if (o && typeof o === "object") {
      const out = {};
      for (const key of Object.keys(o)) out[key] = round(o[key]);
      return out;
    }
    return o;
  };
  function snapshot(s) {
    return round({
      frame: s.frame, t: s.t, phase: s.phase, deadline: s.deadline, finishCount: s.finishCount, results: s.results,
      karts: s.karts, shots: s.shots, thorns: s.thorns, boxes: s.boxes,
    });
  }
  function apply(s, snap) {
    Object.assign(s, snap);
    s.rng = (s.rng + s.frame) >>> 0; // keep the local copy moving without matching the host's rolls
  }

  // ------------------------------------------------------------------ ghosts: a flat [x, y, a, x, y, a, ...] sampled every few steps
  const Ghost = {
    EVERY: GHOST_EVERY,
    record(buf, k, lapFrame) {
      if (lapFrame % GHOST_EVERY === 0) buf.push(Math.round(k.x * 10) / 10, Math.round(k.y * 10) / 10, Math.round(k.a * 1000) / 1000);
    },
    // where the ghost is lapFrame steps into its lap; null once the lap is over
    at(buf, lapFrame) {
      const f = lapFrame / GHOST_EVERY;
      const i = Math.floor(f);
      if (!buf || (i + 1) * 3 + 2 >= buf.length) return null;
      const u = f - i, a = buf.slice(i * 3, i * 3 + 3), b = buf.slice(i * 3 + 3, i * 3 + 6);
      return { x: a[0] + (b[0] - a[0]) * u, y: a[1] + (b[1] - a[1]) * u, a: a[2] + wrapAngle(b[2] - a[2]) * u };
    },
  };

  const fmt = (ms) => {
    if (ms == null) return "-:--.---";
    return `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}.${String(Math.floor(ms % 1000)).padStart(3, "0")}`;
  };

  const api = {
    FPS, BIT, LAPS, COUNTDOWN, R, MAX, WALL, TRACKS, TRACK_ORDER, ITEMS, AI_NAMES, COLORS,
    buildTrack, locate, create, step, drain, ranks, snapshot, apply, rand, fmt, Ghost, wrapAngle, useItem, rollItem,
  };
  if (!root.document) return api;

  // ==================================================================================================
  // browser cabinet
  // ==================================================================================================
  const W = 640, H = 400;
  const STEP_MS = 1000 / FPS;
  const ICON = "client/games/kart/icon.png"; // drawn in Aseprite, source is icon.aseprite next to it

  const store = {
    get(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private window, fine */ } },
  };

  // ---------------------------------------------------------------- sound: everything is generated
  function createSfx() {
    let ac = null, master = null, engine = null, engineGain = null, muted = !!store.get("kart.muted");
    function ensure() {
      if (ac) { if (ac.state === "suspended") ac.resume(); return ac; }
      const Ctor = window.AudioContext || window.webkitAudioContext;
      if (!Ctor) return null;
      ac = new Ctor();
      master = ac.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ac.destination);
      engine = ac.createOscillator();
      engine.type = "sawtooth";
      engine.frequency.value = 60;
      engineGain = ac.createGain();
      engineGain.gain.value = 0;
      const lp = ac.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 500;
      engine.connect(lp).connect(engineGain).connect(master);
      engine.start();
      return ac;
    }
    function beep(freq, dur, type = "square", vol = 0.15, slide = 0) {
      if (!ensure()) return;
      const o = ac.createOscillator(), g = ac.createGain(), now = ac.currentTime;
      o.type = type;
      o.frequency.setValueAtTime(freq, now);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), now + dur);
      g.gain.setValueAtTime(vol, now);
      g.gain.exponentialRampToValueAtTime(0.001, now + dur);
      o.connect(g).connect(master);
      o.start(now);
      o.stop(now + dur + 0.02);
    }
    function noise(dur, vol = 0.2, freq = 1200) {
      if (!ensure()) return;
      const len = Math.floor(ac.sampleRate * dur), buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
      f.type = "bandpass";
      f.frequency.value = freq;
      g.gain.value = vol;
      src.buffer = buf;
      src.connect(f).connect(g).connect(master);
      src.start();
    }
    return {
      ensure,
      beep, noise,
      mute(on) {
        muted = on;
        store.set("kart.muted", on);
        if (master) master.gain.value = on ? 0 : 0.5;
      },
      muted: () => muted,
      engine(speed, boosting, drifting, on) {
        if (!ac) return;
        const t = ac.currentTime;
        engine.frequency.setTargetAtTime(55 + speed * 22 + (boosting ? 40 : 0), t, 0.05);
        engineGain.gain.setTargetAtTime(on ? 0.05 + speed * 0.012 + (drifting ? 0.02 : 0) : 0, t, 0.08);
      },
      event(e, me) {
        if (e.t === "item" && e.id === me) [660, 880, 1320].forEach((f, i) => setTimeout(() => beep(f, 0.1, "triangle", 0.12), i * 55));
        else if (e.t === "use") {
          if (e.item === "glitter") beep(900, 0.25, "sawtooth", 0.1, -600);
          else if (e.item === "voidstep") beep(200, 0.3, "sine", 0.18, 900);
          else if (e.item === "bubble") beep(500, 0.2, "sine", 0.15, 500);
          else noise(0.35, 0.15, 2200);
        } else if (e.t === "boost") { noise(0.4, 0.2, 1800 + e.level * 900); beep(300, 0.3, "sawtooth", 0.08, 500); }
        else if (e.t === "hit" || e.t === "pop") { noise(0.4, e.id === me ? 0.4 : 0.15, 500); beep(180, 0.3, "square", 0.12, -120); }
        else if (e.t === "bump" && e.id === me) noise(0.12, 0.2, 300);
        else if (e.t === "lap" && e.id === me) [880, 1100].forEach((f, i) => setTimeout(() => beep(f, 0.15, "square", 0.12), i * 120));
        else if (e.t === "finish" && e.id === me) [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => beep(f, 0.2, "square", 0.15), i * 110));
      },
    };
  }

  // ---------------------------------------------------------------- the pretty track, painted once to an offscreen canvas
  const LAYER_SCALE = 0.6;
  function paintTrack(tr) {
    const m = 400;
    const b = tr.bounds;
    const ox = b.minX - m, oy = b.minY - m;
    const c = document.createElement("canvas");
    c.width = Math.ceil((b.maxX - b.minX + m * 2) * LAYER_SCALE);
    c.height = Math.ceil((b.maxY - b.minY + m * 2) * LAYER_SCALE);
    const g = c.getContext("2d");
    g.setTransform(LAYER_SCALE, 0, 0, LAYER_SCALE, -ox * LAYER_SCALE, -oy * LAYER_SCALE);
    const th = tr.def.theme;
    g.fillStyle = th.grass;
    g.fillRect(ox, oy, c.width / LAYER_SCALE, c.height / LAYER_SCALE);

    // scenery, kept clear of the road. a tiny local rng so it looks the same every visit
    let seed = 7 + tr.N;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
    for (let n = 0; n < 420; n++) {
      const px = ox + rnd() * c.width / LAYER_SCALE, py = oy + rnd() * c.height / LAYER_SCALE;
      let near = 1e18;
      for (let i = 0; i < tr.N; i += 3) near = Math.min(near, (tr.x[i] - px) ** 2 + (tr.y[i] - py) ** 2);
      if (near < (tr.hw + WALL + 50) ** 2) continue;
      const r = 8 + rnd() * 14;
      g.fillStyle = th.rough;
      g.beginPath(); g.arc(px, py, r * 1.6, 0, 7); g.fill();
      g.fillStyle = th.deco;
      g.globalAlpha = 0.85;
      g.beginPath();
      g.moveTo(px, py - r); g.lineTo(px + r * 0.6, py); g.lineTo(px, py + r); g.lineTo(px - r * 0.6, py);
      g.fill();
      g.globalAlpha = 1;
    }

    const path = () => {
      g.beginPath();
      g.moveTo(tr.x[0], tr.y[0]);
      for (let i = 1; i < tr.N; i++) g.lineTo(tr.x[i], tr.y[i]);
      g.closePath();
    };
    g.lineJoin = "round";
    g.lineCap = "butt";
    const stroke = (w, color, dash) => {
      g.setLineDash(dash || []);
      g.strokeStyle = color;
      g.lineWidth = w;
      path();
      g.stroke();
    };
    stroke((tr.hw + WALL + 6) * 2, th.wall);
    stroke((tr.hw + WALL) * 2, th.rough);
    stroke((tr.hw + 12) * 2, "#f4f0ff");
    stroke((tr.hw + 12) * 2, th.curb, [34, 34]);
    stroke(tr.hw * 2, th.road);
    stroke(4, "rgba(255,255,255,.35)", [26, 30]);
    g.setLineDash([]);
    // checkered start line at sample 0
    const nx = -tr.ty[0], ny = tr.tx[0];
    const cell = (tr.hw * 2) / 10;
    for (let u = 0; u < 10; u++) {
      for (let v = 0; v < 2; v++) {
        g.fillStyle = (u + v) % 2 ? "#111" : "#fff";
        const lat = -tr.hw + u * cell, along = (v - 1) * cell;
        g.save();
        g.translate(tr.x[0] + nx * lat + tr.tx[0] * along, tr.y[0] + ny * lat + tr.ty[0] * along);
        g.rotate(Math.atan2(tr.ty[0], tr.tx[0]));
        g.fillRect(0, 0, cell, cell);
        g.restore();
      }
    }
    return { canvas: c, ox, oy };
  }

  // ---------------------------------------------------------------- the mount
  function mount(host, ctx) {
    host.replaceChildren();
    host.classList.add("kart-host");
    const rootEl = document.createElement("div");
    rootEl.className = "kart-root";
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.className = "kart-canvas";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Pixie Kart race. Steer with the arrow keys or WASD, hold space to drift, press X to use an item.");
    const ui = document.createElement("div");
    ui.className = "kart-ui";
    const touch = document.createElement("div");
    touch.className = "kart-touch";
    rootEl.append(canvas, ui, touch);
    host.append(rootEl);
    const g = canvas.getContext("2d");
    g.imageSmoothingEnabled = false;
    ctx.setTitle?.("Pixie Kart");

    const sfx = createSfx();
    const layers = new Map();
    const layerFor = (tr) => { if (!layers.has(tr.id)) layers.set(tr.id, paintTrack(tr)); return layers.get(tr.id); };
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

    // driver bubble: the player's Being, layered the same way brawl-view does. falls back to a blob if anything 404s
    const me = ctx.me?.() || null;
    const driverImgs = [];
    for (const key of ["body", "ears", "head", "chest", "eyes", "hair", "fit"]) {
      const src = me?.avatar?.layers?.[key];
      if (!src) continue;
      const img = new Image();
      img.onload = () => driverImgs.push(img);
      img.src = src;
    }

    // ---------------------------------------------------------------- input
    let keyBits = 0, touchBits = 0;
    const KEYS = {
      ArrowUp: BIT.UP, KeyW: BIT.UP, ArrowDown: BIT.DOWN, KeyS: BIT.DOWN, ArrowLeft: BIT.LEFT, KeyA: BIT.LEFT,
      ArrowRight: BIT.RIGHT, KeyD: BIT.RIGHT, Space: BIT.DRIFT, ShiftLeft: BIT.DRIFT, ShiftRight: BIT.DRIFT,
      KeyX: BIT.ITEM, KeyE: BIT.ITEM, Enter: BIT.ITEM, KeyR: BIT.RESET,
    };
    const typing = (e) => /^(input|textarea|select)$/i.test(e.target?.tagName || "");
    function onKey(e) {
      if (typing(e) || !playing()) return;
      if (e.code === "KeyM" && e.type === "keydown") { sfx.mute(!sfx.muted()); return; }
      const bit = KEYS[e.code];
      if (!bit) return;
      e.preventDefault();
      sfx.ensure();
      keyBits = e.type === "keydown" ? keyBits | bit : keyBits & ~bit;
    }
    const clearKeys = () => { keyBits = 0; touchBits = 0; };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
    window.addEventListener("blur", clearKeys);

    for (const [label, bit, cls] of [["◀", BIT.LEFT, "l"], ["▶", BIT.RIGHT, "r"], ["GO", BIT.UP, "gas"], ["DRIFT", BIT.DRIFT, "drift"], ["ITEM", BIT.ITEM, "item"]]) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "kart-tb kart-tb-" + cls;
      b.textContent = label;
      b.setAttribute("aria-label", label);
      const set = (on) => { touchBits = on ? touchBits | bit : touchBits & ~bit; };
      b.addEventListener("pointerdown", (e) => { e.preventDefault(); sfx.ensure(); b.setPointerCapture?.(e.pointerId); set(true); });
      for (const ev of ["pointerup", "pointercancel", "lostpointercapture"]) b.addEventListener(ev, () => set(false));
      touch.append(b);
    }

    // ---------------------------------------------------------------- game state
    let screen = "menu"; // menu | race | results
    let s = null;
    let mode = "race"; // race | trial | online
    let myId = 0;
    let net = null;
    let netHost = false;
    let netIds = []; // player ids in kart order
    let remoteBits = {};
    let lastSentBits = -1, lastSendAt = 0;
    let ghostBest = null, ghostBuf = null, curRec = [];
    let particles = [];
    let cam = { x: 0, y: 0, a: 0 };
    let banner = { text: "", t: 0 };
    let lastCount = 4;
    let submitted = null;
    let board = null;
    let raf = 0, last = performance.now(), acc = 0;
    let dead = false;
    const playing = () => screen === "race";

    const el = (tag, cls, text) => {
      const n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    };
    const button = (label, fn, cls = "") => {
      const b = el("button", "kart-btn " + cls, label);
      b.type = "button";
      b.addEventListener("click", () => { sfx.ensure(); fn(); });
      return b;
    };
    function clearUi() {
      board?.destroy();
      board = null;
      ui.replaceChildren();
    }

    // ---------------------------------------------------------------- menus
    let pickedTrack = store.get("kart.track") || "glimmer";
    if (!TRACKS[pickedTrack]) pickedTrack = "glimmer";

    function trackThumb(id) {
      const tr = buildTrack(id);
      const c = el("canvas", "kart-thumb");
      c.width = 120;
      c.height = 80;
      const gg = c.getContext("2d");
      const b = tr.bounds, sc = Math.min(104 / (b.maxX - b.minX), 64 / (b.maxY - b.minY));
      const ox = 60 - ((b.minX + b.maxX) / 2) * sc, oy = 40 - ((b.minY + b.maxY) / 2) * sc;
      gg.lineJoin = "round";
      gg.strokeStyle = tr.def.theme.curb;
      gg.lineWidth = 7;
      gg.beginPath();
      for (let i = 0; i <= tr.N; i++) gg[i ? "lineTo" : "moveTo"](tr.x[i % tr.N] * sc + ox, tr.y[i % tr.N] * sc + oy);
      gg.stroke();
      gg.strokeStyle = tr.def.theme.road;
      gg.lineWidth = 4;
      gg.stroke();
      return c;
    }

    function menu(note) {
      clearUi();
      screen = "menu";
      s = null;
      clearKeys();
      sfx.engine(0, false, false, false);
      const box = el("div", "kart-panel");
      box.append(el("h2", "kart-title", "PIXIE KART"), el("p", "kart-sub", note || "Three laps. Drift for boosts. Grab the glittery boxes."));
      const cards = el("div", "kart-tracks");
      for (const id of TRACK_ORDER) {
        const def = TRACKS[id];
        const card = el("button", "kart-track" + (id === pickedTrack ? " on" : ""));
        card.type = "button";
        const best = store.get("kart.best." + id);
        card.append(trackThumb(id), el("b", "", def.name), el("small", "", def.blurb), el("small", "kart-pb", best ? "best lap " + fmt(best) : "no lap yet"));
        card.addEventListener("click", () => {
          pickedTrack = id;
          store.set("kart.track", id);
          for (const c of cards.children) c.classList.toggle("on", c === card);
        });
        cards.append(card);
      }
      box.append(cards);
      const row = el("div", "kart-row");
      row.append(
        button("Race the pixies", () => startLocal("race"), "primary"),
        button("Time trial", () => startLocal("trial")),
        button("Online", onlineMenu),
        button("Scores", scoresView),
      );
      box.append(row, el("p", "kart-keys", "Arrows or WASD to drive · Space to drift (hold, let go for a boost) · X for items · R to reset · M mutes"));
      ui.append(box);
    }

    function scoresView() {
      clearUi();
      const box = el("div", "kart-panel");
      box.append(el("h2", "kart-title", "BEST LAPS"));
      const slot = el("div", "kart-board");
      box.append(slot, button("Back", () => menu()));
      ui.append(box);
      board = ctx.leaderboard.mountCanvas(slot, "kart", { title: "PIXIE KART", me: me?.username, width: 420, height: 320 });
    }

    // ---------------------------------------------------------------- starting races
    function myName() { return me?.username || "You"; }

    function startLocal(kind) {
      mode = kind;
      const racers = [{ name: myName(), ai: false, color: COLORS[0] }];
      if (kind === "race") for (let i = 0; i < 5; i++) racers.push({ name: AI_NAMES[i], ai: true, color: COLORS[i + 1] });
      // you start at the back of the grid so there is someone to chase
      if (kind === "race") racers.unshift(racers.pop());
      myId = racers.findIndex((r) => !r.ai);
      begin(pickedTrack, racers, (Date.now() & 0xffffff) || 1);
    }

    function begin(trackId, racers, seed) {
      clearUi();
      s = create(trackId, racers, seed);
      layerFor(s.track);
      screen = "race";
      curRec = [];
      particles = [];
      lastCount = 4;
      submitted = null;
      banner = { text: "", t: 0 };
      const saved = store.get("kart.ghost." + trackId);
      ghostBest = saved?.pts ? saved : null;
      ghostBuf = ghostBest?.pts || null;
      const k = s.karts[myId];
      cam = { x: k.x, y: k.y, a: k.a };
    }

    // ---------------------------------------------------------------- online: host runs the sim, everyone else sends inputs
    function leaveNet() {
      net?.close();
      net = null;
    }

    function onlineMenu(msg) {
      clearUi();
      leaveNet();
      const box = el("div", "kart-panel");
      box.append(el("h2", "kart-title", "ONLINE"), el("p", "kart-sub", typeof msg === "string" ? msg : "Make a room and share the code, or enter a friend's."));
      const code = el("input", "kart-code");
      code.maxLength = 6;
      code.placeholder = "CODE";
      code.setAttribute("aria-label", "room code");
      const row = el("div", "kart-row");
      row.append(
        button("Host a room", () => joinRoom(Math.random().toString(36).slice(2, 6).toUpperCase())),
        button("Join", () => code.value.trim() && joinRoom(code.value.trim().toUpperCase())),
        button("Back", () => menu()),
      );
      box.append(code, row);
      ui.append(box);
    }

    function lobby() {
      clearUi();
      const box = el("div", "kart-panel");
      box.append(el("h2", "kart-title", "ROOM " + net.code), el("p", "kart-sub", netHost ? "You are the host. Pick a track and start when everyone is in." : "Waiting for the host to start..."));
      const list = el("ul", "kart-roster");
      for (const p of net.api.players()) list.append(el("li", "", p.username + (p.id === net.api.host() ? " (host)" : "")));
      box.append(list);
      const row = el("div", "kart-row");
      if (netHost) {
        const sel = el("select", "kart-select");
        for (const id of TRACK_ORDER) {
          const o = el("option", "", TRACKS[id].name);
          o.value = id;
          o.selected = id === pickedTrack;
          sel.append(o);
        }
        sel.addEventListener("change", () => { pickedTrack = sel.value; });
        row.append(sel, button("Start race", hostStart, "primary"));
      }
      row.append(button("Leave", () => menu()));
      box.append(row);
      ui.append(box);
      net.lobby = true;
    }

    function joinRoom(code) {
      clearUi();
      ui.append(el("div", "kart-panel", "Connecting..."));
      net = { code, lobby: false, api: null };
      net.api = ctx.net("kart", code, {
        onHello() { netHost = net.api.isHost(); lobby(); },
        onJoin() { if (net?.lobby && screen === "menu") { netHost = net.api.isHost(); lobby(); } },
        onLeave(id, host) {
          if (screen === "menu" && net?.lobby) { netHost = net.api.isHost(); lobby(); return; }
          if (screen === "race" && mode === "online" && !netIds.includes(host)) { /* a non-host left, AI keeps their kart */ }
          if (screen !== "menu" && id === netIds[0]) endOnline("The host left the room.");
        },
        onMsg(from, d) { onNetMsg(from, d); },
        onClose() { if (net) { net = null; if (screen !== "menu") endOnline("Lost connection."); else onlineMenu("Could not reach the room."); } },
      });
    }

    function endOnline(text) {
      leaveNet();
      menu(text);
    }

    function hostStart() {
      const players = net.api.players().slice(0, 8);
      const ids = players.map((p) => p.id);
      const seed = (Date.now() & 0xffffff) || 1;
      net.api.send({ t: "start", track: pickedTrack, ids, names: players.map((p) => p.username), seed });
      onNetMsg(net.api.id, { t: "start", track: pickedTrack, ids, names: players.map((p) => p.username), seed });
    }

    function onNetMsg(from, d) {
      if (!d) return;
      if (d.t === "start" && from === net?.api.host()) {
        mode = "online";
        netHost = net.api.isHost();
        netIds = d.ids;
        remoteBits = {};
        myId = d.ids.indexOf(net.api.id);
        if (myId < 0) return;
        const racers = d.ids.map((id, i) => ({ name: d.names[i], ai: false, color: COLORS[i % COLORS.length] }));
        for (let i = racers.length; i < 6; i++) racers.push({ name: AI_NAMES[i], ai: true, color: COLORS[i % COLORS.length] });
        begin(d.track, racers, d.seed);
        net.lobby = false;
      } else if (d.t === "in" && netHost && s) {
        remoteBits[from] = d.b | 0;
      } else if (d.t === "snap" && !netHost && s && mode === "online") {
        const mine = s.karts[myId];
        const keep = { bits: mine.bits };
        const events = s.events;
        apply(s, d.s);
        s.events = events;
        s.karts[myId].bits = keep.bits;
      }
    }

    // ---------------------------------------------------------------- one sim tick
    function inputs() {
      const arr = [];
      const mine = keyBits | touchBits;
      s.karts.forEach((k, i) => { arr[i] = k.bits; });
      arr[myId] = mine;
      if (mode === "online" && netHost) netIds.forEach((id, i) => { if (i !== myId) arr[i] = remoteBits[id] | 0; });
      return arr;
    }

    function tick(now) {
      const bitsNow = keyBits | touchBits;
      if (mode === "online" && net) {
        if (!netHost && (bitsNow !== lastSentBits || now - lastSendAt > 120)) {
          net.api.send({ t: "in", b: bitsNow });
          lastSentBits = bitsNow;
          lastSendAt = now;
        }
      }
      step(s, inputs());
      if (mode === "online" && net && netHost && s.frame % 3 === 0) net.api.send({ t: "snap", s: snapshot(s) });

      const k = s.karts[myId];
      for (const e of drain(s)) {
        sfx.event(e, myId);
        if (e.t === "lap" && e.id === myId) onMyLap(e);
        if (e.t === "item" && e.id === myId) flash("Got " + ITEMS[e.item].name + "!");
        if (e.t === "hit" && e.id === myId) flash("Spun out!");
        if (e.t === "boost" && e.id === myId) flash(e.level === 2 ? "MEGA BOOST!" : "Boost!");
        if (e.t === "lap" && e.id === myId && e.n === LAPS) flash("FINISH!");
        if (e.t === "go") flash("GO!");
        if (e.t === "done") onDone();
      }
      const left = Math.ceil((COUNTDOWN - s.frame) / FPS);
      if (s.phase === "countdown" && left !== lastCount) {
        lastCount = left;
        sfx.beep(440, 0.15, "square", 0.15);
      }
      if (s.phase === "race" && lastCount !== 0) { lastCount = 0; sfx.beep(880, 0.4, "square", 0.18); }

      if (k.lapStart >= 0 && k.finished == null) Ghost.record(curRec, k, s.t - k.lapStart);

      // particles: drift sparks, boost flames, glitter trails
      if (!reduced) {
        for (const kk of s.karts) {
          const co = Math.cos(kk.a), si = Math.sin(kk.a);
          if (kk.drift && s.frame % 2 === 0) {
            const col = kk.charge >= 95 ? "#ff8cf0" : kk.charge >= 45 ? "#ffb35c" : "#bfe9ff";
            particles.push({ x: kk.x - co * 14, y: kk.y - si * 14, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, l: 18, c: col });
          }
          if (kk.boost > 0) particles.push({ x: kk.x - co * 16, y: kk.y - si * 16, vx: -co * 2 + (Math.random() - 0.5), vy: -si * 2 + (Math.random() - 0.5), l: 14, c: "#ffd54a" });
        }
        for (const p of s.shots) particles.push({ x: p.x, y: p.y, vx: (Math.random() - 0.5), vy: (Math.random() - 0.5), l: 22, c: Math.random() < 0.5 ? "#ff9ee0" : "#fff" });
        if (particles.length > 400) particles.splice(0, particles.length - 400);
      }
      for (const p of particles) { p.x += p.vx; p.y += p.vy; p.l--; }
      particles = particles.filter((p) => p.l > 0);

      sfx.engine(k.speed, k.boost > 0, !!k.drift, s.phase !== "countdown" && screen === "race");
    }

    function flash(text) { banner = { text, t: 90 }; }

    function onMyLap(e) {
      const tid = s.tid;
      const prev = store.get("kart.best." + tid);
      if (e.best && (prev == null || e.ms < prev)) {
        store.set("kart.best." + tid, e.ms);
        // ghost the best lap ever, not just the best this race
        store.set("kart.ghost." + tid, { ms: e.ms, pts: curRec });
        ghostBuf = curRec;
      }
      curRec = [];
    }

    async function onDone() {
      const k = s.karts[myId];
      // short beat so the finish banner is seen before the results cover it
      setTimeout(() => { if (!dead && screen === "race") results(); }, 1800);
      if (k.best != null) {
        submitted = ctx.leaderboard.submit("kart", k.best, { track: s.tid });
      }
    }

    // ---------------------------------------------------------------- results
    function results() {
      screen = "results";
      clearKeys();
      sfx.engine(0, false, false, false);
      clearUi();
      const k = s.karts[myId];
      const box = el("div", "kart-panel kart-results");
      const place = s.results?.find((r) => r.id === myId)?.place || k.rank;
      box.append(el("h2", "kart-title", mode === "trial" ? "TIME TRIAL" : ordinal(place) + " PLACE"));
      const list = el("ol", "kart-standings");
      for (const r of s.results || []) {
        const li = el("li", r.id === myId ? "me" : "");
        li.append(el("span", "", r.name), el("span", "", r.ms != null ? fmt(r.ms) : "DNF"));
        list.append(li);
      }
      box.append(list);
      box.append(el("p", "kart-bestlap", "Best lap " + fmt(k.best) + (k.best != null && k.best === store.get("kart.best." + s.tid) ? "  (your record)" : "")));
      const status = el("p", "kart-status", k.best == null ? "No full lap this time, so nothing to post." : "Posting your lap...");
      box.append(status);
      const slot = el("div", "kart-board");
      box.append(slot);
      const row = el("div", "kart-row");
      const again = mode === "online" ? null : button("Race again", () => startLocal(mode), "primary");
      if (again) row.append(again);
      row.append(button("Menu", () => { if (mode === "online") leaveNet(); menu(); }));
      box.append(row);
      ui.append(box);
      board = ctx.leaderboard.mountCanvas(slot, "kart", { title: "PIXIE KART", me: me?.username, width: 420, height: 300 });
      Promise.resolve(submitted).then((res) => {
        if (dead) return;
        if (k.best == null) return;
        if (!res) status.textContent = "Could not post your lap (sign in to the lounge to join the board).";
        else {
          status.textContent = res.improved ? "New personal best on the board!" : "Posted. Your board best still stands.";
          board?.refresh();
        }
      });
    }
    const ordinal = (n) => n + (["th", "st", "nd", "rd"][(n % 100 >> 3) ^ 1 && n % 10 < 4 ? n % 10 : 0]);

    // ---------------------------------------------------------------- drawing
    function drawDriver(k, isMe) {
      g.save();
      g.beginPath();
      g.arc(0, 1, 7, 0, 7);
      g.clip();
      g.fillStyle = "#2b1260";
      g.fillRect(-8, -8, 16, 16);
      if (isMe && driverImgs.length) {
        for (const img of driverImgs) {
          const sc = 16 / Math.max(img.width, img.height) * 1.6;
          g.drawImage(img, -img.width * sc / 2, -img.height * sc * 0.25, img.width * sc, img.height * sc);
        }
      } else {
        g.fillStyle = "#fff";
        g.font = "bold 10px monospace";
        g.textAlign = "center";
        g.textBaseline = "middle";
        g.fillText(k.name[0] || "?", 0, 1);
      }
      g.restore();
    }

    function drawKart(k, alpha, isMe, ghost) {
      g.save();
      g.globalAlpha = alpha;
      g.translate(k.x, k.y);
      g.rotate(k.a + Math.PI / 2);
      if (!ghost) { g.fillStyle = "rgba(0,0,0,.28)"; g.fillRect(-10, -12, 24, 32); }
      g.fillStyle = "#14091f";
      for (const [wx, wy] of [[-12, -11], [8, -11], [-12, 7], [8, 7]]) g.fillRect(wx, wy, 5, 9);
      g.fillStyle = ghost ? "#bfe9ff" : k.color;
      g.beginPath();
      g.roundRect(-9, -15, 18, 30, 5);
      g.fill();
      g.fillStyle = "rgba(255,255,255,.35)";
      g.fillRect(-6, -13, 12, 4);
      g.fillStyle = "#14091f";
      g.fillRect(-10, 12, 20, 3);
      if (!ghost) drawDriver(k, isMe);
      if (k.shield) {
        g.strokeStyle = "rgba(127,216,255,.9)";
        g.fillStyle = "rgba(127,216,255,.2)";
        g.lineWidth = 2;
        g.beginPath(); g.arc(0, 0, 22, 0, 7); g.fill(); g.stroke();
      }
      g.restore();
    }

    function drawWorld(now) {
      const tr = s.track;
      const layer = layerFor(tr);
      const me = s.karts[myId];
      const ahead = Math.min(70, me.speed * 12);
      const tx = me.x + Math.cos(me.a) * ahead, ty = me.y + Math.sin(me.a) * ahead;
      cam.x += (tx - cam.x) * 0.2;
      cam.y += (ty - cam.y) * 0.2;
      cam.a += wrapAngle(me.a - cam.a) * 0.12;
      const zoom = 1.0 - Math.min(0.12, me.speed * 0.02) - (me.boost > 0 ? 0.04 : 0);

      g.fillStyle = tr.def.theme.grass;
      g.fillRect(0, 0, W, H);
      g.save();
      g.translate(W / 2, H * 0.68);
      g.rotate(-Math.PI / 2 - cam.a);
      g.scale(zoom, zoom);
      g.translate(-cam.x, -cam.y);
      g.drawImage(layer.canvas, layer.ox, layer.oy, layer.canvas.width / LAYER_SCALE, layer.canvas.height / LAYER_SCALE);

      for (const b of s.boxes) {
        if (b.t > 0) continue;
        g.save();
        g.translate(b.x, b.y);
        g.rotate(now / 600);
        g.fillStyle = `hsl(${(now / 6) % 360} 90% 65%)`;
        g.fillRect(-13, -13, 26, 26);
        g.strokeStyle = "#fff";
        g.lineWidth = 3;
        g.strokeRect(-13, -13, 26, 26);
        g.rotate(-now / 600 - (cam.a + Math.PI / 2) * 0 + 0);
        g.restore();
      }
      for (const th of s.thorns) {
        g.save();
        g.translate(th.x, th.y);
        g.fillStyle = "#3bd77b";
        g.beginPath();
        for (let i = 0; i < 10; i++) {
          const r = i % 2 ? 4 : 12, an = (i / 10) * Math.PI * 2;
          g.lineTo(Math.cos(an) * r, Math.sin(an) * r);
        }
        g.closePath();
        g.fill();
        g.restore();
      }
      for (const p of particles) {
        g.fillStyle = p.c;
        g.globalAlpha = Math.min(1, p.l / 10);
        g.fillRect(p.x - 2, p.y - 2, 4, 4);
      }
      g.globalAlpha = 1;
      for (const p of s.shots) {
        g.fillStyle = "#ff9ee0";
        g.beginPath(); g.arc(p.x, p.y, 9, 0, 7); g.fill();
        g.fillStyle = "#fff";
        g.beginPath(); g.arc(p.x, p.y, 4, 0, 7); g.fill();
      }
      // ghost of your best lap
      if (ghostBuf && me.lapStart >= 0 && me.finished == null) {
        const gp = Ghost.at(ghostBuf, s.t - me.lapStart);
        if (gp) drawKart({ x: gp.x, y: gp.y, a: gp.a, color: "#bfe9ff", name: "" }, 0.45, false, true);
      }
      const order = s.karts.slice().sort((a, b) => a.y - b.y);
      for (const k of order) drawKart(k, 1, k.id === myId, false);
      g.restore();
    }

    function text(str, x, y, size, color, align = "left") {
      g.font = `bold ${size}px "Courier New", monospace`;
      g.textAlign = align;
      g.textBaseline = "top";
      g.fillStyle = "#000";
      g.fillText(str, x + 1, y + 1);
      g.fillStyle = color;
      g.fillText(str, x, y);
    }

    function drawHud() {
      const k = s.karts[myId];
      const lapNow = Math.min(LAPS, Math.max(1, Math.floor(k.s / s.track.N) + 1));
      const lapMs = k.lapStart >= 0 && k.finished == null ? Math.round(((s.t - k.lapStart) * 1000) / FPS) : null;
      g.fillStyle = "rgba(10,5,25,.55)";
      g.fillRect(6, 6, 170, 62);
      text(`LAP ${k.finished != null ? LAPS : lapNow}/${LAPS}`, 12, 10, 16, "#fff");
      text("TIME " + fmt(lapMs), 12, 30, 12, "#e6dcff");
      text("BEST " + fmt(k.best ?? store.get("kart.best." + s.tid)), 12, 46, 12, "#ffd54a");

      text(ordinal(k.rank), W - 12, 8, 30, "#ffd54a", "right");
      text("/" + s.karts.length, W - 12, 40, 12, "#e6dcff", "right");

      // item slot
      g.fillStyle = "rgba(10,5,25,.6)";
      g.fillRect(W / 2 - 30, 6, 60, 46);
      g.strokeStyle = k.item ? ITEMS[k.item].color : "#6a5a9a";
      g.lineWidth = 2;
      g.strokeRect(W / 2 - 30, 6, 60, 46);
      if (k.item) {
        g.fillStyle = ITEMS[k.item].color;
        g.beginPath(); g.arc(W / 2, 24, 11, 0, 7); g.fill();
        text(ITEMS[k.item].name, W / 2, 39, 8, "#fff", "center");
      } else text("ITEM", W / 2, 20, 12, "#6a5a9a", "center");

      // speed + drift charge
      g.fillStyle = "rgba(10,5,25,.55)";
      g.fillRect(6, H - 22, 130, 14);
      g.fillStyle = k.boost > 0 ? "#ffd54a" : "#7cf0a5";
      g.fillRect(8, H - 20, 126 * Math.min(1, k.speed / (MAX * 1.4)), 10);
      if (k.drift) {
        g.fillStyle = k.charge >= 95 ? "#ff8cf0" : k.charge >= 45 ? "#ffb35c" : "#bfe9ff";
        g.fillRect(8, H - 32, 126 * Math.min(1, k.charge / 95), 6);
      }

      // minimap
      const tr = s.track, b = tr.bounds, mw = 110, mh = 90;
      const sc = Math.min((mw - 12) / (b.maxX - b.minX), (mh - 12) / (b.maxY - b.minY));
      const mx = W - mw - 6, my = H - mh - 6;
      const px = (x) => mx + mw / 2 + (x - (b.minX + b.maxX) / 2) * sc;
      const py = (y) => my + mh / 2 + (y - (b.minY + b.maxY) / 2) * sc;
      g.fillStyle = "rgba(10,5,25,.55)";
      g.fillRect(mx, my, mw, mh);
      g.strokeStyle = "#a99be0";
      g.lineWidth = 3;
      g.beginPath();
      for (let i = 0; i <= tr.N; i += 3) g[i ? "lineTo" : "moveTo"](px(tr.x[i % tr.N]), py(tr.y[i % tr.N]));
      g.closePath();
      g.stroke();
      for (const kk of s.karts) {
        g.fillStyle = kk.color;
        g.beginPath(); g.arc(px(kk.x), py(kk.y), kk.id === myId ? 4 : 2.5, 0, 7); g.fill();
        if (kk.id === myId) { g.strokeStyle = "#fff"; g.lineWidth = 1; g.stroke(); }
      }

      if (s.phase === "countdown") {
        const left = Math.ceil((COUNTDOWN - s.frame) / FPS);
        text(String(left), W / 2, H / 2 - 60, 80, "#fff", "center");
        text(`${s.track.def.name.toUpperCase()}  ·  ${LAPS} LAPS`, W / 2, H / 2 + 30, 14, "#e6dcff", "center");
      }
      if (banner.t > 0) {
        banner.t--;
        text(banner.text, W / 2, H * 0.28, 28, "#ffd54a", "center");
      }
      if (k.finished != null && s.phase !== "done") text("Waiting for the others...", W / 2, H - 60, 12, "#e6dcff", "center");
      if (k.speed < 0.4 && s.phase === "race" && k.finished == null && k.stuck > 60) text("Press R to reset", W / 2, H - 50, 12, "#fff", "center");
    }

    function drawMenuBackdrop(now) {
      const grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, "#14082e");
      grad.addColorStop(1, "#2b1260");
      g.fillStyle = grad;
      g.fillRect(0, 0, W, H);
      g.fillStyle = "#57527a";
      g.fillRect(0, H * 0.7, W, H * 0.3);
      g.fillStyle = "rgba(255,255,255,.35)";
      for (let i = 0; i < 8; i++) g.fillRect(((i * 120 - now / 4) % (W + 120)) - 60 + (W + 120) * ((i * 120 - now / 4) % (W + 120) < -60 ? 1 : 0), H * 0.85, 60, 5);
    }

    function frame(now) {
      if (dead) return;
      raf = requestAnimationFrame(frame);
      acc += Math.min(100, now - last);
      last = now;
      if (screen === "race" && s) {
        while (acc >= STEP_MS) { tick(now); acc -= STEP_MS; }
        drawWorld(now);
        drawHud();
      } else {
        acc = 0;
        if (screen === "results" && s) { drawWorld(now); }
        else drawMenuBackdrop(now);
      }
    }

    menu();
    raf = requestAnimationFrame(frame);

    return {
      destroy() {
        dead = true;
        cancelAnimationFrame(raf);
        window.removeEventListener("keydown", onKey);
        window.removeEventListener("keyup", onKey);
        window.removeEventListener("blur", clearKeys);
        board?.destroy();
        leaveNet();
        sfx.engine(0, false, false, false);
        sfx.mute(sfx.muted());
        host.classList.remove("kart-host");
      },
    };
  }

  root.ArcadeGames?.register({
    id: "kart",
    title: "Pixie Kart",
    blurb: "Drift, boost and throw glitter. Three laps, best lap time on the board.",
    icon: ICON,
    mount,
  });
  return api;
});
