(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Rooms = api;
})(typeof self !== "undefined" ? self : this, function () {
  // the connected rooms as a door graph. a door sits in one room (x,y), leads to `to`,
  // and `entry` is where you stand in THIS room when you arrive through the matching door from `to`.
  // object is the durable object name, kept as-is so the arcade's old state stays put.
  const ROOMS = {
    arcade: {
      id: "arcade", object: "lounge", name: "Arcade Lounge", title: "Arcade Lounge.exe",
      image: "assets/maps/arcade/arcade-02-wide.png", width: 1800, height: 1200,
      spawn: { x: 50, y: 70 }, bounds: { minX: 6, maxX: 94, minY: 12, maxY: 94 },
      doors: [
        { to: "pillow", x: 50, y: 90, entry: { x: 50, y: 86 } },
        { to: "studio", x: 29, y: 90, entry: { x: 29, y: 86 } },
      ],
    },
    pillow: {
      id: "pillow", object: "pillow", name: "The Pillow Room", title: "Pillow Room.exe",
      image: "assets/maps/pillow/pillow-room.png", width: 300, height: 216,
      spawn: { x: 78, y: 84 }, bounds: { minX: 6, maxX: 94, minY: 6, maxY: 94 },
      doors: [{ to: "arcade", x: 12, y: 85, entry: { x: 16, y: 86 } }],
    },
    studio: {
      id: "studio", object: "studio", name: "The Artists Room", title: "Artists Room.exe",
      image: "assets/maps/studio/studio-room.png", width: 300, height: 216,
      spawn: { x: 50, y: 76 }, bounds: { minX: 6, maxX: 94, minY: 6, maxY: 94 },
      doors: [{ to: "arcade", x: 88, y: 92, entry: { x: 82, y: 88 } }],
    },
  };
  const ROOM_IDS = Object.keys(ROOMS);

  // where you come in when you walk through the door from `from`, or null if there is no such door
  function entryFrom(room, from) {
    const door = (ROOMS[room]?.doors || []).find((d) => d.to === from);
    return door ? door.entry : null;
  }

  return { ROOMS, ROOM_IDS, entryFrom };
});
