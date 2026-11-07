// Pixel studio effects layer: filters, palettes, palette tools, exporters, importers.
// Loads after editor.js and plugs into the PixelStudio registries. Everything
// below the registration block is pure (ImageData in, ImageData out) so node can test it.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.StudioFX = api;
})(typeof self !== "undefined" ? self : this, function (root) {
  // ---------- tiny colour + image helpers ----------

  // node has no ImageData, so fall back to a stand-in with the same shape
  class FakeImageData {
    constructor(data, w, h) {
      if (typeof data === "number") {
        h = w;
        w = data;
        data = new Uint8ClampedArray(w * h * 4);
      }
      this.data = data;
      this.width = w;
      this.height = h;
    }
  }

  function makeImage(w, h, data) {
    const px = data || new Uint8ClampedArray(w * h * 4);
    if (typeof root.ImageData === "function") return new root.ImageData(px, w, h);
    return new FakeImageData(px, w, h);
  }

  const cloneImage = (img) => makeImage(img.width, img.height, new Uint8ClampedArray(img.data));
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const clamp8 = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));

  function parseColor(c, fallback) {
    if (Array.isArray(c)) return [c[0] | 0, c[1] | 0, c[2] | 0];
    if (c && typeof c === "object") return [c.r | 0, c.g | 0, c.b | 0];
    if (typeof c === "string") {
      let h = c.trim().replace(/^#/, "");
      if (h.length === 3) h = h.replace(/./g, "$&$&");
      if (/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h)) {
        const n = parseInt(h.slice(0, 6), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
      }
    }
    return fallback || [0, 0, 0];
  }

  const hex2 = (n) => n.toString(16).padStart(2, "0");
  const toHex = (r, g, b) => "#" + hex2(r) + hex2(g) + hex2(b);

  function rgbToHsl(r, g, b) {
    r /= 255;
    g /= 255;
    b /= 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const l = (max + min) / 2;
    if (max === min) return [0, 0, l];
    const d = max - min;
    const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    let h;
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return [h * 60, s, l];
  }

  function hslToRgb(h, s, l) {
    h = (((h % 360) + 360) % 360) / 360;
    if (s === 0) {
      const v = clamp8(l * 255);
      return [v, v, v];
    }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const f = (t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [clamp8(f(h + 1 / 3) * 255), clamp8(f(h) * 255), clamp8(f(h - 1 / 3) * 255)];
  }

  // rec.601 luma, 0..255
  const luma = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;

  // walk h toward target by at most `amount` degrees, the short way round
  function hueToward(h, target, amount) {
    let d = ((target - h + 540) % 360) - 180;
    d = clamp(d, -amount, amount);
    return h + d;
  }

  function mulberry32(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- palettes (first six checked against Aseprite's own presets) ----------

  const P = (id, name, list) => ({ id, name, colors: list.trim().split(/\s+/).map((c) => "#" + c.replace("#", "").toLowerCase()) });

  function generatedPalettes() {
    const gray16 = [];
    for (let i = 0; i < 16; i++) gray16.push(toHex(i * 17, i * 17, i * 17));
    const web = [];
    for (let r = 0; r < 6; r++) for (let g = 0; g < 6; g++) for (let b = 0; b < 6; b++) web.push(toHex(r * 51, g * 51, b * 51));
    const cpc = [];
    for (const b of [0, 128, 255]) for (const g of [0, 128, 255]) for (const r of [0, 128, 255]) cpc.push(toHex(r, g, b));
    return [
      { id: "grayscale-16", name: "Grayscale 16", colors: gray16 },
      { id: "websafe-216", name: "Web safe 216", colors: web },
      { id: "amstrad-cpc", name: "Amstrad CPC 27", colors: cpc },
    ];
  }

  const PALETTES = [
    P("gameboy", "Game Boy", "0f380f 306230 8bac0f 9bbc0f"),
    P("gameboy-pocket", "Game Boy Pocket", "1f1f1f 4d533c 8b956d c4cfa1"),
    P("monochrome", "1-bit black and white", "000000 ffffff"),
    P("grayscale-4", "Grayscale 4", "000000 555555 aaaaaa ffffff"),
    P("cga", "CGA mode 4", "000000 55ffff ff55ff ffffff"),
    P("ega", "EGA 16", "000000 0000aa 00aa00 00aaaa aa0000 aa00aa aa5500 aaaaaa 555555 5555ff 55ff55 55ffff ff5555 ff55ff ffff55 ffffff"),
    P("win16", "Windows 16", "000000 800000 008000 808000 000080 800080 008080 c0c0c0 808080 ff0000 00ff00 ffff00 0000ff ff00ff 00ffff ffffff"),
    P("zx-spectrum", "ZX Spectrum", "000000 0000d7 d70000 d700d7 00d700 00d7d7 d7d700 d7d7d7 0000ff ff0000 ff00ff 00ff00 00ffff ffff00 ffffff"),
    P("msx", "MSX", "000000 3eb849 74d07d 5955e0 8076f1 b95e51 65dbef db6559 ff897d ccc35e ded087 3aa241 b766b5 cccccc ffffff"),
    P("pico8", "PICO-8", "000000 1d2b53 7e2553 008751 ab5236 5f574f c2c3c7 fff1e8 ff004d ffa300 ffec27 00e436 29adff 83769c ff77a8 ffccaa"),
    P("c64", "Commodore 64", "000000 ffffff 880000 aaffee cc44cc 00cc55 0000aa eeee77 dd8855 664400 ff7777 333333 777777 aaff66 0088ff bbbbbb"),
    P("nes", "NES", "7c7c7c 0000fc 0000bc 4428bc 940084 a80020 a81000 881400 503000 007800 006800 005800 004058 000000 bcbcbc 0078f8 0058f8 6844fc d800cc e40058 f83800 e45c10 ac7c00 00b800 00a800 00a844 008888 f8f8f8 3cbcfc 6888fc 9878f8 f878f8 f85898 f87858 fca044 f8b800 b8f818 58d854 58f898 00e8d8 787878 fcfcfc a4e4fc b8b8f8 d8b8f8 f8b8f8 f8a4c0 f0d0b0 fce0a8 f8d878 d8f878 b8f8b8 b8f8d8 00fcfc f8d8f8"),
    P("arne16", "Arne 16", "000000 493c2b be2633 e06f8b 9d9d9d a46422 eb8931 f7e26b ffffff 1b2632 2f484e 44891a a3ce27 005784 31a2f2 b2dcef"),
    P("sweetie16", "Sweetie 16", "1a1c2c 5d275d b13e53 ef7d57 ffcd75 a7f070 38b764 257179 29366f 3b5dc9 41a6f6 73eff7 f4f4f4 94b0c2 566c86 333c57"),
    P("dawnbringer16", "DawnBringer 16", "140c1c 442434 30346d 4e4a4e 854c30 346524 d04648 757161 597dce d27d2c 8595a1 6daa2c d2aa99 6dc2ca dad45e deeed6"),
    P("dawnbringer32", "DawnBringer 32", "000000 222034 45283c 663931 8f563b df7126 d9a066 eec39a fbf236 99e550 6abe30 37946e 4b692f 524b24 323c39 3f3f74 306082 5b6ee1 639bff 5fcde4 cbdbfc ffffff 9badb7 847e87 696a6a 595652 76428a ac3232 d95763 d77bba 8f974a 8a6f30"),
    P("endesga32", "Endesga 32", "be4a2f d77643 ead4aa e4a672 b86f50 733e39 3e2731 a22633 e43b44 f77622 feae34 fee761 63c74d 3e8948 265c42 193c3e 124e89 0099db 2ce8f5 ffffff c0cbdc 8b9bb4 5a6988 3a4466 262b44 181425 ff0044 68386c b55088 f6757a e8b796 c28569"),
    P("apollo", "Apollo", "172038 253a5e 3c5e8b 4f8fba 73bed3 a4dddb 19332d 25562e 468232 75a743 a8ca58 d0da91 4d2b32 7a4841 ad7757 c09473 d7b594 e7d5b3 341c27 602c2c 884b2b be772b de9e41 e8c170 241527 411d31 752438 a53030 cf573c da863e 1e1d39 402751 7a367b a23e8c c65197 df84a5 090a14 10141f 151d28 202e37 394a50 577277 819796 a8b5b2 c7cfcc ebede9"),
    P("resurrect64", "Resurrect 64", "2e222f 3e3546 625565 966c6c ab947a 694f62 7f708a 9babb2 c7dcd0 ffffff 6e2727 b33831 ea4f36 f57d4a ae2334 e83b3b fb6b1d f79617 f9c22b 7a3045 9e4539 cd683d e6904e fbb954 4c3e24 676633 a2a947 d5e04b fbff86 165a4c 239063 1ebc73 91db69 cddf6c 313638 3c5956 4f8f81 6dbd8c 7a9b7b 0b5e65 0b8a8f 0eaf9b 30e1b9 8ff8e2 323353 484a77 4d65b4 4d9be6 8fd3ff 45293f 6b3e75 905ea9 a884f3 eaaded 753c54 a24b6f cf657f ed8099 831c5d c32454 f04f78 f68181 fca790 fdcbb0"),
  ].concat(generatedPalettes());

  const paletteById = (id) => PALETTES.find((p) => p.id === id) || PALETTES[0];

  // ---------- palette tools ----------

  // blend two colours in n steps; hueShift bends the middle toward warm/cool like pixel-art ramps do
  function generateRamp(from, to, steps, opts) {
    opts = opts || {};
    const a = parseColor(from);
    const b = parseColor(to);
    const n = Math.max(2, steps | 0);
    const mode = opts.mode || "rgb";
    const out = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      let c;
      if (mode === "hsl") {
        const ha = rgbToHsl(a[0], a[1], a[2]);
        const hb = rgbToHsl(b[0], b[1], b[2]);
        const dh = ((hb[0] - ha[0] + 540) % 360) - 180;
        c = hslToRgb(ha[0] + dh * t, ha[1] + (hb[1] - ha[1]) * t, ha[2] + (hb[2] - ha[2]) * t);
      } else {
        c = [0, 1, 2].map((k) => clamp8(a[k] + (b[k] - a[k]) * t));
      }
      if (opts.hueShift) {
        const [h, s, l] = rgbToHsl(c[0], c[1], c[2]);
        // highlights drift toward yellow, shadows toward blue-purple
        const target = t >= 0.5 ? 60 : 260;
        const pull = Math.abs(t - 0.5) * 2 * opts.hueShift;
        c = hslToRgb(hueToward(h, target, pull), s, l);
      }
      out.push(toHex(c[0], c[1], c[2]));
    }
    return out;
  }

  // colour -> count for visible pixels
  function collectColors(img, alphaMin) {
    const min = alphaMin == null ? 128 : alphaMin;
    const map = new Map();
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < min) continue;
      const key = (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
      map.set(key, (map.get(key) || 0) + 1);
    }
    return map;
  }

  // median cut over a colour->count map, returns [[r,g,b],...] with at most n entries
  function medianCut(colorMap, n) {
    const all = [];
    for (const [key, count] of colorMap) all.push({ r: (key >> 16) & 255, g: (key >> 8) & 255, b: key & 255, n: count });
    if (!all.length) return [];
    if (all.length <= n) return all.map((c) => [c.r, c.g, c.b]);
    const range = (box) => {
      const lo = [255, 255, 255];
      const hi = [0, 0, 0];
      for (const c of box) {
        const v = [c.r, c.g, c.b];
        for (let k = 0; k < 3; k++) {
          if (v[k] < lo[k]) lo[k] = v[k];
          if (v[k] > hi[k]) hi[k] = v[k];
        }
      }
      const spans = [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]];
      const ch = spans.indexOf(Math.max(...spans));
      return { ch, span: spans[ch] };
    };
    const boxes = [all];
    while (boxes.length < n) {
      // split the box that's widest in some channel, weighted a bit by how many pixels it holds
      let best = -1;
      let bestScore = 0;
      boxes.forEach((box, i) => {
        if (box.length < 2) return;
        const score = range(box).span * Math.log2(2 + box.reduce((s, c) => s + c.n, 0));
        if (score > bestScore) {
          bestScore = score;
          best = i;
        }
      });
      if (best < 0 || bestScore === 0) break;
      const box = boxes[best];
      const key = ["r", "g", "b"][range(box).ch];
      box.sort((a, b) => a[key] - b[key]);
      const half = box.reduce((s, c) => s + c.n, 0) / 2;
      let acc = 0;
      let cut = 1;
      for (let i = 0; i < box.length - 1; i++) {
        acc += box[i].n;
        cut = i + 1;
        if (acc >= half) break;
      }
      boxes.splice(best, 1, box.slice(0, cut), box.slice(cut));
    }
    return boxes.map((box) => {
      let total = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      for (const c of box) {
        total += c.n;
        r += c.r * c.n;
        g += c.g * c.n;
        b += c.b * c.n;
      }
      return [Math.round(r / total), Math.round(g / total), Math.round(b / total)];
    });
  }

  function extractPalette(img, max) {
    return medianCut(collectColors(img), max || 16)
      .map((c) => toHex(c[0], c[1], c[2]))
      .sort();
  }

  function sortPalette(colors, by) {
    const key = (hex) => {
      const [r, g, b] = parseColor(hex);
      const [h, s, l] = rgbToHsl(r, g, b);
      if (by === "luma") return luma(r, g, b);
      if (by === "sat") return s;
      // greys have no real hue, keep them together at the front
      return s < 0.08 ? -1 + l : h + 1;
    };
    return colors.slice().sort((a, b) => key(a) - key(b));
  }

  // cached nearest-colour lookup against a palette of [r,g,b]
  function nearestMapper(pal) {
    const cache = new Map();
    return (r, g, b) => {
      const key = (r << 16) | (g << 8) | b;
      let idx = cache.get(key);
      if (idx !== undefined) return idx;
      let best = Infinity;
      idx = 0;
      for (let i = 0; i < pal.length; i++) {
        // redmean weighting looks closer to what eyes see than plain rgb distance
        const rm = (r + pal[i][0]) / 2;
        const dr = r - pal[i][0];
        const dg = g - pal[i][1];
        const db = b - pal[i][2];
        const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
        if (d < best) {
          best = d;
          idx = i;
        }
      }
      cache.set(key, idx);
      return idx;
    };
  }

  const api = {
    PALETTES,
    paletteById,
    parseColor,
    toHex,
    rgbToHsl,
    hslToRgb,
    makeImage,
    cloneImage,
    collectColors,
    medianCut,
    nearestMapper,
    tools: { generateRamp, extractPalette, sortPalette },
    filters: {},
    exporters: {},
    importers: {},
    encoders: {},
  };

  // @@FILTERS@@
  // @@ENCODERS@@
  // @@EXPORTERS@@
  // @@REGISTER@@

  return api;
});
