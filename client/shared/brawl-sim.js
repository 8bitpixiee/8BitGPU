(function (root, factory) {
  const api = factory(root.BrawlRaces || (typeof require === "function" ? require("./brawl-races.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BrawlSim = api;
})(typeof self !== "undefined" ? self : this, function (Races) {
  const { RACES, SPECIALS } = Races;

  // The whole fight lives here. The browser runs it for the CPU and to predict your own fighter, the
  // server runs the same code as the referee, so it never uses Math.random or the clock.
  // One step is 1/60th of a second and takes the held buttons of both fighters.
  const W = 960;
  const FLOOR = 450;
  const LEFT = 70;
  const RIGHT = 890;
  const FPS = 60;
  const INTRO = 100;
  const ROUND = 60 * FPS;
  const ROUND_END = 170;
  const WINS_NEEDED = 2;
  const BODY_HALF = 28;
  const BODY_HEIGHT = 130;
  const GRAVITY = 0.85;
  const JUMP = 17;
  const WALK = 4.2;
  const SPECIAL_COST = 50;

  const BIT = { L: 1, R: 2, U: 4, B: 8, A: 16, H: 32, S: 64 };

  const MOVES = {
    light: { kind: "melee", startup: 4, active: 3, recover: 9, reach: 72, dmg: 6, kb: 3, stun: 12 },
    heavy: { kind: "melee", startup: 10, active: 4, recover: 17, reach: 92, dmg: 14, kb: 9, stun: 20, lunge: 3 },
  };

  const fighter = (side, race) => {
    const stats = RACES[race] || RACES.pixie;
    return {
      side, race: RACES[race] ? race : "pixie",
      x: side ? 700 : 260, y: FLOOR, vx: 0, vy: 0, face: side ? -1 : 1,
      hp: stats.hp, max: stats.hp, meter: 0,
      st: "idle", atk: "", at: 0, landed: 0, air: stats.airJumps,
      stun: 0, bs: 0, armor: 0, buff: 0, combo: 0, prev: 0, buf: "", bt: 0,
    };
  };

  function create(races) {
    return {
      frame: 0, phase: "intro", pt: INTRO, round: 1, wins: [0, 0], timer: ROUND, hitstop: 0, rw: -1,
      winner: -1, over: false, f: [fighter(0, races[0]), fighter(1, races[1])], p: [], ev: [],
    };
  }

  const clone = (s) => ({ ...s, wins: [...s.wins], f: s.f.map((x) => ({ ...x })), p: s.p.map((x) => ({ ...x })), ev: [] });

  // what the server sends, events are rebuilt by whoever runs the steps
  const snapshot = (s) => {
    const copy = clone(s);
    delete copy.ev;
    return copy;
  };

  const moveOf = (me) => (me.atk === "special" ? SPECIALS[RACES[me.race].special] : MOVES[me.atk]);
  const total = (m) => {
    if (m.kind === "dash") return m.startup + m.dur + m.recover;
    if (m.kind === "flurry") return m.startup + m.hits * m.gap + m.recover;
    return m.startup + m.active + m.recover;
  };

  const buffMul = (me, key) => (me.buff > 0 ? SPECIALS.overclock[key] : 1);

  const overlaps = (a0, a1, b0, b1) => a0 < b1 && b0 < a1;

  // the front of the attacker against the body of the defender
  function meleeHit(me, opp, reach) {
    const x0 = me.face > 0 ? me.x : me.x - reach;
    const x1 = me.face > 0 ? me.x + reach : me.x;
    return (
      overlaps(x0, x1, opp.x - BODY_HALF, opp.x + BODY_HALF) &&
      overlaps(me.y - 115, me.y - 15, opp.y - BODY_HEIGHT, opp.y)
    );
  }

  function applyHit(s, att, def, m, dir) {
    let dmg = m.dmg * (att.buff > 0 ? SPECIALS.overclock.dmgMul : 1);
    const heavy = m.dmg >= 12;
    let kind = "hit";
    if (def.armor > 0) {
      dmg *= 0.6;
      def.vx += dir * m.kb * 0.2;
      kind = "armor";
    } else if (def.st === "block" && def.y >= FLOOR) {
      dmg *= 0.15;
      def.stun = 7;
      def.bs = 1;
      def.vx = dir * m.kb * 0.6;
      kind = "block";
    } else {
      dmg *= Math.pow(0.88, def.combo);
      def.combo++;
      def.stun = m.stun;
      def.bs = 0;
      def.st = "hit";
      def.vx = dir * m.kb;
      if (def.y < FLOOR) def.vy = -5;
      else if (m.kb >= 9) {
        def.vy = -6;
        def.y -= 1;
      }
      def.atk = "";
      def.armor = 0;
      def.bt = 0;
    }
    def.hp = Math.max(0, def.hp - dmg);
    att.meter = Math.min(100, att.meter + dmg * (kind === "hit" ? 1.2 : 0.4));
    def.meter = Math.min(100, def.meter + dmg * 0.6);
    if (kind !== "block" && (def.x <= LEFT + 1 || def.x >= RIGHT - 1)) att.vx = -dir * m.kb * 0.5;
    s.hitstop = kind === "block" ? 2 : heavy ? 6 : 3;
    s.ev.push({ k: kind, x: def.x, y: def.y - 80, d: Math.round(dmg), side: def.side, big: heavy, f: s.frame });
    return true;
  }

  function physics(me, friction) {
    const stats = RACES[me.race];
    if (me.y < FLOOR || me.vy < 0) me.vy += GRAVITY * stats.gravity;
    me.x += me.vx;
    me.y += me.vy;
    if (me.y >= FLOOR) {
      me.y = FLOOR;
      me.vy = 0;
      me.air = stats.airJumps;
      if (friction) me.vx *= friction;
    }
    me.x = Math.max(LEFT, Math.min(RIGHT, me.x));
  }

  function startAttack(me, kind) {
    me.atk = kind;
    me.at = 0;
    me.landed = 0;
    me.st = "atk";
    me.vx = 0;
  }

  function runAttack(s, me, opp) {
    const m = moveOf(me);
    const t = me.at;
    const live = (from, len) => t >= from && t < from + len;
    me.armor = m.armor && t < m.startup + m.active ? 1 : 0;
    if (m.kind === "melee") {
      if (m.lunge && t === m.startup) me.vx = me.face * m.lunge;
      if (live(m.startup, m.active) && !(me.landed & 1) && meleeHit(me, opp, m.reach)) {
        me.landed |= 1;
        applyHit(s, me, opp, m, me.face);
      }
    } else if (m.kind === "area") {
      if (t === m.startup) {
        if (m.heal) me.hp = Math.min(me.max, me.hp + m.heal);
        s.ev.push({ k: "burst", x: me.x, y: me.y - 40, r: m.reach, side: me.side, f: s.frame });
      }
      const close = Math.abs(opp.x - me.x) <= m.reach && Math.abs(opp.y - me.y) < 120;
      if (live(m.startup, m.active) && !(me.landed & 1) && close && (!m.groundOnly || opp.y >= FLOOR)) {
        me.landed |= 1;
        applyHit(s, me, opp, m, opp.x >= me.x ? 1 : -1);
      }
    } else if (m.kind === "dash") {
      if (live(m.startup, m.dur)) {
        me.vx = me.face * m.vx * buffMul(me, "speedMul");
        if (!(me.landed & 1) && meleeHit(me, opp, m.reach)) {
          me.landed |= 1;
          applyHit(s, me, opp, m, me.face);
        }
      } else if (t === m.startup + m.dur) me.vx *= 0.4;
    } else if (m.kind === "proj") {
      for (const shot of m.shots) {
        if (t !== m.startup + shot.at) continue;
        s.p.push({
          o: me.side, x: me.x + me.face * 40, y: shot.ground ? FLOOR - 14 : me.y - 80, vx: shot.vx * me.face, vy: shot.vy,
          g: shot.g, r: shot.r, dmg: shot.dmg, kb: shot.kb, stun: shot.stun, life: shot.life, ground: Boolean(shot.ground),
          race: me.race,
        });
        s.ev.push({ k: "shoot", x: me.x, y: me.y - 80, side: me.side, f: s.frame });
      }
    } else if (m.kind === "teleport") {
      if (t === m.startup) {
        const toward = opp.x >= me.x ? 1 : -1;
        let x = opp.x + toward * m.behind;
        if (x < LEFT || x > RIGHT) x = opp.x - toward * m.behind;
        s.ev.push({ k: "vanish", x: me.x, y: me.y - 60, side: me.side, f: s.frame });
        me.x = Math.max(LEFT, Math.min(RIGHT, x));
        me.face = opp.x >= me.x ? 1 : -1;
        s.ev.push({ k: "appear", x: me.x, y: me.y - 60, side: me.side, f: s.frame });
      }
      if (live(m.startup, m.active) && !(me.landed & 1) && meleeHit(me, opp, m.reach)) {
        me.landed |= 1;
        applyHit(s, me, opp, m, me.face);
      }
    } else if (m.kind === "buff") {
      if (t === m.startup) {
        me.buff = m.dur;
        s.ev.push({ k: "buff", x: me.x, y: me.y - 70, side: me.side, f: s.frame });
      }
    } else if (m.kind === "flurry") {
      if (live(m.startup, m.hits * m.gap)) me.vx = me.face * m.drift;
      for (let i = 0; i < m.hits; i++) {
        if (live(m.startup + i * m.gap, 3) && !(me.landed & (1 << i)) && meleeHit(me, opp, m.reach)) {
          me.landed |= 1 << i;
          applyHit(s, me, opp, m, me.face);
        }
      }
    }
    // a hit on the attacker can have cancelled the move above
    if (!me.atk) return;
    me.at = t + 1;
    physics(me, 0.85);
    if (me.at >= total(m)) {
      me.atk = "";
      me.st = "idle";
      me.armor = 0;
      if (me.bt > 0 && me.buf) {
        const next = me.buf;
        me.buf = "";
        me.bt = 0;
        if (next !== "special" || me.meter >= SPECIAL_COST) {
          if (next === "special") me.meter -= SPECIAL_COST;
          startAttack(me, next);
        }
      }
    }
  }

  function control(s, me, opp, bits) {
    const stats = RACES[me.race];
    const pressed = bits & ~me.prev;
    me.prev = bits;
    if (me.bt > 0) me.bt--;
    if (me.st === "ko" || me.st === "win") return physics(me, 0.9);
    if (me.buff > 0) me.buff--;
    if (me.stun > 0) {
      me.stun--;
      me.st = me.bs ? "block" : "hit";
      physics(me, 0.85);
      if (me.stun === 0) {
        me.st = "idle";
        me.combo = 0;
        me.bs = 0;
      }
      return;
    }
    const want = pressed & BIT.A ? "light" : pressed & BIT.H ? "heavy" : pressed & BIT.S ? "special" : "";
    if (me.atk) {
      if (want) {
        me.buf = want;
        me.bt = 8;
      }
      return runAttack(s, me, opp);
    }
    const grounded = me.y >= FLOOR;
    const dir = (bits & BIT.R ? 1 : 0) - (bits & BIT.L ? 1 : 0);
    const speed = WALK * stats.speed * buffMul(me, "speedMul");
    if (want && (want !== "special" || me.meter >= SPECIAL_COST)) {
      if (want === "special") me.meter -= SPECIAL_COST;
      startAttack(me, want);
      return runAttack(s, me, opp);
    }
    if (grounded) {
      me.face = opp.x >= me.x ? 1 : -1;
      if (bits & BIT.B) {
        me.st = "block";
        me.vx = 0;
      } else {
        me.vx = dir * speed;
        me.st = dir ? "walk" : "idle";
        if (pressed & BIT.U) me.vy = -JUMP * stats.jump;
      }
    } else {
      me.vx = Math.max(-speed, Math.min(speed, me.vx + dir * 0.35));
      me.st = "jump";
      if (pressed & BIT.U && me.air > 0) {
        me.air--;
        me.vy = -JUMP * stats.jump * 0.9;
        s.ev.push({ k: "flap", x: me.x, y: me.y - 20, side: me.side, f: s.frame });
      }
    }
    physics(me, 0);
    if (me.y < FLOOR) me.st = "jump";
  }

  function projectiles(s) {
    s.p = s.p.filter((p) => {
      p.x += p.vx;
      p.vy += p.g;
      p.y += p.vy;
      if (p.ground) p.y = FLOOR - 14;
      p.life--;
      const def = s.f[1 - p.o];
      const nearX = Math.max(def.x - BODY_HALF, Math.min(p.x, def.x + BODY_HALF));
      const nearY = Math.max(def.y - BODY_HEIGHT, Math.min(p.y, def.y));
      if (Math.hypot(p.x - nearX, p.y - nearY) <= p.r) {
        applyHit(s, s.f[p.o], def, p, p.vx >= 0 ? 1 : -1);
        return false;
      }
      return p.life > 0 && p.x > -40 && p.x < W + 40 && p.y < FLOOR + 40;
    });
  }

  function separate(s) {
    const [a, b] = s.f;
    const gap = BODY_HALF * 2 - Math.abs(a.x - b.x);
    if (gap > 0 && Math.abs(a.y - b.y) < 100) {
      const push = gap / 2 + 0.01;
      const dir = a.x <= b.x ? -1 : 1;
      a.x = Math.max(LEFT, Math.min(RIGHT, a.x + dir * push));
      b.x = Math.max(LEFT, Math.min(RIGHT, b.x - dir * push));
    }
  }

  function endRound(s, why) {
    const [a, b] = s.f;
    const winner = a.hp === b.hp ? -1 : a.hp > b.hp ? 0 : 1;
    if (winner >= 0) s.wins[winner]++;
    s.rw = winner;
    for (const me of s.f) {
      me.atk = "";
      me.armor = 0;
      me.stun = 0;
      me.st = winner === me.side ? "win" : winner === -1 ? "idle" : "ko";
      if (me.st === "ko") {
        me.vy = -6;
        me.vx = (me.side ? 1 : -1) * 4;
        me.y -= 1;
      }
    }
    s.p = [];
    s.phase = winner >= 0 && s.wins[winner] >= WINS_NEEDED ? "matchend" : "roundend";
    s.pt = ROUND_END;
    if (s.phase === "matchend") {
      s.winner = winner;
      s.over = true;
    }
    s.ev.push({ k: why, side: winner, f: s.frame });
  }

  function nextRound(s) {
    s.round++;
    s.timer = ROUND;
    s.phase = "intro";
    s.pt = INTRO;
    s.rw = -1;
    s.f = s.f.map((me) => fighter(me.side, me.race));
  }

  function step(s, bits0, bits1) {
    s.ev = [];
    s.frame++;
    if (s.hitstop > 0) {
      s.hitstop--;
      return s;
    }
    const [a, b] = s.f;
    if (s.phase === "intro") {
      for (const me of s.f) physics(me, 0);
      if (--s.pt <= 0) {
        s.phase = "fight";
        s.ev.push({ k: "fight", f: s.frame });
      }
      return s;
    }
    if (s.phase === "fight") {
      s.timer--;
      // who moves first alternates so neither side always wins a trade
      if (s.frame & 1) {
        control(s, b, a, bits1);
        control(s, a, b, bits0);
      } else {
        control(s, a, b, bits0);
        control(s, b, a, bits1);
      }
      projectiles(s);
      separate(s);
      for (const me of s.f) me.meter = Math.min(100, me.meter + 0.03);
      if (a.hp <= 0 || b.hp <= 0) endRound(s, "ko");
      else if (s.timer <= 0) endRound(s, "time");
      return s;
    }
    // between rounds the fighters just settle
    control(s, a, b, 0);
    control(s, b, a, 0);
    if (!s.over && --s.pt <= 0) nextRound(s);
    return s;
  }

  return {
    W, FLOOR, LEFT, RIGHT, FPS, INTRO, ROUND, ROUND_END, WINS_NEEDED, BODY_HALF, BODY_HEIGHT, SPECIAL_COST,
    BIT, MOVES, create, clone, snapshot, step, moveOf, total, meleeHit,
  };
});
