const test = require("node:test");
const assert = require("node:assert/strict");
const { core, PixelStudio } = require("../client/studio/editor.js");
const { Doc, History, Tx, pack } = core;

const RED = pack(255, 0, 0, 255);
const BLUE = pack(0, 0, 255, 255);

function filled(w, h, fn) {
  const d = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) core.setPx(d, y * w + x, fn(x, y) || 0);
  return d;
}

test("rle round-trips raw and indexed forms", () => {
  const d = filled(9, 7, (x, y) => (x === y ? RED : y > 4 ? BLUE : 0));
  assert.deepEqual([...core.rleDecode(core.rleEncode(d), d.length)], [...d]);
  const table = new Map([[0, 0], [RED, 1], [BLUE, 2]]);
  const back = core.rleDecodeIdx(core.rleEncodeIdx(d, table), [0, RED, BLUE], d.length);
  assert.deepEqual([...back], [...d]);
});

test("base64 handles every padding length", () => {
  for (let n = 0; n < 8; n++) {
    const bytes = Uint8Array.from({ length: n }, (_, i) => i * 37 + 1);
    assert.deepEqual([...core.b64dec(core.b64enc(bytes))], [...bytes]);
  }
});

test("blend modes: multiply darkens, screen lightens, add clamps", () => {
  const mk = (c) => Uint8ClampedArray.from(c);
  const base = () => mk([100, 100, 100, 255]);
  const src = mk([128, 128, 128, 255]);
  const m = base(); core.compositeCel(m, src, 255, "multiply");
  const s = base(); core.compositeCel(s, src, 255, "screen");
  const a = mk([200, 200, 200, 255]); core.compositeCel(a, mk([200, 10, 0, 255]), 255, "add");
  assert.ok(m[0] < 100 && s[0] > 128 && a[0] === 255 && a[1] === 210);
  const half = base(); core.compositeCel(half, mk([200, 200, 200, 255]), 128, "normal");
  assert.ok(half[0] > 140 && half[0] < 160);
});

test("flood fill: contiguous stops at walls, global jumps them, tolerance widens", () => {
  const d = filled(6, 4, (x) => (x === 3 ? RED : 0));
  assert.equal(core.maskCount(core.floodFill(d, 6, 4, 0, 0, 0, true)), 12);
  assert.equal(core.maskCount(core.floodFill(d, 6, 4, 0, 0, 0, false)), 20);
  const near = filled(4, 1, (x) => pack(10 + x * 10, 0, 0, 255));
  assert.equal(core.maskCount(core.floodFill(near, 4, 1, 0, 0, 0, true)), 1);
  assert.equal(core.maskCount(core.floodFill(near, 4, 1, 0, 0, 15, true)), 2);
  const limit = core.maskFromShape(6, 4, "rect", 0, 0, 1, 3);
  assert.equal(core.maskCount(core.floodFill(d, 6, 4, 0, 0, 0, true, limit)), 8);
});

test("line hits both ends, ellipse is symmetric and outline is inside fill", () => {
  const pts = [];
  core.line(0, 0, 7, 3, (x, y) => pts.push([x, y]));
  assert.deepEqual(pts[0], [0, 0]);
  assert.deepEqual(pts[pts.length - 1], [7, 3]);
  const set = (filled) => {
    const s = new Set();
    core.ellipse(0, 0, 10, 6, filled, (x, y) => s.add(x + "," + y));
    return s;
  };
  const fill = set(true), out = set(false);
  for (const k of out) assert.ok(fill.has(k));
  assert.ok(out.size < fill.size);
  for (const k of fill) {
    const [x, y] = k.split(",").map(Number);
    assert.ok(fill.has(10 - x + "," + y) && fill.has(x + "," + (6 - y)), "symmetric " + k);
  }
  // outline is 8-connected enough that the interior centre is not outline
  assert.ok(!out.has("5,3"));
});

test("brush offsets: odd circle is a plus at 3, square is full", () => {
  assert.equal(core.brushOffsets(1, "circle").length, 2);
  assert.equal(core.brushOffsets(3, "circle").length / 2, 9 - 4);
  assert.equal(core.brushOffsets(3, "square").length / 2, 9);
  assert.equal(core.brushOffsets(4, "square").length / 2, 16);
});

test("selection masks combine and measure", () => {
  const a = core.maskFromShape(8, 8, "rect", 0, 0, 3, 3);
  const b = core.maskFromShape(8, 8, "rect", 2, 2, 5, 5);
  assert.equal(core.maskCount(core.combineMasks(a, b, "add", 8, 8)), 16 + 16 - 4);
  assert.equal(core.maskCount(core.combineMasks(a, b, "sub", 8, 8)), 12);
  assert.equal(core.maskCount(core.combineMasks(a, b, "intersect", 8, 8)), 4);
  assert.deepEqual(core.maskBounds(b, 8, 8), { x: 2, y: 2, w: 4, h: 4 });
  assert.equal(core.maskCount(core.invertMask(a, 8, 8)), 48);
  const tri = core.maskFromPolygon(10, 10, [[0, 0], [8, 0], [0, 8]]);
  assert.ok(tri[1 * 10 + 1] && !tri[7 * 10 + 7]);
});

test("flip and rotate keep pixels", () => {
  const d = filled(4, 4, (x, y) => (x === 0 && y === 0 ? RED : 0));
  const h = core.transformRegion(d, 4, 4, null, "flipH");
  assert.equal(core.getPx(h.data, 3), RED);
  const v = core.transformRegion(d, 4, 4, null, "flipV");
  assert.equal(core.getPx(v.data, 12), RED);
  const r = core.transformRegion(d, 4, 4, null, "rotCW");
  assert.equal(core.getPx(r.data, 3), RED);
  const sc = core.scaleRegion(d, 4, 4, null, 2, 2);
  assert.equal(core.maskCount(sc.mask), 16);
  assert.equal(core.getPx(sc.data, 5), RED);
});

test("history undo/redo order and redo cleared by new push", () => {
  const h = new History(), log = [];
  h.push({ undo: () => log.push("u1"), redo: () => log.push("r1") });
  h.push({ undo: () => log.push("u2"), redo: () => log.push("r2") });
  h.undo(); h.undo(); h.redo();
  assert.deepEqual(log, ["u2", "u1", "r1"]);
  h.push({ undo() {}, redo() {} });
  assert.equal(h.canRedo, false);
});

test("tx rolls back and reports changed pixels only", () => {
  const cel = filled(3, 3, () => 0);
  const tx = new Tx(cel);
  tx.set(0, RED); tx.set(1, 0);
  assert.equal(tx.changes().size, 1);
  tx.rollback();
  assert.equal(core.getPx(cel, 0), 0);
});

test("doc ops: px, layers, frames, idempotent re-apply", () => {
  const d = new Doc(8, 8);
  d.apply({ k: "px", f: 0, l: 1, pts: [1, 1, RED, 2, 2, BLUE] });
  assert.equal(core.getPx(d.cel(1, 0), 9), RED);
  const addLayer = { k: "layer-add", layer: { id: 77, name: "Top", opacity: 255, blend: "multiply" }, at: 1 };
  assert.equal(d.apply(addLayer), true);
  assert.equal(d.apply(addLayer), false);
  const addFrame = { k: "frame-add", fid: 55, at: 1, ms: 200, cels: { 1: core.rleEncode(d.cel(1, 0)) } };
  assert.equal(d.apply(addFrame), true);
  assert.equal(d.apply(addFrame), false);
  assert.equal(d.frames.length, 2);
  assert.equal(core.getPx(d.cel(1, 1), 9), RED);
  assert.equal(d.apply({ k: "layer-del", id: 77 }), true);
  assert.equal(d.apply({ k: "layer-del", id: 1 }), false, "last layer stays");
  d.apply({ k: "frame-del", fid: 55 });
  assert.equal(d.frames.length, 1);
});

test("flatten stacks visible layers and respects hidden ones", () => {
  const d = new Doc(2, 1);
  d.apply({ k: "layer-add", layer: { id: 9, name: "t" }, at: 1 });
  d.apply({ k: "px", f: 0, l: 1, pts: [0, 0, RED] });
  d.apply({ k: "px", f: 0, l: 9, pts: [0, 0, BLUE] });
  assert.equal(core.getPx(d.flatten(0).data, 0), BLUE);
  d.apply({ k: "layer-set", id: 9, props: { visible: false } });
  assert.equal(core.getPx(d.flatten(0).data, 0), RED);
});

test("serialize round-trips and a 64x64 8-frame sprite stays small", () => {
  const d = new Doc(64, 64);
  d.apply({ k: "layer-add", layer: { id: 5, name: "Shade", blend: "multiply", opacity: 128 } });
  for (let i = 1; i < 8; i++) d.apply({ k: "frame-add", fid: 100 + i, ms: 80 + i });
  for (let f = 0; f < 8; f++) {
    const pts = [];
    for (let y = 8; y < 56; y++) for (let x = 10 + f; x < 50 + f; x++) pts.push(x, y, (x + y) % 7 === 0 ? RED : pack(40 + y * 3, 90, 200 - x, 255));
    d.apply({ k: "px", f, l: 1, pts });
    d.apply({ k: "px", f, l: 5, pts: [20, 20, pack(0, 0, 0, 90)] });
  }
  d.tags = [{ name: "walk", from: 0, to: 3, dir: "pingpong", color: "#f0f" }];
  const s = d.serialize();
  assert.ok(s.length < 200 * 1024, "size " + s.length);
  const back = Doc.parse(s);
  assert.equal(back.frames.length, 8);
  assert.equal(back.layers[1].blend, "multiply");
  assert.equal(back.tags[0].dir, "pingpong");
  for (let f = 0; f < 8; f++) assert.deepEqual([...back.flattenData(f)], [...d.flattenData(f)]);
  assert.equal(back.serialize(), s);
});

test("canvas resize, crop, rotate and flip apply to every cel", () => {
  const d = new Doc(4, 2);
  d.apply({ k: "px", f: 0, l: 1, pts: [0, 0, RED] });
  d.apply({ k: "canvas", w: 6, h: 4, ox: 1, oy: 2 });
  assert.equal(core.getPx(d.cel(1, 0), 2 * 6 + 1), RED);
  d.apply({ k: "canvas", w: 3, h: 2, ox: -1, oy: -2 });
  assert.equal(core.getPx(d.cel(1, 0), 0), RED);
  const e = new Doc(4, 2);
  e.apply({ k: "px", f: 0, l: 1, pts: [0, 0, RED] });
  e.apply({ k: "rot", d: 90 });
  assert.equal(e.w, 2);
  assert.equal(core.getPx(e.cel(1, 0), 1), RED);
  e.apply({ k: "flip", axis: "h" });
  assert.equal(core.getPx(e.cel(1, 0), 0), RED);
  e.apply({ k: "scale", w: 4, h: 8 });
  assert.equal(e.w, 4);
});

test("registries replace by id and validate", () => {
  PixelStudio.registerFilter({ id: "t", label: "T", params: [], apply: (i) => i });
  PixelStudio.registerFilter({ id: "t", label: "T2", params: [], apply: (i) => i });
  assert.equal(PixelStudio.filters.filter((f) => f.id === "t").length, 1);
  assert.equal(PixelStudio.filters.find((f) => f.id === "t").label, "T2");
  assert.throws(() => PixelStudio.registerExporter({ id: "x" }));
  PixelStudio.registerPalette({ id: "p", name: "P", colors: ["#000000"] });
  assert.equal(PixelStudio.palettes.length, 1);
});
