const test = require("node:test");
const assert = require("node:assert/strict");
const { ROOMS, ROOM_IDS, entryFrom } = require("../client/shared/rooms.js");
const RoomSpots = require("../client/shared/room-spots.js");

test("every door leads somewhere and has a door back", () => {
  for (const room of Object.values(ROOMS)) {
    for (const door of room.doors) {
      assert.ok(ROOMS[door.to], `${room.id} -> ${door.to}`);
      assert.ok(ROOMS[door.to].doors.some((back) => back.to === room.id), `${door.to} has no way back to ${room.id}`);
    }
  }
});

test("the studio hangs off the arcade, not the pillow room", () => {
  assert.deepEqual(ROOM_IDS.sort(), ["arcade", "pillow", "studio"]);
  assert.ok(entryFrom("studio", "arcade"));
  assert.equal(entryFrom("studio", "pillow"), null);
  assert.equal(entryFrom("studio", "nowhere"), null);
  assert.ok(entryFrom("arcade", "studio") && entryFrom("arcade", "pillow"));
});

test("entry points and spawns sit inside the walkable bounds, and every room has a stage ratio", () => {
  for (const room of Object.values(ROOMS)) {
    const { minX, maxX, minY, maxY } = room.bounds;
    const points = [room.spawn, ...room.doors.map((d) => d.entry)];
    for (const p of points) assert.ok(p.x >= minX && p.x <= maxX && p.y >= minY && p.y <= maxY, room.id);
    assert.ok(RoomSpots.RATIO[room.id], room.id);
  }
});
