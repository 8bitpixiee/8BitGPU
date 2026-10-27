const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const path = require("node:path");
const { isActive, readState, knock } = require("../client/desktop/halloween.js");

test("desktop and arcade literal local assets all exist", () => {
  const root = path.resolve(__dirname, "..");
  for (const page of ["index.html", "arcade.html"]) {
    const html = fs.readFileSync(path.join(root, page), "utf8");
    for (const tag of html.matchAll(/<(?:img|script|link)\b[^>]*>/gi)) {
      const ref = tag[0].match(/\b(?:src|href)="([^"]+)"/i)?.[1];
      if (!ref || /^(?:[a-z]+:|\/\/)/i.test(ref)) continue;
      const filename = decodeURIComponent(ref.split(/[?#]/)[0]).replace(/^\//, "");
      assert.ok(fs.existsSync(path.join(root, filename)), `${page}: missing ${ref}`);
    }
  }
});

test("Halloween runs in October through November 1, with explicit preview overrides", () => {
  for (const [month, day, active] of [[8, 30, false], [9, 1, true], [9, 31, true], [10, 1, true], [10, 2, false]])
    assert.equal(isActive(new Date(2026, month, day)), active);
  assert.equal(isActive(new Date(2026, 5, 1), "?halloween=1"), true);
  assert.equal(isActive(new Date(2026, 9, 31), "?halloween=0"), false);
});

test("bad and unavailable saved progress starts safely, with bounded counters", () => {
  for (const value of [undefined, "broken", "null", "[]", '{"candy":"6"}'])
    assert.deepEqual(readState(value), { knocks: 0, candy: 0, quiet: false });
  assert.deepEqual(readState('{"knocks":-1,"candy":999,"quiet":true}'), { knocks: 0, candy: 6, quiet: true });
});

test("tricks never take candy and six different treats finish the bowl", () => {
  let state = readState();
  let tricks = 0;
  const messages = new Set();
  for (let i = 0; i < 8; i++) {
    const old = { ...state };
    const result = knock(state);
    assert.deepEqual(state, old);
    assert.equal(result.state.candy, old.candy + (result.trick ? 0 : 1));
    if (result.trick) tricks++;
    else messages.add(result.message);
    state = result.state;
  }
  assert.equal(tricks, 2);
  assert.equal(messages.size, 6);
  assert.equal(state.candy, 6);
  assert.deepEqual(knock(state).state, state);
});

function desktop({ blockedStorage = false } = {}) {
  const elements = new Map();
  function element(selector) {
    if (!elements.has(selector)) {
      const classes = new Set();
      elements.set(selector, {
        hidden: true, handlers: {}, attributes: {},
        classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c), toggle: (c, on) => on ? classes.add(c) : classes.delete(c), contains: (c) => classes.has(c) },
        setAttribute(k, v) { this.attributes[k] = v; },
        addEventListener(k, fn) { this.handlers[k] = fn; },
        focus() { this.focused = true; },
      });
    }
    return elements.get(selector);
  }
  const host = element("host");
  host.querySelector = element;
  const docEvents = {};
  const timers = new Map();
  let saved;
  const document = {
    hidden: false, getElementById: () => host,
    addEventListener: (k, fn) => { docEvents[k] = fn; },
  };
  const window = {
    document, location: { search: "?halloween=1" },
    localStorage: { getItem() { if (blockedStorage) throw Error("blocked"); return saved; }, setItem(k, v) { if (blockedStorage) throw Error("blocked"); saved = v; } },
    setTimeout(fn) { timers.set(1, fn); return 1; }, clearTimeout(id) { timers.delete(id); },
  };
  vm.runInNewContext(fs.readFileSync(require.resolve("../client/desktop/halloween.js"), "utf8"), { window, URLSearchParams, Date });
  const click = (name) => element(`[data-halloween-${name}]`).handlers.click();
  return { element, host, document, docEvents, timers, click, saved: () => saved };
}

test("desktop controls open, collect, persist, and return focus on Escape", () => {
  const ui = desktop();
  assert.equal(ui.host.hidden, false);
  ui.click("open");
  assert.equal(ui.element("[data-halloween-panel]").hidden, false);
  assert.equal(ui.element("[data-halloween-open]").attributes["aria-expanded"], "true");
  ui.click("knock");
  assert.equal(ui.element("[data-halloween-count]").textContent, "1 / 6 treats");
  assert.equal(JSON.parse(ui.saved()).candy, 1);
  ui.docEvents.keydown({ key: "Escape" });
  assert.equal(ui.element("[data-halloween-panel]").hidden, true);
  assert.equal(ui.element("[data-halloween-open]").focused, true);
});

test("quiet mode and leaving the tab clean up ghost effects and timers", () => {
  const ui = desktop();
  ui.click("open");
  for (let i = 0; i < 3; i++) ui.click("knock");
  const ghost = ui.element("[data-halloween-ghost]");
  assert.equal(ghost.hidden, false);
  ui.document.hidden = true;
  ui.docEvents.visibilitychange();
  assert.equal(ghost.hidden, true);
  assert.equal(ui.timers.size, 0);
  const quiet = ui.element("[data-halloween-quiet]");
  quiet.checked = true;
  quiet.handlers.change();
  for (let i = 0; i < 3; i++) ui.click("knock");
  assert.equal(ghost.hidden, true);
  assert.equal(ui.host.classList.contains("is-quiet"), true);
  assert.equal(JSON.parse(ui.saved()).quiet, true);
});

test("blocked browser storage does not break trick or treat", () => {
  const ui = desktop({ blockedStorage: true });
  ui.click("open");
  ui.click("knock");
  assert.equal(ui.element("[data-halloween-count]").textContent, "1 / 6 treats");
});
