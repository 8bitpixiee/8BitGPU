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

const run = (id, im, p) => fx.filters[id].apply(im, p);

test("every filter returns an image of the same size and doesn't touch the input", () => {
  const im = img(4, 4, Array.from({ length: 64 }, (_, i) => (i * 37) % 256));
  const before = Array.from(im.data);
  for (const id of Object.keys(fx.filters)) {
    const out = run(id, im);
    assert.equal(out.width, 4, id);
    assert.equal(out.height, 4, id);
    assert.equal(out.data.length, 64, id);
  }
  assert.deepEqual(Array.from(im.data), before);
});

test("invert, grayscale, posterize, threshold", () => {
  const im = img(1, 1, [10, 100, 200, 255]);
  assert.deepEqual(px(run("invert", im), 0, 0), [245, 155, 55, 255]);
  const g = px(run("grayscale", im, { mode: "average" }), 0, 0);
  assert.deepEqual(g, [103, 103, 103, 255]);
  assert.deepEqual(px(run("posterize", im, { levels: 2 }), 0, 0), [0, 0, 255, 255]);
  assert.deepEqual(px(run("threshold", im, { level: 200 }), 0, 0), [0, 0, 0, 255]);
});

test("brightness/contrast and hsl", () => {
  const im = solid(1, 1, [100, 100, 100, 255]);
  assert.deepEqual(px(run("brightness-contrast", im, { brightness: 10 }), 0, 0).slice(0, 3), [126, 126, 126]);
  assert.deepEqual(px(run("hsl", solid(1, 1, [255, 0, 0, 255]), { hue: 120 }), 0, 0), [0, 255, 0, 255]);
  assert.deepEqual(px(run("hsl", solid(1, 1, [255, 0, 0, 255]), { lightness: -100 }), 0, 0), [0, 0, 0, 255]);
});

test("outline outer/inner/only on a 3x3 block in 5x5", () => {
  const im = fx.makeImage(5, 5);
  for (let y = 1; y < 4; y++) for (let x = 1; x < 4; x++) im.data.set([255, 0, 0, 255], (y * 5 + x) * 4);
  const outer4 = run("outline", im, { mode: "outer", neighbours: 4, color: "#0000ff" });
  assert.deepEqual(px(outer4, 0, 0), [0, 0, 0, 0]); // diagonal corner untouched with 4-neighbours
  assert.deepEqual(px(outer4, 2, 0), [0, 0, 255, 255]);
  const outer8 = run("outline", im, { mode: "outer", neighbours: 8, color: "#0000ff" });
  assert.deepEqual(px(outer8, 0, 0), [0, 0, 255, 255]);
  const inner = run("outline", im, { mode: "inner", neighbours: 4, color: "#00ff00" });
  assert.deepEqual(px(inner, 2, 2), [255, 0, 0, 255]); // centre keeps fill
  assert.deepEqual(px(inner, 1, 1), [0, 255, 0, 255]);
  const ring = run("outline-only", im, { neighbours: 4 });
  assert.deepEqual(px(ring, 2, 2), [0, 0, 0, 0]);
  assert.deepEqual(px(ring, 1, 1), [255, 0, 0, 255]);
});

test("drop shadow lands offset behind the sprite", () => {
  const im = fx.makeImage(3, 1);
  im.data.set([255, 255, 255, 255], 0);
  const out = run("drop-shadow", im, { dx: 1, dy: 0, color: "#000000", opacity: 100 });
  assert.deepEqual(px(out, 0, 0), [255, 255, 255, 255]);
  assert.deepEqual(px(out, 1, 0), [0, 0, 0, 255]);
  assert.equal(px(out, 2, 0)[3], 0);
});

test("replace colour respects tolerance", () => {
  const im = img(2, 1, [250, 0, 0, 255, 200, 0, 0, 255]);
  const out = run("replace-color", im, { from: "#ff0000", to: "#00ff00", tolerance: 10 });
  assert.deepEqual(px(out, 0, 0), [0, 255, 0, 255]);
  assert.deepEqual(px(out, 1, 0), [200, 0, 0, 255]);
});

test("convolution: blur keeps flat colour, edges find a step, sharpen is identity on flat", () => {
  const flat = solid(4, 4, [80, 90, 100, 255]);
  assert.deepEqual(px(run("convolution", flat, { kernel: "blur-5x5" }), 2, 2), [80, 90, 100, 255]);
  assert.deepEqual(px(run("convolution", flat, { kernel: "sharpen-3x3" }), 1, 1), [80, 90, 100, 255]);
  assert.deepEqual(px(run("convolution", flat, { kernel: "edges-find" }), 1, 1), [0, 0, 0, 255]);
  const step = fx.makeImage(4, 1);
  for (let x = 0; x < 4; x++) step.data.set(x < 2 ? [0, 0, 0, 255] : [200, 200, 200, 255], x * 4);
  const e = px(run("convolution", step, { kernel: "edges-find" }), 2, 0);
  assert.ok(e[0] > 0);
});

test("pixelate averages blocks", () => {
  const im = img(2, 1, [0, 0, 0, 255, 100, 100, 100, 255]);
  assert.deepEqual(px(run("pixelate", im, { size: 2 }), 1, 0), [50, 50, 50, 255]);
});

test("dither only emits palette colours; bayer matrix is a permutation", () => {
  const ramp = fx.makeImage(16, 4);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 16; x++) ramp.data.set([x * 17, x * 17, x * 17, 255], (y * 16 + x) * 4);
  const allowed = new Set(fx.paletteById("gameboy").colors);
  for (const method of ["bayer2", "bayer4", "bayer8", "ordered", "floyd-steinberg", "atkinson"]) {
    const out = run("dither", ramp, { palette: "gameboy", method });
    for (let i = 0; i < out.data.length; i += 4) assert.ok(allowed.has(fx.toHex(out.data[i], out.data[i + 1], out.data[i + 2])), method);
  }
  const bw = run("dither", ramp, { palette: "monochrome", method: "bayer4" });
  const whites = Array.from({ length: 16 }, (_, x) => px(bw, x, 0)[0]);
  assert.ok(whites.indexOf(255) > 0 && whites[0] === 0 && whites[15] === 255);
  assert.deepEqual(fx.bayer(4).flat().sort((a, b) => a - b), Array.from({ length: 16 }, (_, i) => i));
});

test("quantize limits colour count", () => {
  const im = fx.makeImage(8, 8);
  for (let i = 0; i < 64; i++) im.data.set([i * 4, 255 - i * 4, (i * 9) % 256, 255], i * 4);
  const out = run("quantize", im, { colors: 4 });
  assert.ok(fx.collectColors(out).size <= 4);
});

test("shade, hue-shift ramp, gradient map, noise, flip, despeckle", () => {
  const mid = solid(1, 1, [200, 100, 100, 255]);
  const lighter = px(run("shade", mid, { dir: "lighten", amount: 20 }), 0, 0);
  assert.ok(lighter[0] > 200);
  const gm = run("gradient-map", img(2, 1, [0, 0, 0, 255, 255, 255, 255, 255]), { dark: "#112233", light: "#ffeedd", useMid: false });
  assert.deepEqual(px(gm, 0, 0), [17, 34, 51, 255]);
  assert.deepEqual(px(gm, 1, 0), [255, 238, 221, 255]);
  const n1 = run("noise", solid(4, 4, [128, 128, 128, 255]), { seed: 5 });
  const n2 = run("noise", solid(4, 4, [128, 128, 128, 255]), { seed: 5 });
  assert.deepEqual(Array.from(n1.data), Array.from(n2.data));
  assert.notDeepEqual(Array.from(n1.data), Array.from(solid(4, 4, [128, 128, 128, 255]).data));
  const f = run("flip-rotate", img(2, 1, [1, 1, 1, 255, 2, 2, 2, 255]), { op: "flip-h" });
  assert.equal(px(f, 0, 0)[0], 2);
  const cw = run("flip-rotate", img(2, 2, [1, 0, 0, 255, 2, 0, 0, 255, 3, 0, 0, 255, 4, 0, 0, 255]), { op: "rotate-cw" });
  assert.deepEqual([px(cw, 0, 0)[0], px(cw, 1, 0)[0], px(cw, 0, 1)[0], px(cw, 1, 1)[0]], [3, 1, 4, 2]);
  const sp = solid(3, 3, [10, 10, 10, 255]);
  sp.data.set([200, 0, 0, 255], 16);
  assert.deepEqual(px(run("despeckle", sp), 1, 1), [10, 10, 10, 255]);
});
