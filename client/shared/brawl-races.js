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

  return { SPECIALS, RACES, raceOf, specialOf };
});
