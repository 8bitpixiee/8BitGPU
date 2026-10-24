// The people you can fight when nobody else is around, one for every race that isn't one account's own
(() => {
  const A = "assets/avatar/";
  const fem = { ears: A + "ears_fem_v1.png", eyes: A + "eyes_fem_v1.png", hair: A + "volume_hair_fem_idle_front_v1.png", fit: A + "fit_fem_v1.png" };
  const roster = [
    { name: "Glimmer", race: "pixie", layers: { body: A + "body_fem_v1.png", head: A + "head_fem_v1.png", extra: A + "wings_v1.png", ...fem } },
    {
      name: "Antlerette", race: "deerbra",
      layers: { body: A + "body_fem_deerbra_v1.png", head: A + "head_fem_deerbra_v1.png", ears: A + "ears_fem_deerbra_v1.png", eyes: A + "eyes_fem_v1.png", hair: A + "hair_fem_deerbra_v1.png", fit: A + "fit_fem_v1.png" },
    },
    {
      name: "Highland Hattie", race: "bovadill",
      layers: { body: A + "bovidil_body_fem_v1.1.png", head: A + "bovidil_head_fem_v1.png", ears: A + "ears_fem_bovidil_v1.png", extra: A + "bovidil_tail_v1.png", eyes: A + "eyes_fem_v1.png" },
    },
    { name: "Bramble", race: "thixie", layers: { body: A + "thixie_body_v1.png", head: A + "thixie_head_v1.png", eyes: A + "eyes_fem_v1.png", hair: A + "hair_fem_v1.png", fit: A + "thixie_fit_v1.png" } },
    { name: "Nullbot", skin: "#9aa3ff", race: "null", layers: { body: A + "Null.png" } },
    { name: "Voidling", skin: "#7a4fd0", race: "voidling", layers: { body: A + "voidling_f.png" } },
    { name: "Clank-E", skin: "#9fb4c4", race: "clanker", layers: { body: A + "Clanker_F.png" } },
    { name: "Coral", skin: "#6fd6c8", race: "mermaid", layers: { body: A + "mermaid_f.png" } },
    { name: "Claws", skin: "#d89a5a", race: "anthro", layers: { body: A + "antrho_f.png" } },
    { name: "Big Mac", skin: "#c98a5e", race: "macho", layers: { body: A + "macho.png" } },
    { name: "Velvet", skin: "#e8b4a0", race: "femme", layers: { body: A + "femme.png" } },
    { name: "Maxine", skin: "#b9835c", race: "maxie", layers: { body: A + "Maxie_F.png" } },
  ];

  const avatarFor = (entry) => ({
    race: entry.race,
    layers: entry.layers,
    adjustments: {},
    layout: 1,
    skinColor: { hue: 0, saturation: 100, lightness: 100, ...(entry.skin ? { hex: entry.skin } : {}) },
    itemColors: {},
  });

  window.CpuRoster = {
    roster,
    // someone to fight, never the same race as you when there is another choice
    pick(exceptRace, seed = Math.random()) {
      const pool = roster.filter((entry) => entry.race !== exceptRace);
      const entry = pool[Math.floor(seed * pool.length) % pool.length];
      return { name: entry.name, race: entry.race, avatar: avatarFor(entry) };
    },
    byRace: (race) => {
      const entry = roster.find((candidate) => candidate.race === race) || roster[0];
      return { name: entry.name, race: entry.race, avatar: avatarFor(entry) };
    },
  };
})();
