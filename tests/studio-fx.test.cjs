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

// ---- encoders ----
const zlib = require("node:zlib");

const noisy = (w, h, seed, alphaHole) => {
  const im = fx.makeImage(w, h);
  let s = seed;
  for (let i = 0; i < w * h; i++) {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    im.data.set(alphaHole && i % 11 === 0 ? [0, 0, 0, 0] : [s & 255, (s >> 8) & 255, (s >> 16) & 255, 255], i * 4);
  }
  return im;
};

// tiny png reader for checking our writer (we only ever write filter 0)
function readPng(buf) {
  let p = 8;
  const chunks = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p);
    const type = buf.toString("latin1", p + 4, p + 8);
    const body = buf.subarray(p + 8, p + 8 + len);
    assert.equal(buf.readUInt32BE(p + 8 + len), fx.encoders.crc32(buf, p + 4, p + 8 + len), "crc " + type);
    chunks.push({ type, body });
    p += 12 + len;
  }
  const head = chunks[0].body;
  const w = head.readUInt32BE(0);
  const h = head.readUInt32BE(4);
  const raw = zlib.inflateSync(Buffer.concat(chunks.filter((c) => c.type === "IDAT").map((c) => c.body)));
  const out = new Uint8Array(w * h * 4);
  for (let y = 0; y < h; y++) out.set(raw.subarray(y * (w * 4 + 1) + 1, (y + 1) * (w * 4 + 1)), y * w * 4);
  return { w, h, data: out, chunks };
}

test("png encoder round-trips through zlib", async () => {
  const im = noisy(13, 7, 3, true);
  const png = readPng(Buffer.from(await fx.encoders.encodePNG(im)));
  assert.equal(png.w, 13);
  assert.deepEqual(Array.from(png.data), Array.from(im.data));
});

test("stored-block zlib fallback inflates correctly", async () => {
  const saved = global.CompressionStream;
  global.CompressionStream = undefined;
  try {
    const big = Uint8Array.from({ length: 70000 }, (_, i) => (i * 7) & 255);
    const z = await fx.encoders.zlibCompress(big);
    assert.deepEqual(Array.from(zlib.inflateSync(Buffer.from(z))), Array.from(big));
  } finally {
    global.CompressionStream = saved;
  }
});

test("zip writer makes a readable store archive", () => {
  const data = new TextEncoder().encode("hello zip");
  const zip = Buffer.from(fx.encoders.encodeZip([{ name: "a.txt", data }]));
  assert.equal(zip.readUInt32LE(0), 0x04034b50);
  assert.equal(zip.readUInt32LE(14), fx.encoders.crc32(data));
  assert.equal(zip.readUInt16LE(zip.length - 22 + 10), 1);
  assert.equal(zip.subarray(30 + 5, 30 + 5 + 9).toString(), "hello zip");
});

test("gif: lzw round trip incl. dictionary overflow", () => {
  const px = Uint8Array.from({ length: 20000 }, (_, i) => ((i * i) >> 3) & 63);
  const stream = fx.encoders.lzwEncode(px, 6);
  const data = [];
  for (let p = 0; stream[p] !== 0; p += stream[p] + 1) for (let i = 1; i <= stream[p]; i++) data.push(stream[p + i]);
  assert.deepEqual(Array.from(fx.encoders.lzwDecode(data, 6, px.length)), Array.from(px));
});

test("gif encode/decode keeps exact colours, transparency, delays and loop", () => {
  const mk = (seed) => {
    const im = fx.makeImage(12, 10);
    for (let i = 0; i < 120; i++) im.data.set(i % 9 === 0 ? [0, 0, 0, 0] : [((i + seed) % 5) * 50, ((i * 3) % 4) * 80, seed * 60, 255], i * 4);
    return im;
  };
  const frames = [mk(0), mk(1), mk(2)].map((image, i) => ({ image, ms: 40 + i * 30 }));
  const gif = fx.encoders.encodeGIF(frames, { loops: 0 });
  assert.equal(Buffer.from(gif).toString("latin1", 0, 6), "GIF89a");
  const dec = fx.encoders.decodeGIF(gif);
  assert.equal(dec.frames.length, 3);
  assert.equal(dec.loops, 0);
  assert.deepEqual(dec.frames.map((f) => f.ms), [40, 70, 100]);
  frames.forEach((f, k) => assert.deepEqual(Array.from(dec.frames[k].image.data), Array.from(f.image.data)));
  assert.equal(fx.encoders.decodeGIF(fx.encoders.encodeGIF(frames, { loops: 1 })).loops, 1);
  assert.equal(fx.encoders.decodeGIF(fx.encoders.encodeGIF(frames, { loops: 3 })).loops, 3);
});

test("gif with many colours quantizes to 256 and still decodes", () => {
  const im = noisy(64, 64, 9, false);
  const dec = fx.encoders.decodeGIF(fx.encoders.encodeGIF([{ image: im, ms: 100 }]));
  assert.ok(fx.collectColors(dec.frames[0].image).size <= 256);
});

// ---- exporters ----
const fakeDoc = () => ({
  w: 4,
  h: 3,
  name: "hero",
  frames: [{ ms: 100 }, { ms: 200 }, { ms: 300 }, { ms: 400 }],
  tags: [{ name: "walk", from: 1, to: 3, direction: "forward" }],
  layers: [{ name: "Layer 1" }],
  flatten: (i) => noisy(4, 3, i + 1, false),
});
const bytesOf = async (blob) => Buffer.from(await blob.arrayBuffer());

test("exporters expose the registry shape", () => {
  for (const id of ["png", "png-sequence", "spritesheet", "atlas-json", "spritesheet-zip", "gif", "apng", "webp"]) {
    const e = fx.exporters[id];
    assert.ok(e && e.label && e.ext && e.mime && typeof e.export === "function", id);
  }
});

test("png exporter scales nearest-neighbour", async () => {
  const doc = fakeDoc();
  const png = readPng(await bytesOf(await fx.exporters.png.export(doc, { frame: 2, scale: 3 })));
  assert.equal(png.w, 12);
  assert.equal(png.h, 9);
  const src = doc.flatten(2);
  assert.deepEqual(Array.from(png.data.slice((4 * 12 + 7) * 4, (4 * 12 + 7) * 4 + 4)), Array.from(src.data.slice((1 * 4 + 2) * 4, (1 * 4 + 2) * 4 + 4)));
});

test("spritesheet layouts and atlas json", () => {
  const doc = fakeDoc();
  const h = fx.buildSpriteSheet(doc, { layout: "horizontal" });
  assert.equal(h.image.width, 16);
  assert.equal(h.image.height, 3);
  const v = fx.buildSpriteSheet(doc, { layout: "vertical", padding: 1 });
  assert.equal(v.image.width, 6);
  assert.equal(v.image.height, 4 * 5);
  const g = fx.buildSpriteSheet(doc, { layout: "grid", columns: 2, spacing: 2, border: 1 });
  assert.equal(g.image.width, 1 * 2 + 8 + 2);
  assert.equal(g.image.height, 1 * 2 + 6 + 2);
  const p = fx.buildSpriteSheet(doc, { layout: "packed" });
  assert.ok(p.image.width * p.image.height <= 8 * 6);
  const j = h.json;
  assert.equal(Object.keys(j.frames).length, 4);
  assert.deepEqual(j.frames["hero 2.aseprite"].frame, { x: 8, y: 0, w: 4, h: 3 });
  assert.equal(j.frames["hero 2.aseprite"].duration, 300);
  assert.deepEqual(j.meta.frameTags, [{ name: "walk", from: 1, to: 3, direction: "forward" }]);
  assert.equal(j.meta.format, "RGBA8888");
  assert.deepEqual(j.meta.size, { w: 16, h: 3 });
  // frame pixels land where the atlas says
  assert.deepEqual(Array.from(h.image.data.slice(8 * 4, 8 * 4 + 4)), Array.from(doc.flatten(2).data.slice(0, 4)));
  const arr = fx.buildSpriteSheet(doc, { jsonFormat: "array" }).json;
  assert.ok(Array.isArray(arr.frames) && arr.frames[0].filename);
});

test("png sequence zip and tag ranges", async () => {
  const zip = await bytesOf(await fx.exporters["png-sequence"].export(fakeDoc(), { tag: "walk", name: "hero" }));
  assert.equal(zip.readUInt16LE(zip.length - 22 + 10), 3);
  assert.ok(zip.includes("hero_0.png"));
  assert.ok(zip.includes("hero_2.png"));
});

test("gif and apng exporters", async () => {
  const doc = fakeDoc();
  const gif = fx.encoders.decodeGIF(await bytesOf(await fx.exporters.gif.export(doc, { tag: "walk", scale: 2, loops: 0 })));
  assert.equal(gif.frames.length, 3);
  assert.equal(gif.w, 8);
  assert.deepEqual(gif.frames.map((f) => f.ms), [200, 300, 400]);
  const apng = await bytesOf(await fx.exporters.apng.export(doc, { loops: 2 }));
  const png = readPng(apng); // the default image is frame 0
  assert.deepEqual(Array.from(png.data), Array.from(doc.flatten(0).data));
  const types = png.chunks.map((c) => c.type);
  assert.equal(types.filter((t) => t === "fcTL").length, 4);
  assert.equal(types.filter((t) => t === "fdAT").length, 3);
  assert.equal(png.chunks.find((c) => c.type === "acTL").body.readUInt32BE(4), 2);
  assert.ok(types.indexOf("acTL") < types.indexOf("IDAT"));
});

test("registers into PixelStudio and stays quiet when it's missing", () => {
  const seen = { f: [], p: [], e: [] };
  global.PixelStudio = {
    registerFilter: (f) => seen.f.push(f.id),
    registerPalette: (p) => seen.p.push(p.id),
    registerExporter: (e) => seen.e.push(e.id),
  };
  const path = require.resolve("../client/studio/fx.js");
  delete require.cache[path];
  const savedSelf = global.self;
  global.self = global; // the plugin looks for PixelStudio on its root
  try {
    require(path);
  } finally {
    global.self = savedSelf;
    delete global.PixelStudio;
    delete require.cache[path];
  }
  assert.ok(seen.f.includes("outline") && seen.f.length >= 20);
  assert.ok(seen.p.length >= 20);
  assert.ok(seen.e.includes("gif"));
  assert.doesNotThrow(() => require(path));
});
