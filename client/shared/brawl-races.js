(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BrawlRaces = api;
})(typeof self !== "undefined" ? self : this, function () {
  // every special move is one of a few kinds, brawl-sim.js knows how to run each kind
  // times are frames at 60 per second, distances are pixels on the 960 wide arena
  const SPECIALS = {
    glitter: {
      name: "Glitter Bomb", kind: "proj", startup: 8, active: 1, recover: 14,
      shots: [{ at: 0, vx: 8, vy: -2, g: 0.14, dmg: 10, r: 22, life: 100, stun: 16, kb: 5 }],
    },
    antler: { name: "Antler Charge", kind: "dash", startup: 6, dur: 16, vx: 13, reach: 74, dmg: 14, kb: 11, stun: 18, recover: 12 },
    slam: { name: "Highland Slam", kind: "area", startup: 16, active: 3, recover: 22, reach: 150, dmg: 16, kb: 10, stun: 24, groundOnly: true },
    thorns: {
      name: "Thorn Volley", kind: "proj", startup: 6, active: 15, recover: 12,
      shots: [0, 7, 14].map((at) => ({ at, vx: 10, vy: 0, g: 0, dmg: 5, r: 12, life: 70, stun: 10, kb: 3 })),
    },
    voidstep: { name: "Void Step", kind: "teleport", startup: 10, behind: 80, active: 5, reach: 90, dmg: 11, kb: 7, stun: 16, recover: 12 },
    overclock: { name: "Overclock", kind: "buff", startup: 8, active: 1, recover: 10, dur: 300, dmgMul: 1.25, speedMul: 1.2 },
    bubble: {
      name: "Bubble Shot", kind: "proj", startup: 12, active: 1, recover: 18,
      shots: [{ at: 0, vx: 4.5, vy: 0, g: 0, dmg: 13, r: 34, life: 140, stun: 22, kb: 7 }],
    },
    claw: { name: "Claw Rush", kind: "flurry", startup: 6, hits: 3, gap: 5, drift: 3, reach: 80, dmg: 4, kb: 2, stun: 8, recover: 14 },
    haymaker: { name: "Haymaker", kind: "melee", startup: 18, active: 4, recover: 22, reach: 100, dmg: 20, kb: 14, stun: 28, armor: true },
    spinkick: { name: "Spin Kick", kind: "area", startup: 7, active: 6, recover: 14, reach: 100, dmg: 11, kb: 8, stun: 16 },
    shock: {
      name: "Shockwave", kind: "proj", startup: 8, active: 1, recover: 14,
      shots: [{ at: 0, vx: 11, vy: 0, g: 0, dmg: 9, r: 16, life: 70, stun: 14, kb: 5, ground: true }],
    },
    brine: { name: "Brine Splash", kind: "area", startup: 10, active: 4, recover: 20, reach: 120, dmg: 10, kb: 6, stun: 18, heal: 8 },
  };

  // one super per race, spent from a full meter with Block + Special. They reuse the special kinds, just bigger,
  // and the fighter cannot be hurt while it winds up. dmg on a multi hit is per hit
  const spread = (n, gap, make) => Array.from({ length: n }, (_, i) => make(i, i * gap));
  const SUPERS = {
    glitter: {
      name: "Stardust Storm", kind: "proj", startup: 14, active: 18, recover: 20,
      shots: spread(5, 4, (i, at) => ({ at, vx: 9, vy: -3 + i * 1.1, g: 0.1, dmg: 8, r: 18, life: 90, stun: 18, kb: 6 })),
    },
    antler: { name: "Stampede", kind: "dash", startup: 10, dur: 26, vx: 15, reach: 80, dmg: 30, kb: 14, stun: 30, recover: 16 },
    slam: { name: "Earthquake", kind: "area", startup: 20, active: 4, recover: 30, reach: 280, dmg: 30, kb: 14, stun: 34, groundOnly: true },
    thorns: {
      name: "Briar Barrage", kind: "proj", startup: 10, active: 26, recover: 16,
      shots: spread(8, 3, (i, at) => ({ at, vx: 11, vy: 0, g: 0, dmg: 6, r: 12, life: 70, stun: 14, kb: 4 })),
    },
    voidstep: { name: "Event Horizon", kind: "teleport", startup: 12, behind: 70, active: 6, reach: 110, dmg: 30, kb: 12, stun: 30, recover: 14 },
    overclock: { name: "Meltdown", kind: "area", startup: 16, active: 4, recover: 28, reach: 220, dmg: 28, kb: 13, stun: 30 },
    bubble: {
      name: "Tidal Wave", kind: "proj", startup: 14, active: 1, recover: 24,
      shots: [{ at: 0, vx: 6, vy: 0, g: 0, dmg: 30, r: 60, life: 150, stun: 34, kb: 12 }],
    },
    claw: { name: "Feral Frenzy", kind: "flurry", startup: 8, hits: 8, gap: 4, drift: 4, reach: 90, dmg: 5, kb: 2, stun: 12, recover: 18 },
    haymaker: { name: "Wrecking Ball", kind: "melee", startup: 22, active: 5, recover: 26, reach: 120, dmg: 36, kb: 18, stun: 36, armor: true },
    spinkick: { name: "Tornado Kicks", kind: "flurry", startup: 8, hits: 6, gap: 5, drift: 2, reach: 100, dmg: 6, kb: 4, stun: 14, recover: 18 },
    shock: {
      name: "Fault Line", kind: "proj", startup: 10, active: 18, recover: 18,
      shots: spread(3, 8, (i, at) => ({ at, vx: 12, vy: 0, g: 0, dmg: 11, r: 18, life: 70, stun: 20, kb: 6, ground: true })),
    },
    brine: { name: "Brine Tsunami", kind: "area", startup: 14, active: 4, recover: 26, reach: 200, dmg: 24, kb: 10, stun: 26, heal: 25 },
  };

  // hp, walk speed multiplier, jump power multiplier, extra jumps in the air, gravity multiplier
  const RACES = {
    pixie: { name: "Pixie", hp: 90, speed: 1.1, jump: 1.05, airJumps: 1, gravity: 1, special: "glitter" },
    deerbra: { name: "Deerbra", hp: 100, speed: 1, jump: 1, airJumps: 0, gravity: 1, special: "antler" },
    bovadill: { name: "Bovadill", hp: 125, speed: 0.85, jump: 0.9, airJumps: 0, gravity: 1.1, special: "slam" },
    thixie: { name: "Thixie", hp: 95, speed: 1.05, jump: 1, airJumps: 0, gravity: 1, special: "thorns" },
    null: { name: "Null", hp: 95, speed: 1, jump: 1, airJumps: 0, gravity: 1, special: "voidstep" },
    voidling: { name: "Voidling", hp: 95, speed: 1, jump: 1, airJumps: 0, gravity: 1, special: "voidstep" },
    clanker: { name: "Clanker", hp: 105, speed: 0.95, jump: 0.95, airJumps: 0, gravity: 1, special: "overclock" },
    mermaid: { name: "Mermaid", hp: 95, speed: 0.95, jump: 1, airJumps: 0, gravity: 0.8, special: "bubble" },
    anthro: { name: "Anthro", hp: 100, speed: 1.05, jump: 1, airJumps: 0, gravity: 1, special: "claw" },
    macho: { name: "Macho", hp: 115, speed: 0.9, jump: 0.95, airJumps: 0, gravity: 1, special: "haymaker" },
    femme: { name: "Femme", hp: 95, speed: 1.05, jump: 1.05, airJumps: 0, gravity: 1, special: "spinkick" },
    maxie: { name: "Maxie", hp: 105, speed: 1, jump: 1, airJumps: 0, gravity: 1, special: "shock" },
    pickle: { name: "Pickle", hp: 100, speed: 1, jump: 1.1, airJumps: 0, gravity: 1, special: "brine" },
  };

  const BY_BODY = {
    "null.png": "null", "femme.png": "femme", "macho.png": "macho", "pickle.png": "pickle",
    "maxie_f.png": "maxie", "maxie_m.png": "maxie", "antrho_f.png": "anthro", "anthro_m.png": "anthro",
    "clanker_f.png": "clanker", "clanker_m.png": "clanker", "mermaid_f.png": "mermaid", "mermaid_m.png": "mermaid",
    "voidling_f.png": "voidling", "voidling_m.png": "voidling",
  };
  const BY_SPECIES = { Pixie: "pixie", Deerbra: "deerbra", Bovadill: "bovadill", Thixie: "thixie" };

  // works on the saved outfit and on the room's version of it
  function raceOf(avatar) {
    if (!avatar || typeof avatar !== "object") return "pixie";
    if (RACES[avatar.race]) return avatar.race;
    const body = String(avatar.bodyAsset || "").toLowerCase();
    return BY_BODY[body] || BY_SPECIES[avatar.species] || "pixie";
  }

  const specialOf = (race) => SPECIALS[(RACES[race] || RACES.pixie).special];
  const superOf = (race) => SUPERS[(RACES[race] || RACES.pixie).special];

  return { SPECIALS, SUPERS, RACES, raceOf, specialOf, superOf };
});
