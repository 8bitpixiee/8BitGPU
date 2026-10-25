const test = require("node:test");
const assert = require("node:assert/strict");
const { forgetPlayer, rememberPlayer, PLAYER_KEYS } = require("../client/shared/accounts.js");

const fakeStorage = (start = {}) => {
  const data = { ...start };
  return {
    data,
    getItem: (key) => (key in data ? data[key] : null),
    setItem: (key, value) => void (data[key] = String(value)),
    removeItem: (key) => void delete data[key],
  };
};

test("forgetting a player clears every per-account key and nothing else", () => {
  const storage = fakeStorage({ ...Object.fromEntries(PLAYER_KEYS.map((key) => [key, "x"])), "8bitgpu-window-colors": "keep" });
  forgetPlayer(storage);
  assert.deepEqual(Object.keys(storage.data), ["8bitgpu-window-colors"]);
});

test("switching starts from a clean slate, even without a saved outfit", () => {
  const storage = fakeStorage({
    "8bitgpu-avatar-outfit": "old outfit",
    "8bitgpu-lounge-activities": "old garden",
    "8bitgpu-guest-session": "true",
  });
  rememberPlayer(storage, { username: "mossy", avatar: null });
  assert.equal(storage.getItem("8bitgpu-player-name"), "mossy");
  assert.equal(storage.getItem("8bitgpu-account-active"), "true");
  assert.equal(storage.getItem("8bitgpu-avatar-outfit"), null);
  assert.equal(storage.getItem("8bitgpu-lounge-activities"), null);
  assert.equal(storage.getItem("8bitgpu-guest-session"), null);
});

test("switching carries the new account's outfit over", () => {
  const storage = fakeStorage();
  rememberPlayer(storage, { username: "mossy", avatar: { bodyAsset: "body_fem_v1.png" } });
  assert.deepEqual(JSON.parse(storage.getItem("8bitgpu-avatar-outfit")), { bodyAsset: "body_fem_v1.png" });
});
