const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { runInNewContext } = require('node:vm');
const script = readFileSync(join(__dirname, '../client/media/twitch-embed.js'), 'utf8');

function embed(href, { ancestors = [], referrer = '', outer } = {}) {
    const elements = Object.fromEntries(['twitch-player', 'twitch-chat', 'twitch-embed-status'].map(id => [id, { hidden: true }]));
    const location = { href, ancestorOrigins: ancestors };
    const window = { location };
    window.parent = outer || window;
    runInNewContext(script, { URL, location, window, document: { referrer, getElementById: id => elements[id] } });
    return elements;
}

for (const href of ['https://8bitgpu.example/media-player.html', 'https://8bitgpu.villainerafit.workers.dev/media-player.html', 'http://localhost:8787/media-player.html']) {
    test(`player and chat use current hostname: ${href}`, () => {
        const elements = embed(href);
        const player = new URL(elements['twitch-player'].src);
        const chat = new URL(elements['twitch-chat'].src);
        for (const url of [player, chat]) assert.deepEqual(url.searchParams.getAll('parent'), [new URL(href).hostname]);
        assert.equal(player.origin, 'https://player.twitch.tv');
        assert.equal(player.searchParams.get('channel'), '8bit_pixiee');
        assert.equal(player.searchParams.get('muted'), 'true');
        assert.equal(player.searchParams.get('autoplay'), 'true');
        assert.equal(chat.pathname, '/embed/8bit_pixiee/chat');
        assert.ok(chat.searchParams.has('darkpopout'));
    });
}

test('nested desktop frame deduplicates its own domain and includes other ancestors', () => {
    const outer = { location: { href: 'https://desktop.example/index.html' } };
    outer.parent = outer;
    const result = embed('https://media.example/media-player.html', {
        ancestors: ['https://desktop.example', 'https://portal.example'],
        referrer: 'https://desktop.example/index.html', outer
    });
    for (const id of ['twitch-player', 'twitch-chat']) {
        assert.deepEqual(new URL(result[id].src).searchParams.getAll('parent'), ['media.example', 'desktop.example', 'portal.example']);
    }
});

test('cross-origin parent access falls back to referrer', () => {
    const outer = { get location() { throw Error('Blocked cross-origin frame'); } };
    outer.parent = outer;
    const result = embed('https://media.example/media-player.html', { outer, referrer: 'https://desktop.example/index.html' });
    assert.deepEqual(new URL(result['twitch-chat'].src).searchParams.getAll('parent'), ['media.example', 'desktop.example']);
});

test('file preview explains missing web hostname instead of loading an invalid embed', () => {
    const result = embed('file:///C:/Users/steak/Documents/8BitGPU/media-player.html');
    assert.equal(result['twitch-player'].src, undefined);
    assert.equal(result['twitch-chat'].src, undefined);
    assert.equal(result['twitch-embed-status'].hidden, false);
    assert.match(result['twitch-embed-status'].textContent, /local web server/);
});
