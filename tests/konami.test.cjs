const test = require("node:test");
const assert = require("node:assert/strict");
const { CODE, createDetector } = require("../client/shared/konami.js");

const feed = (detect, keys) => keys.map((key) => detect(key));

test("the full code fires once, on the last key", () => {
  const results = feed(createDetector(), CODE);
  assert.deepEqual(results.slice(0, -1).every((hit) => !hit), true);
  assert.equal(results.at(-1), true);
});

test("a wrong key in the middle starts it over", () => {
  const detect = createDetector();
  feed(detect, CODE.slice(0, 6));
  feed(detect, ["x"]);
  assert.equal(feed(detect, CODE.slice(6)).at(-1), false);
  assert.equal(feed(detect, CODE).at(-1), true);
});

test("extra ups before the code don't break it", () => {
  const detect = createDetector();
  assert.equal(feed(detect, ["ArrowUp", ...CODE]).at(-1), true);
});

test("b and a don't care about caps lock", () => {
  const keys = [...CODE.slice(0, 8), "B", "A"];
  assert.equal(feed(createDetector(), keys).at(-1), true);
});

test("it can go off again right after", () => {
  const detect = createDetector();
  feed(detect, CODE);
  assert.equal(feed(detect, CODE).at(-1), true);
});
