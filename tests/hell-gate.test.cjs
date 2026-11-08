const test = require("node:test");
const assert = require("node:assert/strict");
const { isGate } = require("../client/shared/hell-gate.js");

const key = (extra) => ({ ctrlKey: true, shiftKey: true, altKey: false, metaKey: false, code: "Digit6", ...extra });

test("ctrl+shift+6 opens the gate", () => {
  assert.equal(isGate(key()), true);
});

test("plain 6 and ctrl+6 do nothing", () => {
  assert.equal(isGate(key({ ctrlKey: false })), false);
  assert.equal(isGate(key({ shiftKey: false })), false);
});

test("other modifiers and other keys don't count", () => {
  assert.equal(isGate(key({ altKey: true })), false);
  assert.equal(isGate(key({ metaKey: true })), false);
  assert.equal(isGate(key({ code: "Digit5" })), false);
});
