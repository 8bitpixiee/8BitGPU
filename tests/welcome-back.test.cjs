const test = require("node:test");
const assert = require("node:assert/strict");
const { createWatcher, AWAY, IDLE } = require("../client/desktop/welcome-back.js");

test("a quick tab flip is not leaving", () => {
  const watcher = createWatcher();
  watcher.hidden(1000);
  assert.equal(watcher.visible(1000 + AWAY - 1), false);
});

test("coming back after a while waves", () => {
  const watcher = createWatcher();
  watcher.hidden(1000);
  assert.equal(watcher.visible(1000 + AWAY), true);
  assert.equal(watcher.visible(1000 + AWAY + 5), false);
});

test("moving the mouse after sitting idle waves once", () => {
  const watcher = createWatcher();
  watcher.active(1000);
  assert.equal(watcher.active(1000 + IDLE - 1), false);
  assert.equal(watcher.active(1000 + IDLE * 2), true);
  assert.equal(watcher.active(1000 + IDLE * 2 + 50), false);
});

test("hiding the tab does not also count as going idle", () => {
  const watcher = createWatcher();
  watcher.active(1000);
  watcher.hidden(2000);
  watcher.visible(2000 + IDLE * 3);
  assert.equal(watcher.active(2000 + IDLE * 3 + 10), false);
});
