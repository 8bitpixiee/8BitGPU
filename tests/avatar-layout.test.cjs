const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const layout = require("../client/shared/avatar-layout.js");

const anchors = JSON.parse(fs.readFileSync(path.join(__dirname, "../assets/avatar/anchors.json"), "utf8"));
layout.setData(anchors);

test("standard parts sit inside the stage by their canvas offset", () => {
  const box = layout.place("assets/avatar/body_fem_v1.png", "hair", "assets/avatar/hair_fem_v1.png");
  assert.equal(box.left, (anchors.canvas.standard.x / 50) * 100);
  assert.equal(box.top, (anchors.canvas.standard.y / 50) * 100);
  assert.equal(box.width, (48 / 50) * 100);
});

test("wide custom canvases fill the stage", () => {
  const box = layout.place("assets/avatar/Null.png", "body", "assets/avatar/Null.png");
  assert.deepEqual(box, { left: 0, top: 0, width: 100, height: 100 });
});

test("custom bodies pull head parts up onto their head", () => {
  const plain = layout.place("assets/avatar/body_fem_v1.png", "eyes", "assets/avatar/eyes_fem_v1.png");
  const custom = layout.place("assets/avatar/Null.png", "eyes", "assets/avatar/eyes_fem_v1.png");
  assert.ok(custom.top < plain.top - 10);
});

test("masc keeps its lowered eyes", () => {
  const fem = layout.place("assets/avatar/body_fem_v2.png", "eyes", "assets/avatar/eyes_mac_v1.png");
  const masc = layout.place("assets/avatar/body_masc_v2.png", "eyes", "assets/avatar/eyes_mac_v1.png");
  assert.ok(masc.top > fem.top);
});

test("saved root urls and spaces in names still resolve", () => {
  assert.equal(layout.fileOf("/Null.png?v=2"), "Null.png");
  assert.equal(layout.fileOf("assets/avatar/ponytail%20v1.png"), "ponytail v1.png");
  assert.ok(layout.place("/Null.png", "fit", "assets/avatar/ponytail v1.png"));
});

test("every body in the catalogue has a rig or a plain default", () => {
  for (const key of Object.keys(anchors.rigs))
    assert.ok(layout.rigFor(key + (key.endsWith(".png") ? "" : "1.png")));
});

test("old saved adjustments are ignored until the outfit is saved on the new layout", () => {
  const old = { adjustments: { hair: { x: 5, y: 5, scale: 1.2 } } };
  assert.equal(layout.transform(old, "hair"), "translate(0%, 0%) scale(1)");
  const fresh = { layout: 2, adjustments: { hair: { x: 5, y: -3, scale: 1.2 } } };
  assert.equal(layout.transform(fresh, "hair"), "translate(5%, -3%) scale(1.2)");
});

test("missing anchor data leaves styling alone", () => {
  layout.setData(null);
  assert.equal(layout.place("a.png", "hair", "b.png"), null);
  layout.setData(anchors);
});

test("wide bodies are reported so docks can shrink them to fit", () => {
  assert.equal(layout.isWide("assets/avatar/Maxie_F.png"), true);
  assert.equal(layout.isWide("assets/avatar/body_fem_v1.png"), false);
});
