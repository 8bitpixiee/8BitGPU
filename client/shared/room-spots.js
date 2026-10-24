(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.RoomSpots = api;
})(typeof self !== "undefined" ? self : this, function () {
  // width / height of each room's stage, spots are in percent so x needs this to measure a real distance
  const RATIO = { arcade: 1.5, pillow: 300 / 216 };

  // things you have to walk up to. x, y and radius are percent of the stage (radius in height percent)
  const SPOTS = {
    arcade: [
      {
        id: "bar",
        label: "Bar",
        x: 66.7,
        y: 58,
        radius: 9,
        actions: [
          { emote: "drink", label: "Order a drink" },
          { emote: "smoke", label: "Smoke" },
        ],
      },
      {
        id: "stump",
        label: "Mushroom stump",
        x: 33.3,
        y: 90,
        radius: 9,
        actions: [{ emote: "shroom", label: "Eat a mushroom" }],
      },
    ],
    pillow: [],
  };

  // emotes you can't do from the chat side, only at a spot that offers them
  const GATED = new Set(SPOTS.arcade.flatMap((spot) => spot.actions.map((action) => action.emote)));

  const distance = (room, spot, x, y) => Math.hypot((x - spot.x) * (RATIO[room] || 1), y - spot.y);

  // the spot you are standing at, if any. slack lets the server be a little more forgiving than the client
  function spotAt(room, x, y, slack = 1) {
    return (SPOTS[room] || []).find((spot) => distance(room, spot, x, y) <= spot.radius * slack) || null;
  }

  function mayEmote(room, emote, x, y) {
    if (!GATED.has(emote)) return true;
    const spot = spotAt(room, x, y, 1.6);
    return Boolean(spot && spot.actions.some((action) => action.emote === emote));
  }

  return { RATIO, SPOTS, GATED, spotAt, mayEmote };
});
