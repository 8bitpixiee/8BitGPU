const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'assets/avatar/animations/manifest.json')));
let tick, now = 0;
let failImages = false;
const reduced = { matches: false };
const draws = [];
const context = {
    window: {}, location: { href: 'https://example.test/arcade.html', origin: 'https://example.test' }, URL,
    matchMedia: () => reduced, performance: { now: () => now }, Date,
    requestAnimationFrame: fn => { tick = fn; },
    fetch: async () => ({ ok: true, json: async () => catalog }),
    Image: class { set src(value) { queueMicrotask(() => failImages ? this.onerror() : this.onload()); } },
    document: { hidden: false, createElement: () => ({
        style: {}, isConnected: true, setAttribute() {},
        getContext: () => ({ clearRect() {}, drawImage: (...args) => draws.push(args) })
    }) }
};
vm.runInNewContext(fs.readFileSync(path.join(root, 'client/arcade/avatar-animations.js'), 'utf8'), context);
const node = { classList: { add() {}, contains: name => name === 'is-flying' && node.flying } };
function image() { return { isConnected: true, style: { cssText: 'filter:sepia(1)' }, replaceWith(canvas) { this.canvas = canvas; } }; }
function frame(time) { now = time; tick(time); return draws.at(-1); }
(async () => {
    const img = image();
    await context.window.AvatarAnimations.attach(node, img, '/assets/avatar/body_fem_v1.png');
    assert.equal(img.canvas.width, 48);
    assert.equal(img.canvas.height, 43);
    assert.equal(img.canvas.style.cssText, img.style.cssText);
    assert.equal(frame(400)[1], 96); // Third idle frame.
    context.window.AvatarAnimations.moved(node);
    assert.equal(frame(450)[2], 43); // Walking row.
    assert.equal(frame(700)[2], 0); // Walk expires.
    node.flying = true;
    assert.equal(frame(800)[2], 86);
    node._emote = 'wave'; node._emoteUntil = Date.now() + 5000;
    assert.equal(frame(900)[2], 430); // Emotes override flight.
    node._emoteUntil = 0;
    assert.equal(frame(1000)[2], 86); // Expired emote returns to flight.
    reduced.matches = true;
    const still = frame(1100);
    assert.equal(still[1], 0); assert.equal(still[2], 0);
    const unknown = image();
    await context.window.AvatarAnimations.attach(node, unknown, '/assets/avatar/missing.png');
    assert.equal(unknown.canvas, undefined);
    const external = image();
    await context.window.AvatarAnimations.attach(node, external, 'https://other.test/body_fem_v1.png');
    assert.equal(external.canvas, undefined);
    failImages = true;
    const failed = image();
    await context.window.AvatarAnimations.attach(node, failed, '/assets/avatar/Null.png');
    assert.equal(failed.canvas, undefined); // Loading failure preserves PNG.
    img.canvas.isConnected = false;
    frame(1200);
    console.log('PASS: frame crops, movement, flight, emote priority/expiration, reduced motion, filters, fallback, cleanup.');
})().catch(error => { console.error(error); process.exitCode = 1; });
