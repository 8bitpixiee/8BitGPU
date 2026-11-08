(function (root, factory) {
  const api = factory(
    root.BrawlSim || (typeof require === "function" ? require("./brawl-sim.js") : null),
    root.BrawlRaces || (typeof require === "function" ? require("./brawl-races.js") : null),
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BrawlAI = api;
})(typeof self !== "undefined" ? self : this, function (Sim, Races) {
  const { BIT, SPECIAL_COST, SUPER_COST, FLOOR } = Sim;

  // how slow to react, how often to go in, how often a hit gets blocked, how often it finishes a combo,
  // throws a guard, uses a super, and anti-airs a jump
  const LEVELS = {
    easy: { react: 16, brave: 0.3, guard: 0.15, think: 20, combo: 0.1, grab: 0.05, sup: 0.2, anti: 0.1 },
    normal: { react: 9, brave: 0.55, guard: 0.4, think: 12, combo: 0.4, grab: 0.25, sup: 0.5, anti: 0.35 },
    hard: { react: 3, brave: 0.8, guard: 0.7, think: 6, combo: 0.75, grab: 0.5, sup: 0.8, anti: 0.7 },
    brutal: { react: 1, brave: 0.9, guard: 0.85, think: 4, combo: 0.95, grab: 0.7, sup: 1, anti: 0.9 },
  };

  // a personality bends the numbers above and picks where the cpu wants to stand
  const STYLES = {
    rushdown: { range: 70, brave: 0.2, guard: -0.1, jump: 1.5, grab: 1 },
    zoner: { range: 300, brave: -0.2, guard: 0, jump: 0.5, grab: 0.3 },
    turtle: { range: 110, brave: -0.35, guard: 0.25, jump: 0.4, grab: 1.2 },
    grappler: { range: 60, brave: 0.1, guard: -0.05, jump: 0.6, grab: 2 },
    trickster: { range: 150, brave: 0.05, guard: 0.05, jump: 2.5, grab: 0.7 },
  };

  // small seeded random so a CPU fight is repeatable in tests
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

  // the style a race suits when nobody picked one: shooters stand back, brawlers get in close
  function styleOf(race) {
    const kind = Races.specialOf(race).kind;
    if (kind === "proj") return "zoner";
    if (kind === "teleport") return "trickster";
    if (kind === "buff") return "turtle";
    if (kind === "area") return "grappler";
    return "rushdown";
  }

  const preferredRange = (race, style = styleOf(race)) => STYLES[style].range;

  function create({ side = 1, level = "normal", style, seed = 1 } = {}) {
    const base = LEVELS[level] || LEVELS.normal;
    const rand = mulberry(seed);
    let blockUntil = -1;
    let nextThink = 0;
    let seenAttack = -1;
    let plan = 0;
    let last = 0;
    let brain = null;
    let flavor = null;

    return function decide(s) {
      if (s.phase !== "fight") return (last = 0);
      const me = s.f[side];
      const opp = s.f[1 - side];
      if (!brain) {
        flavor = STYLES[style] || STYLES[styleOf(me.race)];
        brain = {
          ...base,
          brave: Math.max(0.05, Math.min(0.97, base.brave + flavor.brave)),
          guard: Math.max(0.05, Math.min(0.95, base.guard + flavor.guard)),
          grab: base.grab * flavor.grab,
        };
      }
      const now = s.frame;
      const toward = opp.x >= me.x ? BIT.R : BIT.L;
      const away = toward === BIT.R ? BIT.L : BIT.R;
      const dist = Math.abs(opp.x - me.x);
      const grounded = me.y >= FLOOR;
      const oppAir = opp.y < FLOOR - 40;
      // press a button on one frame, let go on the next so it counts as a new press
      const fresh = !(last & (BIT.A | BIT.H | BIT.S | BIT.T));

      // see an attack start, maybe put the guard up once the reaction time has passed
      if (opp.atk && opp.at === 0 && seenAttack !== now && dist < 170) {
        seenAttack = now;
        // a nearly broken guard is not worth hiding behind
        if (rand() < brain.guard && me.gd < 28) blockUntil = now + brain.react + 18;
      }
      if (me.stun > 0) return (last = 0);

      if (me.atk) {
        // finish a combo: once a hit connects, tap the next button inside the cancel window
        const m = Sim.moveOf(me);
        if (Sim.CANCELS[me.atk] && me.landed & 1 && fresh && me.at >= m.startup + (m.active || 0) - 1 && rand() < brain.combo / 3) {
          let pick = 0;
          if (me.atk === "light") pick = me.chain < Sim.MAX_CHAIN && rand() < 0.5 ? BIT.A : BIT.H;
          else if (me.atk === "airlight") pick = BIT.H;
          if (me.atk !== "airlight") {
            if (me.meter >= SUPER_COST && rand() < brain.sup) pick = BIT.B | BIT.S;
            else if (me.meter >= SPECIAL_COST && me.atk !== "special" && (me.atk === "heavy" || rand() < 0.5)) pick = BIT.S;
          }
          return (last = pick);
        }
        return (last = 0);
      }

      let bits = 0;
      if (now < blockUntil && now >= blockUntil - 18 && grounded) {
        last = BIT.B;
        return last;
      }

      const range = flavor.range;
      const special = Races.specialOf(me.race);
      if (now >= nextThink) {
        nextThink = now + brain.think + Math.floor(rand() * brain.think);
        plan = rand() < brain.brave ? 1 : rand() < 0.5 ? 0 : -1;
      }

      if (dist > range + 30) bits |= plan >= 0 ? toward : 0;
      else if (dist < range - 40 && range > 150) bits |= away;
      else if (plan < 0 && dist < 120) bits |= away;

      if (fresh && grounded) {
        // a super from a full meter, when it can actually reach
        const superKind = Races.superOf(me.race).kind;
        if (me.meter >= SUPER_COST && (superKind === "proj" ? dist > 120 : dist < 240) && rand() < 0.04 + brain.sup * 0.06) {
          return (last = BIT.B | BIT.S);
        }
        // a blocker is a free throw, so is someone standing still right next to you
        if (dist < 58 && (opp.st === "block" || opp.st === "idle") && opp.y >= FLOOR && rand() < 0.03 + brain.grab * 0.1) {
          return (last = BIT.T);
        }
        // knock a jump-in out of the air
        if (oppAir && dist < 110 && rand() < brain.anti * 0.5) return (last = BIT.H);
        if (rand() < 0.12 + brain.brave * 0.18) {
          const wantsSpecial = me.meter >= SPECIAL_COST && rand() < 0.5;
          const reach = special.kind === "proj" ? 99999 : Sim.MOVES.heavy.reach;
          if (wantsSpecial && (special.kind !== "proj" || dist > 140) && (special.kind === "proj" || dist < 170)) bits |= BIT.S;
          else if (dist < Sim.MOVES.light.reach + 10) bits |= rand() < 0.65 ? BIT.A : BIT.H;
          else if (dist < reach && dist < Sim.MOVES.heavy.reach + 10) bits |= BIT.H;
        }
      }
      // in the air: swing when close enough to connect
      if (!grounded && fresh && dist < 100 && rand() < 0.25 + brain.brave * 0.3) bits |= opp.y >= FLOOR && rand() < 0.5 ? BIT.H : BIT.A;
      // hop over low projectiles and jump in sometimes
      for (const p of s.p) {
        if (p.o !== side && Math.abs(p.x - me.x) < 140 && grounded && rand() < brain.guard) bits |= BIT.U;
      }
      if (grounded && dist > 160 && dist < 330 && rand() < (0.01 + brain.brave * 0.01) * flavor.jump) bits |= BIT.U;
      if (opp.stun > 0 && dist < 90 && fresh) bits |= BIT.A;
      last = bits;
      return bits;
    };
  }

  // The gauntlet: one fight after another against stronger people until you lose.
  const LADDER = ["easy", "normal", "normal", "hard", "hard", "brutal"];
  const STYLE_LIST = Object.keys(STYLES);

  // who you meet after `streak` wins. pool is the races that have a roster entry, never your own race
  function gauntletFoe(streak, myRace, pool) {
    const races = pool.filter((race) => race !== myRace);
    const list = races.length ? races : pool;
    return {
      race: list[(streak * 5 + 3) % list.length],
      level: LADDER[Math.min(streak, LADDER.length - 1)],
      style: STYLE_LIST[(streak * 2 + 1) % STYLE_LIST.length],
      // past the end of the ladder they get a little tougher each time
      hp: 1 + Math.min(0.5, Math.max(0, streak - (LADDER.length - 1)) * 0.05),
      stage: streak % Sim.STAGES.length,
    };
  }

  // streak * 1000 plus the health you had left after each win, so clean wins rank higher
  const gauntletScore = (wins, hpBonus) => Math.round(wins * 1000 + Math.max(0, hpBonus));

  return { LEVELS, STYLES, LADDER, create, mulberry, preferredRange, styleOf, gauntletFoe, gauntletScore };
});
