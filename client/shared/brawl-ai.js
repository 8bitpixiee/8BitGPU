(function (root, factory) {
  const api = factory(
    root.BrawlSim || (typeof require === "function" ? require("./brawl-sim.js") : null),
    root.BrawlRaces || (typeof require === "function" ? require("./brawl-races.js") : null),
  );
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BrawlAI = api;
})(typeof self !== "undefined" ? self : this, function (Sim, Races) {
  const { BIT, SPECIAL_COST, FLOOR } = Sim;

  // how slow to react, how often to go in, how often a hit gets blocked
  const LEVELS = {
    easy: { react: 16, brave: 0.3, guard: 0.15, think: 20 },
    normal: { react: 9, brave: 0.55, guard: 0.4, think: 12 },
    hard: { react: 3, brave: 0.8, guard: 0.7, think: 6 },
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

  // shooters stand back, brawlers get in close
  function preferredRange(race) {
    const special = Races.specialOf(race);
    if (special.kind === "proj") return 300;
    if (special.kind === "dash") return 180;
    return 80;
  }

  function create({ side = 1, level = "normal", seed = 1 } = {}) {
    const brain = LEVELS[level] || LEVELS.normal;
    const rand = mulberry(seed);
    let blockUntil = -1;
    let nextThink = 0;
    let seenAttack = -1;
    let plan = 0;
    let last = 0;

    return function decide(s) {
      if (s.phase !== "fight") return (last = 0);
      const me = s.f[side];
      const opp = s.f[1 - side];
      const now = s.frame;
      const toward = opp.x >= me.x ? BIT.R : BIT.L;
      const away = toward === BIT.R ? BIT.L : BIT.R;
      const dist = Math.abs(opp.x - me.x);
      const grounded = me.y >= FLOOR;

      // see an attack start, maybe put the guard up once the reaction time has passed
      if (opp.atk && opp.at === 0 && seenAttack !== now && dist < 170) {
        seenAttack = now;
        if (rand() < brain.guard) blockUntil = now + brain.react + 18;
      }
      let bits = 0;
      if (me.stun > 0 || me.atk) return (last = 0);
      if (now < blockUntil && now >= blockUntil - 18 && grounded) {
        last = BIT.B;
        return last;
      }

      const range = preferredRange(me.race);
      const special = Races.specialOf(me.race);
      if (now >= nextThink) {
        nextThink = now + brain.think + Math.floor(rand() * brain.think);
        plan = rand() < brain.brave ? 1 : rand() < 0.5 ? 0 : -1;
      }
      const reach = special.kind === "proj" ? 99999 : Sim.MOVES.heavy.reach;

      if (dist > range + 30) bits |= plan >= 0 ? toward : 0;
      else if (dist < range - 40 && range > 150) bits |= away;
      else if (plan < 0 && dist < 120) bits |= away;

      // press an attack on one frame, let go on the next so it counts as a new press
      const fresh = !(last & (BIT.A | BIT.H | BIT.S));
      if (fresh && rand() < 0.12 + brain.brave * 0.18) {
        const wantsSpecial = me.meter >= SPECIAL_COST && rand() < 0.5;
        if (wantsSpecial && (special.kind !== "proj" || dist > 140) && (special.kind === "proj" || dist < 170)) bits |= BIT.S;
        else if (dist < Sim.MOVES.light.reach + 10) bits |= rand() < 0.65 ? BIT.A : BIT.H;
        else if (dist < reach && dist < Sim.MOVES.heavy.reach + 10) bits |= BIT.H;
      }
      // hop over low projectiles and jump in sometimes
      for (const p of s.p) {
        if (p.o !== side && Math.abs(p.x - me.x) < 140 && grounded && rand() < brain.guard) bits |= BIT.U;
      }
      if (grounded && dist > 200 && dist < 330 && rand() < 0.01 + brain.brave * 0.01) bits |= BIT.U;
      if (opp.stun > 0 && dist < 90 && fresh) bits |= BIT.A;
      last = bits;
      return bits;
    };
  }

  return { LEVELS, create, mulberry, preferredRange };
});
