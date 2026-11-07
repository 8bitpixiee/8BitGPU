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

  // ---------- filters ----------
  // each filter: {id,label,params,run(img,p)}; api.filters[id].apply fills in param defaults

  const FILTERS = [];
  const paletteOptions = () => PALETTES.map((p) => ({ value: p.id, label: p.name }));
  const opt = (...vals) => vals.map((v) => ({ value: v[0], label: v[1] }));

  function defineFilter(def) {
    const withDefaults = (params) => {
      const p = {};
      for (const spec of def.params) p[spec.id] = spec.def;
      return Object.assign(p, params || {});
    };
    const filter = {
      id: def.id,
      label: def.label,
      params: def.params,
      apply: (img, params) => def.run(img, withDefaults(params)),
    };
    FILTERS.push(filter);
    api.filters[def.id] = filter;
  }

  const range = (id, label, min, max, def) => ({ id, type: "range", label, min, max, def });
  const color = (id, label, def) => ({ id, type: "color", label, def });
  const bool = (id, label, def) => ({ id, type: "bool", label, def });
  const select = (id, label, options, def) => ({ id, type: "select", label, options, def });

  // run fn(i, r, g, b, a) -> [r,g,b,a] or nothing to keep, over every pixel
  function perPixel(img, fn) {
    const out = cloneImage(img);
    const d = out.data;
    for (let i = 0; i < d.length; i += 4) {
      const res = fn(d[i], d[i + 1], d[i + 2], d[i + 3], i / 4);
      if (res) {
        d[i] = res[0];
        d[i + 1] = res[1];
        d[i + 2] = res[2];
        if (res.length > 3) d[i + 3] = res[3];
      }
    }
    return out;
  }

  const NEIGH4 = [[0, -1], [-1, 0], [1, 0], [0, 1]];
  const NEIGH8 = NEIGH4.concat([[-1, -1], [1, -1], [-1, 1], [1, 1]]);

  defineFilter({
    id: "brightness-contrast",
    label: "Brightness / Contrast",
    params: [range("brightness", "Brightness", -100, 100, 0), range("contrast", "Contrast", -100, 100, 0)],
    run(img, p) {
      // contrast pivots around mid grey, brightness is a flat shift in 0..255 terms
      const c = p.contrast >= 0 ? 1 + p.contrast / 50 : 1 + p.contrast / 100;
      const b = (p.brightness / 100) * 255;
      const f = (v) => clamp8((v - 128) * c + 128 + b);
      return perPixel(img, (r, g, bl) => [f(r), f(g), f(bl)]);
    },
  });

  defineFilter({
    id: "hsl",
    label: "Hue / Saturation / Lightness",
    params: [range("hue", "Hue", -180, 180, 0), range("saturation", "Saturation", -100, 100, 0), range("lightness", "Lightness", -100, 100, 0)],
    run(img, p) {
      return perPixel(img, (r, g, b) => {
        const [h, s, l] = rgbToHsl(r, g, b);
        const ns = clamp(p.saturation >= 0 ? s + (1 - s) * (p.saturation / 100) : s * (1 + p.saturation / 100), 0, 1);
        const nl = clamp(p.lightness >= 0 ? l + (1 - l) * (p.lightness / 100) : l * (1 + p.lightness / 100), 0, 1);
        return hslToRgb(h + p.hue, ns, nl);
      });
    },
  });

  defineFilter({
    id: "invert",
    label: "Invert colors",
    params: [bool("alpha", "Invert alpha too", false)],
    run: (img, p) => perPixel(img, (r, g, b, a) => [255 - r, 255 - g, 255 - b, p.alpha ? 255 - a : a]),
  });

  defineFilter({
    id: "grayscale",
    label: "Grayscale",
    params: [select("mode", "Method", opt(["luma", "Luma"], ["average", "Average"], ["lightness", "Lightness"]), "luma")],
    run(img, p) {
      return perPixel(img, (r, g, b) => {
        const v = clamp8(p.mode === "average" ? (r + g + b) / 3 : p.mode === "lightness" ? (Math.max(r, g, b) + Math.min(r, g, b)) / 2 : luma(r, g, b));
        return [v, v, v];
      });
    },
  });

  defineFilter({
    id: "posterize",
    label: "Posterize",
    params: [range("levels", "Levels per channel", 2, 16, 4)],
    run(img, p) {
      const n = Math.max(2, p.levels | 0);
      const f = (v) => clamp8(Math.round((v / 255) * (n - 1)) * (255 / (n - 1)));
      return perPixel(img, (r, g, b) => [f(r), f(g), f(b)]);
    },
  });

  defineFilter({
    id: "threshold",
    label: "Threshold",
    params: [range("level", "Level", 0, 255, 128), color("dark", "Dark", "#000000"), color("light", "Light", "#ffffff")],
    run(img, p) {
      const dark = parseColor(p.dark);
      const light = parseColor(p.light);
      return perPixel(img, (r, g, b) => (luma(r, g, b) >= p.level ? light : dark));
    },
  });

  // outer: transparent pixels touching the shape; inner: shape pixels touching the outside
  function outlineImage(img, p, onlyRing) {
    const { width: w, height: h } = img;
    const col = parseColor(p.color);
    const neigh = p.neighbours === 4 || p.neighbours === "4" ? NEIGH4 : NEIGH8;
    const solid = (x, y, d) => x >= 0 && y >= 0 && x < w && y < h && d[(y * w + x) * 4 + 3] >= 128;
    let cur = cloneImage(img);
    const rounds = onlyRing ? 1 : Math.max(1, p.thickness | 0);
    for (let round = 0; round < rounds; round++) {
      const src = cur.data;
      const out = cloneImage(cur);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          const here = src[i + 3] >= 128;
          const touches = neigh.some(([dx, dy]) => solid(x + dx, y + dy, src) !== here);
          if (p.mode === "inner" || onlyRing) {
            // outside the canvas counts as empty so shapes on the edge still get a border
            const edge = here && neigh.some(([dx, dy]) => !solid(x + dx, y + dy, src));
            if (edge) {
              if (!onlyRing) {
                out.data[i] = col[0];
                out.data[i + 1] = col[1];
                out.data[i + 2] = col[2];
                out.data[i + 3] = 255;
              }
            } else if (onlyRing && here) {
              out.data.fill(0, i, i + 4);
            }
          } else if (!here && touches) {
            out.data[i] = col[0];
            out.data[i + 1] = col[1];
            out.data[i + 2] = col[2];
            out.data[i + 3] = 255;
          }
        }
      }
      cur = out;
    }
    return cur;
  }

  defineFilter({
    id: "outline",
    label: "Outline",
    params: [
      select("mode", "Place", opt(["outer", "Outside"], ["inner", "Inside"]), "outer"),
      select("neighbours", "Neighbours", opt([8, "8 (square)"], [4, "4 (cross)"]), 8),
      color("color", "Color", "#000000"),
      range("thickness", "Thickness", 1, 4, 1),
    ],
    run: (img, p) => outlineImage(img, p, false),
  });

  defineFilter({
    id: "outline-only",
    label: "Outline only",
    params: [select("neighbours", "Neighbours", opt([8, "8 (square)"], [4, "4 (cross)"]), 8)],
    run: (img, p) => outlineImage(img, { neighbours: p.neighbours }, true),
  });

  defineFilter({
    id: "drop-shadow",
    label: "Drop shadow",
    params: [range("dx", "Offset X", -16, 16, 1), range("dy", "Offset Y", -16, 16, 1), color("color", "Color", "#000000"), range("opacity", "Opacity", 0, 100, 50)],
    run(img, p) {
      const { width: w, height: h } = img;
      const col = parseColor(p.color);
      const out = makeImage(w, h);
      const s = img.data;
      const d = out.data;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          // shadow first, then the sprite composited over it
          const sx = x - p.dx;
          const sy = y - p.dy;
          let sa = 0;
          if (sx >= 0 && sy >= 0 && sx < w && sy < h) sa = (s[(sy * w + sx) * 4 + 3] / 255) * (p.opacity / 100);
          const fa = s[i + 3] / 255;
          const oa = fa + sa * (1 - fa);
          if (oa <= 0) continue;
          for (let k = 0; k < 3; k++) d[i + k] = clamp8((s[i + k] * fa + col[k] * sa * (1 - fa)) / oa);
          d[i + 3] = clamp8(oa * 255);
        }
      }
      return out;
    },
  });

  defineFilter({
    id: "replace-color",
    label: "Replace color",
    params: [color("from", "Replace", "#ff0000"), color("to", "With", "#00ff00"), range("tolerance", "Tolerance", 0, 255, 0)],
    run(img, p) {
      const f = parseColor(p.from);
      const t = parseColor(p.to);
      return perPixel(img, (r, g, b, a) => {
        if (a === 0) return null;
        return Math.max(Math.abs(r - f[0]), Math.abs(g - f[1]), Math.abs(b - f[2])) <= p.tolerance ? t : null;
      });
    },
  });

  defineFilter({
    id: "curves",
    label: "Curves (lite)",
    params: [range("gamma", "Gamma", 0.2, 3, 1), range("shadows", "Shadows", -100, 100, 0), range("highlights", "Highlights", -100, 100, 0)],
    run(img, p) {
      // one lookup table shared by all channels: gamma, then a soft push on each end
      const lut = new Uint8ClampedArray(256);
      for (let i = 0; i < 256; i++) {
        const t = Math.pow(i / 255, 1 / p.gamma);
        const v = t + (p.shadows / 100) * 0.35 * Math.pow(1 - t, 2) * (1 - t * 0.5) + (p.highlights / 100) * 0.35 * Math.pow(t, 2) * t;
        lut[i] = clamp8(v * 255);
      }
      return perPixel(img, (r, g, b) => [lut[r], lut[g], lut[b]]);
    },
  });

  // kernels as rows; `alpha` kernels also smear transparency, `bias` shifts the result for signed kernels
  const ones = (n) => Array.from({ length: n }, () => Array(n).fill(1));
  const KERNELS = {
    "blur-3x3": { k: ones(3), alpha: true },
    "blur-5x5": { k: ones(5), alpha: true },
    "gaussian-3x3": { k: [[1, 2, 1], [2, 4, 2], [1, 2, 1]], alpha: true },
    "gaussian-5x5": { k: [[1, 4, 6, 4, 1], [4, 16, 24, 16, 4], [6, 24, 36, 24, 6], [4, 16, 24, 16, 4], [1, 4, 6, 4, 1]], alpha: true },
    "sharpen-3x3": { k: [[0, -1, 0], [-1, 5, -1], [0, -1, 0]] },
    "sharpen-strong": { k: [[-1, -1, -1], [-1, 9, -1], [-1, -1, -1]] },
    "edges-find": { k: [[-1, -1, -1], [-1, 8, -1], [-1, -1, -1]] },
    "edges-horizontal": { k: [[-1, -2, -1], [0, 0, 0], [1, 2, 1]], bias: 128 },
    "edges-vertical": { k: [[-1, 0, 1], [-2, 0, 2], [-1, 0, 1]], bias: 128 },
    emboss: { k: [[-2, -1, 0], [-1, 1, 1], [0, 1, 2]], bias: 128 },
    "box-blur-horizontal": { k: [[1, 1, 1, 1, 1]], alpha: true },
    "box-blur-vertical": { k: [[1], [1], [1], [1], [1]], alpha: true },
  };

  function convolve(img, name, opts) {
    const def = KERNELS[name] || KERNELS["blur-3x3"];
    const strength = opts && opts.strength != null ? opts.strength : 1;
    const { width: w, height: h } = img;
    const k = def.k;
    const kh = k.length;
    const kw = k[0].length;
    let sum = 0;
    for (const row of k) for (const v of row) sum += v;
    const div = sum === 0 ? 1 : sum;
    const bias = def.bias || 0;
    const src = img.data;
    const out = cloneImage(img);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0;
        let g = 0;
        let b = 0;
        let a = 0;
        let wa = 0;
        for (let j = 0; j < kh; j++) {
          for (let i = 0; i < kw; i++) {
            // clamp to the edge so borders don't darken
            const sx = clamp(x + i - (kw >> 1), 0, w - 1);
            const sy = clamp(y + j - (kh >> 1), 0, h - 1);
            const si = (sy * w + sx) * 4;
            const kv = k[j][i];
            // alpha weighting keeps transparent pixels' hidden colours out of the blur
            const al = def.alpha ? src[si + 3] / 255 : 1;
            r += src[si] * kv * al;
            g += src[si + 1] * kv * al;
            b += src[si + 2] * kv * al;
            a += src[si + 3] * kv;
            wa += kv * al;
          }
        }
        const oi = (y * w + x) * 4;
        const nr = def.alpha ? (wa > 0 ? r / wa : src[oi]) : r / div + bias;
        const ng = def.alpha ? (wa > 0 ? g / wa : src[oi + 1]) : g / div + bias;
        const nb = def.alpha ? (wa > 0 ? b / wa : src[oi + 2]) : b / div + bias;
        // signed kernels are meant for opaque pixels, so keep their alpha
        const na = def.alpha ? a / div : src[oi + 3];
        out.data[oi] = clamp8(src[oi] + (nr - src[oi]) * strength);
        out.data[oi + 1] = clamp8(src[oi + 1] + (ng - src[oi + 1]) * strength);
        out.data[oi + 2] = clamp8(src[oi + 2] + (nb - src[oi + 2]) * strength);
        out.data[oi + 3] = clamp8(src[oi + 3] + (na - src[oi + 3]) * strength);
      }
    }
    return out;
  }

  defineFilter({
    id: "convolution",
    label: "Convolution matrix",
    params: [select("kernel", "Matrix", Object.keys(KERNELS).map((k) => ({ value: k, label: k })), "blur-3x3"), range("strength", "Strength", 0, 1, 1)],
    run: (img, p) => convolve(img, p.kernel, { strength: p.strength }),
  });

  defineFilter({
    id: "pixelate",
    label: "Pixelate",
    params: [range("size", "Block size", 1, 32, 2)],
    run(img, p) {
      const { width: w, height: h } = img;
      const n = Math.max(1, p.size | 0);
      const out = cloneImage(img);
      for (let by = 0; by < h; by += n) {
        for (let bx = 0; bx < w; bx += n) {
          let r = 0;
          let g = 0;
          let b = 0;
          let a = 0;
          let cnt = 0;
          for (let y = by; y < Math.min(h, by + n); y++) {
            for (let x = bx; x < Math.min(w, bx + n); x++) {
              const i = (y * w + x) * 4;
              const al = img.data[i + 3];
              r += img.data[i] * al;
              g += img.data[i + 1] * al;
              b += img.data[i + 2] * al;
              a += al;
              cnt++;
            }
          }
          const rgb = a ? [r / a, g / a, b / a] : [0, 0, 0];
          for (let y = by; y < Math.min(h, by + n); y++) {
            for (let x = bx; x < Math.min(w, bx + n); x++) {
              const i = (y * w + x) * 4;
              out.data[i] = rgb[0];
              out.data[i + 1] = rgb[1];
              out.data[i + 2] = rgb[2];
              out.data[i + 3] = a / cnt;
            }
          }
        }
      }
      return out;
    },
  });

  // Bayer matrix of size n (power of two), values 0..n*n-1
  function bayer(n) {
    if (n === 1) return [[0]];
    const h = bayer(n / 2);
    const m = [];
    for (let y = 0; y < n; y++) {
      m.push([]);
      for (let x = 0; x < n; x++) {
        const base = h[y % (n / 2)][x % (n / 2)] * 4;
        m[y].push(base + [[0, 2], [3, 1]][y >= n / 2 ? 1 : 0][x >= n / 2 ? 1 : 0]);
      }
    }
    return m;
  }
  const HALFTONE4 = [[12, 5, 6, 13], [4, 0, 1, 7], [11, 3, 2, 8], [15, 10, 9, 14]];

  function ditherImage(img, palColors, method, strength) {
    const { width: w, height: h } = img;
    const pal = palColors.map((c) => parseColor(c));
    const nearest = nearestMapper(pal);
    const out = cloneImage(img);
    const d = out.data;
    const amt = strength / 100;
    // spread: how far ordered noise can push a channel, tied to how coarse the palette is
    const spread = 255 / Math.max(2, Math.cbrt(pal.length));
    const ordered = { bayer2: bayer(2), bayer4: bayer(4), bayer8: bayer(8), ordered: HALFTONE4 }[method];
    if (ordered) {
      const n = ordered.length;
      const cells = n * n;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (d[i + 3] < 128) continue;
          const off = ((ordered[y % n][x % n] + 0.5) / cells - 0.5) * spread * amt;
          const c = pal[nearest(clamp8(d[i] + off), clamp8(d[i + 1] + off), clamp8(d[i + 2] + off))];
          d[i] = c[0];
          d[i + 1] = c[1];
          d[i + 2] = c[2];
          d[i + 3] = 255;
        }
      }
      return out;
    }
    // error diffusion on float buffers; serpentine scan avoids diagonal streaks
    const buf = new Float32Array(w * h * 3);
    for (let i = 0; i < w * h; i++) for (let k = 0; k < 3; k++) buf[i * 3 + k] = d[i * 4 + k];
    const kernels =
      method === "atkinson"
        ? { div: 8, taps: [[1, 0, 1], [2, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1], [0, 2, 1]] }
        : { div: 16, taps: [[1, 0, 7], [-1, 1, 3], [0, 1, 5], [1, 1, 1]] };
    for (let y = 0; y < h; y++) {
      const ltr = y % 2 === 0;
      for (let s = 0; s < w; s++) {
        const x = ltr ? s : w - 1 - s;
        const pi = y * w + x;
        if (d[pi * 4 + 3] < 128) continue;
        const cr = clamp8(buf[pi * 3]);
        const cg = clamp8(buf[pi * 3 + 1]);
        const cb = clamp8(buf[pi * 3 + 2]);
        const c = pal[nearest(cr, cg, cb)];
        const err = [(cr - c[0]) * amt, (cg - c[1]) * amt, (cb - c[2]) * amt];
        d[pi * 4] = c[0];
        d[pi * 4 + 1] = c[1];
        d[pi * 4 + 2] = c[2];
        d[pi * 4 + 3] = 255;
        for (const [tx, ty, wt] of kernels.taps) {
          const nx = x + (ltr ? tx : -tx);
          const ny = y + ty;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          for (let k = 0; k < 3; k++) buf[(ny * w + nx) * 3 + k] += (err[k] * wt) / kernels.div;
        }
      }
    }
    return out;
  }

  defineFilter({
    id: "dither",
    label: "Dither to palette",
    params: [
      select("palette", "Palette", paletteOptions(), "pico8"),
      select("method", "Method", opt(["bayer2", "Bayer 2x2"], ["bayer4", "Bayer 4x4"], ["bayer8", "Bayer 8x8"], ["ordered", "Ordered (halftone)"], ["floyd-steinberg", "Floyd-Steinberg"], ["atkinson", "Atkinson"]), "bayer4"),
      range("strength", "Strength", 0, 100, 100),
    ],
    run: (img, p) => ditherImage(img, paletteById(p.palette).colors, p.method, p.strength),
  });

  defineFilter({
    id: "quantize",
    label: "Quantize colors",
    params: [range("colors", "Colors", 2, 256, 16)],
    run(img, p) {
      const pal = medianCut(collectColors(img), p.colors | 0);
      if (!pal.length) return cloneImage(img);
      const nearest = nearestMapper(pal);
      return perPixel(img, (r, g, b, a) => (a < 128 ? null : pal[nearest(r, g, b)]));
    },
  });

  defineFilter({
    id: "hue-shift-ramp",
    label: "Hue-shift ramp",
    params: [range("amount", "Max shift", 0, 90, 30), range("warm", "Highlight hue", 0, 360, 55), range("cool", "Shadow hue", 0, 360, 250)],
    run(img, p) {
      // brighter pixels lean toward the warm hue, darker ones toward the cool hue
      return perPixel(img, (r, g, b) => {
        const [h, s, l] = rgbToHsl(r, g, b);
        const t = (l - 0.5) * 2;
        const target = t >= 0 ? p.warm : p.cool;
        return hslToRgb(hueToward(h, target, Math.abs(t) * p.amount), s, l);
      });
    },
  });

  defineFilter({
    id: "shade",
    label: "Shading (lighten / darken)",
    params: [select("dir", "Direction", opt(["lighten", "Lighten"], ["darken", "Darken"]), "lighten"), range("amount", "Amount", 0, 100, 15), range("hueShift", "Hue shift", 0, 60, 12)],
    run(img, p) {
      const up = p.dir === "lighten";
      return perPixel(img, (r, g, b) => {
        const [h, s, l] = rgbToHsl(r, g, b);
        const nl = clamp(l + (up ? 1 : -1) * (p.amount / 100), 0, 1);
        // lighter shades warm up, darker ones cool down, the usual pixel-art cheat
        return hslToRgb(hueToward(h, up ? 60 : 250, p.hueShift), s, nl);
      });
    },
  });

  defineFilter({
    id: "despeckle",
    label: "Despeckle",
    params: [range("agree", "Neighbours that must agree", 3, 8, 5), bool("isolated", "Remove lone pixels", true)],
    run(img, p) {
      const { width: w, height: h } = img;
      const src = img.data;
      const out = cloneImage(img);
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const i = (y * w + x) * 4;
          if (src[i + 3] < 128) continue;
          const counts = new Map();
          let opaque = 0;
          for (const [dx, dy] of NEIGH8) {
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
            const ni = (ny * w + nx) * 4;
            if (src[ni + 3] < 128) continue;
            opaque++;
            const key = (src[ni] << 16) | (src[ni + 1] << 8) | src[ni + 2];
            counts.set(key, (counts.get(key) || 0) + 1);
          }
          if (opaque === 0) {
            if (p.isolated) out.data[i + 3] = 0;
            continue;
          }
          const mine = (src[i] << 16) | (src[i + 1] << 8) | src[i + 2];
          let bestKey = mine;
          let best = 0;
          for (const [key, n] of counts) {
            if (n > best) {
              best = n;
              bestKey = key;
            }
          }
          if (bestKey !== mine && best >= p.agree && (counts.get(mine) || 0) === 0) {
            out.data[i] = (bestKey >> 16) & 255;
            out.data[i + 1] = (bestKey >> 8) & 255;
            out.data[i + 2] = bestKey & 255;
          }
        }
      }
      return out;
    },
  });

  defineFilter({
    id: "noise",
    label: "Noise",
    params: [range("amount", "Amount", 0, 100, 20), bool("mono", "Monochrome", true), range("seed", "Seed", 0, 9999, 1), bool("onlyOpaque", "Skip transparent", true)],
    run(img, p) {
      const rnd = mulberry32(p.seed);
      return perPixel(img, (r, g, b, a) => {
        // always draw the randoms so a given seed gives the same pattern whatever the pixels are
        const n1 = (rnd() - 0.5) * 2.55 * p.amount;
        const n2 = p.mono ? n1 : (rnd() - 0.5) * 2.55 * p.amount;
        const n3 = p.mono ? n1 : (rnd() - 0.5) * 2.55 * p.amount;
        if (p.onlyOpaque && a === 0) return null;
        return [clamp8(r + n1), clamp8(g + n2), clamp8(b + n3)];
      });
    },
  });

  defineFilter({
    id: "gradient-map",
    label: "Gradient map",
    params: [color("dark", "Shadows", "#1a1c2c"), bool("useMid", "Use midtone", true), color("mid", "Midtones", "#b13e53"), color("light", "Highlights", "#ffcd75")],
    run(img, p) {
      const a = parseColor(p.dark);
      const m = parseColor(p.mid);
      const b = parseColor(p.light);
      const stops = p.useMid ? [a, m, b] : [a, b];
      return perPixel(img, (r, g, bl) => {
        const t = luma(r, g, bl) / 255;
        const seg = Math.min(stops.length - 2, Math.floor(t * (stops.length - 1)));
        const lt = t * (stops.length - 1) - seg;
        return [0, 1, 2].map((k) => clamp8(stops[seg][k] + (stops[seg + 1][k] - stops[seg][k]) * lt));
      });
    },
  });

  defineFilter({
    id: "flip-rotate",
    label: "Flip / rotate sprite",
    params: [select("op", "Operation", opt(["flip-h", "Flip horizontal"], ["flip-v", "Flip vertical"], ["rotate-180", "Rotate 180"], ["rotate-cw", "Rotate 90 clockwise"], ["rotate-ccw", "Rotate 90 counter-clockwise"]), "flip-h")],
    run(img, p) {
      // size must stay put, so 90 degree turns on non-square images rotate about the centre and clip
      const { width: w, height: h } = img;
      const out = makeImage(w, h);
      const cx = (w - 1) / 2;
      const cy = (h - 1) / 2;
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let sx = x;
          let sy = y;
          if (p.op === "flip-h") sx = w - 1 - x;
          else if (p.op === "flip-v") sy = h - 1 - y;
          else if (p.op === "rotate-180") {
            sx = w - 1 - x;
            sy = h - 1 - y;
          } else {
            const dx = x - cx;
            const dy = y - cy;
            // clockwise output pixel pulls from the pixel a quarter turn back
            sx = Math.round(cx + (p.op === "rotate-cw" ? dy : -dy));
            sy = Math.round(cy + (p.op === "rotate-cw" ? -dx : dx));
          }
          if (sx < 0 || sy < 0 || sx >= w || sy >= h) continue;
          const si = (sy * w + sx) * 4;
          const di = (y * w + x) * 4;
          for (let k = 0; k < 4; k++) out.data[di + k] = img.data[si + k];
        }
      }
      return out;
    },
  });

  api.convolve = convolve;
  api.KERNELS = KERNELS;
  api.dither = ditherImage;
  api.bayer = bayer;
  api.outline = outlineImage;

  // ---------- byte-level encoders: png, apng, zip, gif ----------

  const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(bytes, start, end) {
    let c = 0xffffffff;
    for (let i = start || 0; i < (end == null ? bytes.length : end); i++) c = CRC_TABLE[(c ^ bytes[i]) & 255] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  }

  function adler32(bytes) {
    let a = 1;
    let b = 0;
    for (let i = 0; i < bytes.length; i++) {
      a = (a + bytes[i]) % 65521;
      b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
  }

  function concat(parts) {
    let len = 0;
    for (const p of parts) len += p.length;
    const out = new Uint8Array(len);
    let o = 0;
    for (const p of parts) {
      out.set(p, o);
      o += p.length;
    }
    return out;
  }

  const u32be = (n) => new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]);
  const u16be = (n) => new Uint8Array([(n >>> 8) & 255, n & 255]);

  // zlib stream; real deflate when the platform has it, otherwise stored blocks (bigger but valid)
  async function zlibCompress(bytes) {
    if (typeof CompressionStream === "function") {
      const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate"));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    }
    const parts = [new Uint8Array([0x78, 0x01])];
    for (let i = 0; i < bytes.length || i === 0; i += 65535) {
      const chunk = bytes.subarray(i, Math.min(bytes.length, i + 65535));
      const last = i + 65535 >= bytes.length ? 1 : 0;
      parts.push(new Uint8Array([last, chunk.length & 255, chunk.length >> 8, ~chunk.length & 255, (~chunk.length >> 8) & 255]), chunk);
      if (last) break;
    }
    parts.push(u32be(adler32(bytes)));
    return concat(parts);
  }

  function pngChunk(type, data) {
    const body = concat([new Uint8Array([...type].map((c) => c.charCodeAt(0))), data]);
    return concat([u32be(data.length), body, u32be(crc32(body))]);
  }

  const PNG_SIG = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

  // each scanline gets a filter byte of 0 in front
  function rawScanlines(img) {
    const { width: w, height: h, data } = img;
    const raw = new Uint8Array((w * 4 + 1) * h);
    for (let y = 0; y < h; y++) raw.set(data.subarray(y * w * 4, (y + 1) * w * 4), y * (w * 4 + 1) + 1);
    return raw;
  }

  const ihdr = (w, h) => pngChunk("IHDR", concat([u32be(w), u32be(h), new Uint8Array([8, 6, 0, 0, 0])]));

  async function encodePNG(img) {
    const idat = await zlibCompress(rawScanlines(img));
    return concat([PNG_SIG, ihdr(img.width, img.height), pngChunk("IDAT", idat), pngChunk("IEND", new Uint8Array(0))]);
  }

  // frames: [{image, ms}]; loops 0 = forever
  async function encodeAPNG(frames, loops) {
    const { width: w, height: h } = frames[0].image;
    const parts = [PNG_SIG, ihdr(w, h), pngChunk("acTL", concat([u32be(frames.length), u32be(loops || 0)]))];
    let seq = 0;
    for (let i = 0; i < frames.length; i++) {
      const ms = Math.max(1, Math.round(frames[i].ms || 100));
      const fctl = concat([u32be(seq++), u32be(w), u32be(h), u32be(0), u32be(0), u16be(ms), u16be(1000), new Uint8Array([0, 0])]);
      parts.push(pngChunk("fcTL", fctl));
      const z = await zlibCompress(rawScanlines(frames[i].image));
      // first frame doubles as the plain PNG image, later ones ride in fdAT with a sequence number
      parts.push(i === 0 ? pngChunk("IDAT", z) : pngChunk("fdAT", concat([u32be(seq++), z])));
    }
    parts.push(pngChunk("IEND", new Uint8Array(0)));
    return concat(parts);
  }

  // stored (uncompressed) zip; entries: [{name, data: Uint8Array}]
  function encodeZip(entries) {
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const le16 = (n) => new Uint8Array([n & 255, (n >> 8) & 255]);
    const le32 = (n) => new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const e of entries) {
      const name = enc.encode(e.name);
      const crc = crc32(e.data);
      // flag bit 11 = names are utf-8
      const common = [le16(20), le16(0x0800), le16(0), le16(dosTime), le16(dosDate), le32(crc), le32(e.data.length), le32(e.data.length), le16(name.length), le16(0)];
      const local = concat([le32(0x04034b50), ...common, name, e.data]);
      centrals.push(concat([le32(0x02014b50), le16(20), ...common, le16(0), le16(0), le16(0), le32(0), le32(offset), name]));
      locals.push(local);
      offset += local.length;
    }
    const central = concat(centrals);
    const end = concat([le32(0x06054b50), le16(0), le16(0), le16(entries.length), le16(entries.length), le32(central.length), le32(offset), le16(0)]);
    return concat([...locals, central, end]);
  }

  // ----- gif -----

  // LZW with variable code size, emits the sub-blocked byte stream (without min-code-size byte)
  function lzwEncode(indices, minCode) {
    const clear = 1 << minCode;
    const eoi = clear + 1;
    const out = [];
    let cur = 0;
    let bits = 0;
    let size = minCode + 1;
    let next = eoi + 1;
    let dict = new Map();
    const emit = (code) => {
      cur |= code << bits;
      bits += size;
      while (bits >= 8) {
        out.push(cur & 255);
        cur >>>= 8;
        bits -= 8;
      }
    };
    emit(clear);
    let prefix = indices[0];
    for (let i = 1; i < indices.length; i++) {
      const c = indices[i];
      const key = (prefix << 8) | c;
      const hit = dict.get(key);
      if (hit !== undefined) {
        prefix = hit;
        continue;
      }
      emit(prefix);
      if (next < 4096) {
        // the decoder is one entry behind, so the width bumps when the code about to be added needs it
        if (next === 1 << size) size++;
        dict.set(key, next++);
      } else {
        emit(clear);
        dict = new Map();
        size = minCode + 1;
        next = eoi + 1;
      }
      prefix = c;
    }
    emit(prefix);
    emit(eoi);
    if (bits > 0) out.push(cur & 255);
    const blocks = [];
    for (let i = 0; i < out.length; i += 255) {
      const chunk = out.slice(i, i + 255);
      blocks.push(chunk.length, ...chunk);
    }
    blocks.push(0);
    return blocks;
  }

  // opts: {loops (0 = forever), tagFrames not handled here}; frames [{image, ms}]
  function encodeGIF(frames, opts) {
    opts = opts || {};
    const { width: w, height: h } = frames[0].image;
    // one global palette across frames so colours don't flicker; index 0 is reserved for transparency
    const all = new Map();
    let hasAlpha = false;
    for (const f of frames) {
      for (const [k, n] of collectColors(f.image)) all.set(k, (all.get(k) || 0) + n);
      for (let i = 3; i < f.image.data.length && !hasAlpha; i += 4) if (f.image.data[i] < 128) hasAlpha = true;
    }
    const maxColors = hasAlpha ? 255 : 256;
    let colors = medianCut(all, maxColors);
    if (!colors.length) colors = [[0, 0, 0]];
    const palette = hasAlpha ? [[0, 0, 0]].concat(colors) : colors;
    const offset = hasAlpha ? 1 : 0;
    const nearest = nearestMapper(colors);
    let tableBits = 1;
    while (1 << tableBits < palette.length) tableBits++;
    const tableSize = 1 << tableBits;
    const le16 = (n) => [n & 255, (n >> 8) & 255];
    const bytes = [...Array.from("GIF89a", (c) => c.charCodeAt(0)), ...le16(w), ...le16(h), 0x80 | ((tableBits - 1) << 4) | (tableBits - 1), 0, 0];
    for (let i = 0; i < tableSize; i++) bytes.push(...(palette[i] || [0, 0, 0]));
    const loops = opts.loops == null ? 0 : opts.loops;
    // loops=1 means play once, which a gif does when the extension is left out
    if (loops !== 1) bytes.push(0x21, 0xff, 11, ...Array.from("NETSCAPE2.0", (c) => c.charCodeAt(0)), 3, 1, ...le16(loops === 0 ? 0 : loops - 1), 0);
    const minCode = Math.max(2, tableBits);
    for (const f of frames) {
      const d = f.image.data;
      const idx = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) idx[i] = d[i * 4 + 3] < 128 ? 0 : offset + nearest(d[i * 4], d[i * 4 + 1], d[i * 4 + 2]);
      const delay = Math.max(2, Math.round((f.ms || 100) / 10));
      // disposal 2 clears to transparent before the next frame so old pixels don't ghost
      bytes.push(0x21, 0xf9, 4, (hasAlpha ? 2 << 2 : 1 << 2) | (hasAlpha ? 1 : 0), ...le16(delay), 0, 0);
      bytes.push(0x2c, 0, 0, 0, 0, ...le16(w), ...le16(h), 0, minCode);
      for (const b of lzwEncode(idx, minCode)) bytes.push(b);
    }
    bytes.push(0x3b);
    return Uint8Array.from(bytes);
  }

  // gif decoder: returns {w, h, loops, frames: [{image, ms}]}, each frame composited to full size
  function decodeGIF(buf) {
    const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const sig = String.fromCharCode(...b.subarray(0, 6));
    if (sig !== "GIF87a" && sig !== "GIF89a") throw new Error("not a gif");
    let p = 6;
    const u16 = () => {
      const v = b[p] | (b[p + 1] << 8);
      p += 2;
      return v;
    };
    const w = u16();
    const h = u16();
    const flags = b[p++];
    p += 2; // background index, aspect ratio
    const readTable = (n) => {
      const t = [];
      for (let i = 0; i < n; i++) t.push([b[p++], b[p++], b[p++]]);
      return t;
    };
    const globalTable = flags & 0x80 ? readTable(1 << ((flags & 7) + 1)) : null;
    const frames = [];
    let loops = 1;
    let gce = null;
    let canvas = makeImage(w, h);
    const skipBlocks = () => {
      while (b[p] !== 0) p += b[p] + 1;
      p++;
    };
    while (p < b.length && b[p] !== 0x3b) {
      const intro = b[p++];
      if (intro === 0x21) {
        const label = b[p++];
        if (label === 0xf9) {
          p++; // block size
          const pk = b[p++];
          const delay = u16();
          const trans = b[p++];
          p++;
          gce = { disposal: (pk >> 2) & 7, transparent: pk & 1 ? trans : -1, ms: delay * 10 };
        } else if (label === 0xff && b[p] === 11 && String.fromCharCode(...b.subarray(p + 1, p + 12)) === "NETSCAPE2.0") {
          p += 12;
          p++; // sub-block length 3
          p++; // sub-block id 1
          const n = u16();
          loops = n === 0 ? 0 : n + 1;
          p++;
        } else {
          skipBlocks();
        }
      } else if (intro === 0x2c) {
        const fx0 = u16();
        const fy0 = u16();
        const fw = u16();
        const fh = u16();
        const lf = b[p++];
        const table = lf & 0x80 ? readTable(1 << ((lf & 7) + 1)) : globalTable;
        const minCode = b[p++];
        const data = [];
        while (b[p] !== 0) {
          for (let i = 0; i < b[p]; i++) data.push(b[p + 1 + i]);
          p += b[p] + 1;
        }
        p++;
        const px = lzwDecode(data, minCode, fw * fh);
        const before = cloneImage(canvas);
        const order = [];
        if (lf & 0x40) {
          // interlaced rows come in four passes
          for (const [start, step] of [[0, 8], [4, 8], [2, 4], [1, 2]]) for (let y = start; y < fh; y += step) order.push(y);
        } else for (let y = 0; y < fh; y++) order.push(y);
        for (let row = 0; row < fh; row++) {
          const y = fy0 + order[row];
          for (let x = 0; x < fw; x++) {
            const ci = px[row * fw + x];
            if (gce && ci === gce.transparent) continue;
            if (x + fx0 >= w || y >= h) continue;
            const c = (table && table[ci]) || [0, 0, 0];
            canvas.data.set([c[0], c[1], c[2], 255], (y * w + x + fx0) * 4);
          }
        }
        frames.push({ image: cloneImage(canvas), ms: gce ? gce.ms : 100 });
        const disposal = gce ? gce.disposal : 0;
        if (disposal === 2) {
          for (let y = fy0; y < Math.min(h, fy0 + fh); y++) canvas.data.fill(0, (y * w + fx0) * 4, (y * w + Math.min(w, fx0 + fw)) * 4);
        } else if (disposal === 3) canvas = before;
        gce = null;
      } else break;
    }
    return { w, h, loops, frames };
  }

  function lzwDecode(data, minCode, total) {
    const out = new Uint8Array(total);
    const clear = 1 << minCode;
    const eoi = clear + 1;
    let size = minCode + 1;
    let prefix = new Int32Array(4096);
    let suffix = new Uint8Array(4096);
    let next = eoi + 1;
    let prev = -1;
    let cur = 0;
    let bits = 0;
    let di = 0;
    let o = 0;
    const stack = [];
    const first = (code) => {
      while (code >= clear) code = prefix[code];
      return code;
    };
    while (o < total) {
      while (bits < size && di < data.length) {
        cur |= data[di++] << bits;
        bits += 8;
      }
      if (bits < size) break;
      const code = cur & ((1 << size) - 1);
      cur >>>= size;
      bits -= size;
      if (code === clear) {
        size = minCode + 1;
        next = eoi + 1;
        prev = -1;
        continue;
      }
      if (code === eoi) break;
      let walk = code;
      if (prev === -1) {
        out[o++] = code;
        prev = code;
        continue;
      }
      if (code >= next) {
        // the one tricky case: code not in the table yet, it's prev + first(prev)
        stack.push(first(prev));
        walk = prev;
      }
      while (walk >= clear) {
        stack.push(suffix[walk]);
        walk = prefix[walk];
      }
      stack.push(walk);
      const f = stack[stack.length - 1];
      while (stack.length && o < total) out[o++] = stack.pop();
      stack.length = 0;
      if (next < 4096) {
        prefix[next] = prev;
        suffix[next] = f;
        next++;
        if (next === 1 << size && size < 12) size++;
      }
      prev = code;
    }
    return out;
  }

  Object.assign(api.encoders, { crc32, adler32, zlibCompress, encodePNG, encodeAPNG, encodeZip, encodeGIF, decodeGIF, lzwEncode, lzwDecode, concat });

  // ---------- exporters + importers ----------

  // nearest-neighbour upscale, 1..16
  function scaleImage(img, n) {
    n = clamp(Math.round(n) || 1, 1, 16);
    if (n === 1) return img;
    const { width: w, height: h } = img;
    const out = makeImage(w * n, h * n);
    for (let y = 0; y < h * n; y++) {
      const sy = (y / n) | 0;
      for (let x = 0; x < w * n; x++) {
        const si = (sy * w + ((x / n) | 0)) * 4;
        out.data.set(img.data.subarray(si, si + 4), (y * w * n + x) * 4);
      }
    }
    return out;
  }

  const tagOf = (doc, name) => (doc.tags || []).find((t) => t.name === name);

  // frames to export: whole animation, a named tag, or an explicit from/to
  function frameRange(doc, opts) {
    const total = doc.frames.length;
    let from = 0;
    let to = total - 1;
    const tag = opts.tag && tagOf(doc, opts.tag);
    if (tag) {
      from = tag.from;
      to = tag.to;
    } else if (opts.from != null || opts.to != null) {
      from = opts.from == null ? 0 : opts.from;
      to = opts.to == null ? total - 1 : opts.to;
    }
    from = clamp(from | 0, 0, total - 1);
    to = clamp(to | 0, from, total - 1);
    const list = [];
    for (let i = from; i <= to; i++) list.push(i);
    // ping-pong plays forward then back without repeating the end frames
    if (tag && tag.direction === "pingpong" && list.length > 2) for (let i = list.length - 2; i > 0; i--) list.push(list[i]);
    if (tag && tag.direction === "reverse") list.reverse();
    return list;
  }

  function gatherFrames(doc, opts) {
    const scale = opts.scale || 1;
    return frameRange(doc, opts).map((i) => ({ index: i, image: scaleImage(doc.flatten(i), scale), ms: doc.frames[i].ms || 100 }));
  }

  const pngBlob = async (img) => new Blob([await encodePNG(img)], { type: "image/png" });
  const baseName = (opts, doc) => (opts && opts.name) || (doc && doc.name) || "sprite";

  // sheet layout: where each frame goes and how big the sheet is
  function layoutSheet(count, fw, fh, opts) {
    const pad = opts.padding || 0; // space around each frame
    const gap = opts.spacing || 0; // space between frames
    const border = opts.border || 0;
    let cols;
    if (opts.layout === "horizontal") cols = count;
    else if (opts.layout === "vertical") cols = 1;
    else if (opts.layout === "grid") cols = clamp(opts.columns | 0 || Math.ceil(Math.sqrt(count)), 1, count);
    else {
      // packed: pick the column count with the smallest, squarest sheet
      let best = null;
      for (let c = 1; c <= count; c++) {
        const r = Math.ceil(count / c);
        const cw = c * (fw + pad * 2) + (c - 1) * gap;
        const ch = r * (fh + pad * 2) + (r - 1) * gap;
        const score = cw * ch * 1000 + Math.abs(cw - ch);
        if (!best || score < best.score) best = { c, score };
      }
      cols = best.c;
    }
    const rows = Math.ceil(count / cols);
    const cellW = fw + pad * 2;
    const cellH = fh + pad * 2;
    let w = border * 2 + cols * cellW + (cols - 1) * gap;
    let h = border * 2 + rows * cellH + (rows - 1) * gap;
    if (opts.layout === "packed" && opts.pow2) {
      const up = (n) => 1 << Math.ceil(Math.log2(Math.max(1, n)));
      w = up(w);
      h = up(h);
    }
    const positions = [];
    for (let i = 0; i < count; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      positions.push({ x: border + col * (cellW + gap) + pad, y: border + row * (cellH + gap) + pad });
    }
    return { positions, w, h, cols, rows };
  }

  // paints a frame into the sheet at x,y
  function blit(dst, src, x, y) {
    for (let row = 0; row < src.height; row++) {
      const si = row * src.width * 4;
      dst.data.set(src.data.subarray(si, si + src.width * 4), ((y + row) * dst.width + x) * 4);
    }
  }

  // returns {image, json}; json follows Aseprite's --data format (hash or array)
  function buildSpriteSheet(doc, opts) {
    opts = opts || {};
    const frames = gatherFrames(doc, opts);
    const scale = clamp(opts.scale || 1, 1, 16);
    const fw = doc.w * scale;
    const fh = doc.h * scale;
    const lay = layoutSheet(frames.length, fw, fh, opts);
    const sheet = makeImage(lay.w, lay.h);
    frames.forEach((f, i) => blit(sheet, f.image, lay.positions[i].x, lay.positions[i].y));
    const name = baseName(opts, doc);
    const entries = frames.map((f, i) => ({
      filename: `${name} ${i}.aseprite`,
      frame: { x: lay.positions[i].x, y: lay.positions[i].y, w: fw, h: fh },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: fw, h: fh },
      sourceSize: { w: fw, h: fh },
      duration: f.ms,
    }));
    const frameTags = (doc.tags || []).map((t) => ({ name: t.name, from: t.from, to: t.to, direction: t.direction || "forward" }));
    const meta = {
      app: "8BitGPU Pixel Studio",
      version: "1.0",
      image: opts.imageName || `${name}.png`,
      format: "RGBA8888",
      size: { w: lay.w, h: lay.h },
      scale: String(scale),
      frameTags,
      layers: (doc.layers || []).map((l) => ({ name: l.name, opacity: l.opacity == null ? 255 : l.opacity, blendMode: l.blendMode || "normal" })),
      slices: [],
    };
    const framesOut = opts.jsonFormat === "array" ? entries : Object.fromEntries(entries.map((e) => [e.filename, (({ filename, ...rest }) => rest)(e)]));
    return { image: sheet, json: { frames: framesOut, meta } };
  }

  const zipOf = (entries) => new Blob([encodeZip(entries)], { type: "application/zip" });

  const EXPORTERS = [
    {
      id: "png",
      label: "PNG image",
      ext: "png",
      mime: "image/png",
      async export(doc, opts) {
        opts = opts || {};
        const i = clamp(opts.frame == null ? 0 : opts.frame, 0, doc.frames.length - 1);
        return pngBlob(scaleImage(doc.flatten(i), opts.scale || 1));
      },
    },
    {
      id: "png-sequence",
      label: "PNG sequence (zip)",
      ext: "zip",
      mime: "application/zip",
      async export(doc, opts) {
        opts = opts || {};
        const name = baseName(opts, doc);
        const frames = gatherFrames(doc, opts);
        const digits = String(frames.length).length;
        const entries = [];
        for (let i = 0; i < frames.length; i++) {
          entries.push({ name: `${name}_${String(i).padStart(digits, "0")}.png`, data: await encodePNG(frames[i].image) });
        }
        return zipOf(entries);
      },
    },
    {
      id: "spritesheet",
      label: "Sprite sheet (PNG)",
      ext: "png",
      mime: "image/png",
      async export(doc, opts) {
        return pngBlob(buildSpriteSheet(doc, opts).image);
      },
    },
    {
      id: "atlas-json",
      label: "Sprite sheet atlas (Aseprite JSON)",
      ext: "json",
      mime: "application/json",
      async export(doc, opts) {
        return new Blob([JSON.stringify(buildSpriteSheet(doc, opts).json, null, 2)], { type: "application/json" });
      },
    },
    {
      id: "spritesheet-zip",
      label: "Sprite sheet + atlas (zip)",
      ext: "zip",
      mime: "application/zip",
      async export(doc, opts) {
        opts = opts || {};
        const name = baseName(opts, doc);
        const sheet = buildSpriteSheet(doc, Object.assign({}, opts, { imageName: `${name}.png` }));
        return zipOf([
          { name: `${name}.png`, data: await encodePNG(sheet.image) },
          { name: `${name}.json`, data: new TextEncoder().encode(JSON.stringify(sheet.json, null, 2)) },
        ]);
      },
    },
    {
      id: "gif",
      label: "Animated GIF",
      ext: "gif",
      mime: "image/gif",
      async export(doc, opts) {
        opts = opts || {};
        return new Blob([encodeGIF(gatherFrames(doc, opts), { loops: opts.loops })], { type: "image/gif" });
      },
    },
    {
      id: "apng",
      label: "Animated PNG",
      ext: "png",
      mime: "image/apng",
      async export(doc, opts) {
        opts = opts || {};
        return new Blob([await encodeAPNG(gatherFrames(doc, opts), opts.loops || 0)], { type: "image/apng" });
      },
    },
    {
      id: "webp",
      label: "WebP image (if supported)",
      ext: "webp",
      mime: "image/webp",
      async export(doc, opts) {
        opts = opts || {};
        // only the browser's canvas can write webp; bail out clearly where it can't
        if (typeof document === "undefined") throw new Error("WebP export needs a browser");
        const img = scaleImage(doc.flatten(clamp(opts.frame == null ? 0 : opts.frame, 0, doc.frames.length - 1)), opts.scale || 1);
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        canvas.getContext("2d").putImageData(img, 0, 0);
        const blob = await new Promise((res) => canvas.toBlob(res, "image/webp", 1));
        if (!blob || blob.type !== "image/webp") throw new Error("this browser can't encode WebP");
        return blob;
      },
    },
  ];
  for (const e of EXPORTERS) api.exporters[e.id] = e;

  // ----- importers -----

  async function imageFromFile(file) {
    const bmp = await createImageBitmap(file);
    const canvas = typeof OffscreenCanvas === "function" ? new OffscreenCanvas(bmp.width, bmp.height) : Object.assign(document.createElement("canvas"), { width: bmp.width, height: bmp.height });
    const ctx = canvas.getContext("2d");
    // 1:1 draw, so pixels come back exactly as stored
    ctx.drawImage(bmp, 0, 0);
    return ctx.getImageData(0, 0, bmp.width, bmp.height);
  }

  api.importers.png = async (file) => {
    const imageData = await imageFromFile(file);
    return { w: imageData.width, h: imageData.height, imageData };
  };
  // gif keeps every frame: {w, h, loops, frames:[{image, ms}], imageData: first frame}
  api.importers.gif = async (file) => {
    const gif = decodeGIF(new Uint8Array(await file.arrayBuffer()));
    return Object.assign(gif, { imageData: gif.frames[0] && gif.frames[0].image });
  };

  api.buildSpriteSheet = buildSpriteSheet;
  api.scaleImage = scaleImage;
  api.layoutSheet = layoutSheet;

  // ---------- plug into the editor ----------

  function register() {
    const studio = root.PixelStudio;
    if (!studio) return;
    for (const f of FILTERS) if (studio.registerFilter) studio.registerFilter({ id: f.id, label: f.label, params: f.params, apply: f.apply });
    for (const p of PALETTES) if (studio.registerPalette) studio.registerPalette({ id: p.id, name: p.name, colors: p.colors.slice() });
    for (const e of EXPORTERS) if (studio.registerExporter) studio.registerExporter(e);
    studio.importers = Object.assign(studio.importers || {}, api.importers);
    studio.paletteTools = api.tools;
  }
  register();


  return api;
});
