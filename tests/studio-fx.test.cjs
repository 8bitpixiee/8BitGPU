const test = require("node:test");
const assert = require("node:assert/strict");
const fx = require("../client/studio/fx.js");

const img = (w, h, px) => {
  const out = fx.makeImage(w, h);
  px.forEach((v, i) => (out.data[i] = v));
  return out;
};
// solid image from a list of [r,g,b,a]
const solid = (w, h, rgba) => img(w, h, Array.from({ length: w * h }, () => rgba).flat());
const px = (im, x, y) => Array.from(im.data.slice((y * im.width + x) * 4, (y * im.width + x) * 4 + 4));

test("palettes: 20+ presets, sane hex, known sizes", () => {
  assert.ok(fx.PALETTES.length >= 20);
  const ids = new Set();
  for (const p of fx.PALETTES) {
    assert.ok(!ids.has(p.id), "dup " + p.id);
    ids.add(p.id);
    assert.ok(p.colors.every((c) => /^#[0-9a-f]{6}$/.test(c)), p.id);
  }
  const size = (id) => fx.paletteById(id).colors.length;
  assert.equal(size("pico8"), 16);
  assert.equal(size("dawnbringer32"), 32);
  assert.equal(size("endesga32"), 32);
  assert.equal(size("sweetie16"), 16);
  assert.equal(size("apollo"), 46);
  assert.equal(size("resurrect64"), 64);
  assert.equal(size("websafe-216"), 216);
});

test("palette tools: ramp, sort, extract", () => {
  const ramp = fx.tools.generateRamp("#000000", "#ffffff", 5);
  assert.deepEqual(ramp, ["#000000", "#404040", "#808080", "#bfbfbf", "#ffffff"]);
  const sorted = fx.tools.sortPalette(["#ffffff", "#000000", "#808080"], "luma");
  assert.deepEqual(sorted, ["#000000", "#808080", "#ffffff"]);
  const im = img(2, 1, [255, 0, 0, 255, 0, 0, 255, 255]);
  assert.deepEqual(fx.tools.extractPalette(im, 4), ["#0000ff", "#ff0000"]);
});
