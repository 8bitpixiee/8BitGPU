/* Pixel Studio editor (Aseprite-style): pure logic first (UMD, testable in node),
   then the canvas UI + window.PixelStudio registries further down. */
(function (root, factory) {
  const lib = factory(root);
  if (typeof module === "object" && module.exports) module.exports = lib;
  else {
    // fx.js may have run first in odd setups; keep whatever it registered
    const prev = root.PixelStudio;
    root.PixelStudio = lib.PixelStudio;
    if (prev && typeof prev === "object") {
      ["filters", "exporters", "palettes"].forEach((k) => (prev[k] || []).forEach((it) => lib.PixelStudio["register" + k[0].toUpperCase() + k.slice(1, -1)](it)));
    }
    root.PixelStudioCore = lib.core;
  }
})(typeof self !== "undefined" ? self : this, function (root) {
  "use strict";

  // ---------------------------------------------------------------- colour helpers
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  // rgba lives as an unsigned 32-bit int (r<<24|g<<16|b<<8|a) so it is endian-proof and JSON-safe
  const pack = (r, g, b, a) => (((r & 255) << 24) | ((g & 255) << 16) | ((b & 255) << 8) | (a & 255)) >>> 0;
  const unpack = (v) => [v >>> 24, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  function getPx(d, i) {
    const o = i * 4;
    return pack(d[o], d[o + 1], d[o + 2], d[o + 3]);
  }
  function setPx(d, i, v) {
    const o = i * 4;
    d[o] = v >>> 24;
    d[o + 1] = (v >>> 16) & 255;
    d[o + 2] = (v >>> 8) & 255;
    d[o + 3] = v & 255;
  }
  function hexToPacked(hex) {
    let s = String(hex || "").replace("#", "").trim();
    if (s.length === 3 || s.length === 4) s = s.split("").map((c) => c + c).join("");
    if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(s)) return 0x000000ff;
    const n = parseInt(s.slice(0, 6), 16);
    const a = s.length === 8 ? parseInt(s.slice(6), 16) : 255;
    return pack(n >> 16, (n >> 8) & 255, n & 255, a);
  }
  function packedToHex(v) {
    const [r, g, b, a] = unpack(v);
    const h = (n) => n.toString(16).padStart(2, "0");
    return "#" + h(r) + h(g) + h(b) + (a === 255 ? "" : h(a));
  }
  // source-over of one packed pixel onto another (straight alpha)
  function overPx(dst, src) {
    const sa = src & 255;
    if (sa === 255) return src;
    if (sa === 0) return dst;
    const da = dst & 255;
    if (da === 0) return src;
    const s = sa / 255, d = (da / 255) * (1 - s), ra = s + d;
    const mix = (sh) => Math.round((((src >>> sh) & 255) * s + ((dst >>> sh) & 255) * d) / ra);
    return pack(mix(24), mix(16), mix(8), Math.round(ra * 255));
  }
  function lerpPx(a, b, t) {
    const A = unpack(a), B = unpack(b);
    return pack(...A.map((v, i) => Math.round(v + (B[i] - v) * t)));
  }

  // ---------------------------------------------------------------- base64 + RLE
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const B64REV = new Int16Array(128).fill(-1);
  for (let i = 0; i < 64; i++) B64REV[B64.charCodeAt(i)] = i;
  function b64enc(bytes) {
    const out = [];
    let i = 0;
    for (; i + 2 < bytes.length; i += 3) {
      const n = (bytes[i] << 16) | (bytes[i + 1] << 8) | bytes[i + 2];
      out.push(B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + B64[n & 63]);
    }
    const rest = bytes.length - i;
    if (rest === 1) {
      const n = bytes[i] << 16;
      out.push(B64[n >> 18] + B64[(n >> 12) & 63] + "==");
    } else if (rest === 2) {
      const n = (bytes[i] << 16) | (bytes[i + 1] << 8);
      out.push(B64[n >> 18] + B64[(n >> 12) & 63] + B64[(n >> 6) & 63] + "=");
    }
    return out.join("");
  }
  function b64dec(str) {
    const s = String(str || "").replace(/=+$/, "");
    const out = new Uint8Array(Math.floor((s.length * 3) / 4));
    let o = 0, buf = 0, bits = 0;
    for (let i = 0; i < s.length; i++) {
      const v = B64REV[s.charCodeAt(i)];
      if (v < 0) continue;
      buf = (buf << 6) | v;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        out[o++] = (buf >> bits) & 255;
      }
    }
    return out.subarray(0, o);
  }
  class ByteWriter {
    constructor() {
      this.buf = new Uint8Array(256);
      this.n = 0;
    }
    byte(b) {
      if (this.n === this.buf.length) {
        const nb = new Uint8Array(this.buf.length * 2);
        nb.set(this.buf);
        this.buf = nb;
      }
      this.buf[this.n++] = b;
    }
    varint(v) {
      while (v >= 128) {
        this.byte((v & 127) | 128);
        v = Math.floor(v / 128);
      }
      this.byte(v);
    }
    bytes() {
      return this.buf.subarray(0, this.n);
    }
  }
  // walk a cel as [count, packed] runs
  function eachRun(data, cb) {
    const n = data.length / 4;
    if (!n) return;
    let cur = getPx(data, 0), count = 1;
    for (let i = 1; i < n; i++) {
      const v = getPx(data, i);
      if (v === cur) count++;
      else {
        cb(count, cur);
        cur = v;
        count = 1;
      }
    }
    cb(count, cur);
  }
  function isEmpty(data) {
    for (let i = 3; i < data.length; i += 4) if (data[i]) return false;
    return true;
  }
  // self-contained form for ops: varint count + 4 raw bytes per run
  function rleEncode(data) {
    const w = new ByteWriter();
    eachRun(data, (c, v) => {
      w.varint(c);
      w.byte(v >>> 24);
      w.byte((v >>> 16) & 255);
      w.byte((v >>> 8) & 255);
      w.byte(v & 255);
    });
    return b64enc(w.bytes());
  }
  function readVarint(bytes, pos) {
    let v = 0, mul = 1, b;
    do {
      b = bytes[pos.i++];
      v += (b & 127) * mul;
      mul *= 128;
    } while (b & 128 && pos.i < bytes.length);
    return v;
  }
  function rleDecode(str, length) {
    const bytes = b64dec(str), out = new Uint8ClampedArray(length), pos = { i: 0 };
    let p = 0;
    while (pos.i < bytes.length && p < length) {
      const c = readVarint(bytes, pos);
      const v = pack(bytes[pos.i], bytes[pos.i + 1], bytes[pos.i + 2], bytes[pos.i + 3]);
      pos.i += 4;
      for (let k = 0; k < c && p < length; k++, p += 4) setPx(out, p / 4, v);
    }
    return out;
  }
  // document form: runs index into one shared colour table (much smaller for real sprites)
  function rleEncodeIdx(data, table) {
    const w = new ByteWriter();
    eachRun(data, (c, v) => {
      w.varint(c);
      w.varint(table.get(v));
    });
    return b64enc(w.bytes());
  }
  function rleDecodeIdx(str, colors, length) {
    const bytes = b64dec(str), out = new Uint8ClampedArray(length), pos = { i: 0 };
    let p = 0;
    while (pos.i < bytes.length && p < length) {
      const c = readVarint(bytes, pos), v = colors[readVarint(bytes, pos)] || 0;
      for (let k = 0; k < c && p < length; k++, p += 4) setPx(out, p / 4, v);
    }
    return out;
  }

  // ---------------------------------------------------------------- blending
  const BLEND = {
    normal: (b, s) => s,
    multiply: (b, s) => b * s,
    screen: (b, s) => b + s - b * s,
    overlay: (b, s) => (b <= 0.5 ? 2 * b * s : 1 - 2 * (1 - b) * (1 - s)),
    add: (b, s) => Math.min(1, b + s),
  };
  const BLEND_MODES = Object.keys(BLEND);
  // composite src cel onto out in place; opacity 0..255
  function compositeCel(out, src, opacity, mode) {
    const fn = BLEND[mode] || BLEND.normal, op = opacity / 255;
    for (let i = 0; i < out.length; i += 4) {
      const sa = (src[i + 3] / 255) * op;
      if (sa <= 0) continue;
      const ba = out[i + 3] / 255;
      if (mode === "normal" || !mode) {
        if (sa >= 1 || ba === 0) {
          out[i] = src[i]; out[i + 1] = src[i + 1]; out[i + 2] = src[i + 2]; out[i + 3] = Math.round(sa * 255);
          continue;
        }
        const ra = sa + ba * (1 - sa);
        for (let c = 0; c < 3; c++) out[i + c] = (src[i + c] * sa + out[i + c] * ba * (1 - sa)) / ra;
        out[i + 3] = Math.round(ra * 255);
        continue;
      }
      const ra = sa + ba * (1 - sa);
      for (let c = 0; c < 3; c++) {
        const cb = out[i + c] / 255, cs = src[i + c] / 255;
        const mixed = (1 - ba) * cs + ba * fn(cb, cs);
        out[i + c] = ((1 - sa) * ba * cb + sa * mixed) / ra * 255;
      }
      out[i + 3] = Math.round(ra * 255);
    }
  }
  function makeImageData(data, w, h) {
    if (typeof root.ImageData === "function") return new root.ImageData(data, w, h);
    return { width: w, height: h, data };
  }

  // ---------------------------------------------------------------- rasterising
  function line(x0, y0, x1, y1, cb) {
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (;;) {
      cb(x0, y0);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }
  function rect(x0, y0, x1, y1, filled, cb) {
    const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
    for (let y = ay; y <= by; y++)
      for (let x = ax; x <= bx; x++) if (filled || x === ax || x === bx || y === ay || y === by) cb(x, y);
  }
  // per-row [left,right] spans of the ellipse that fills the pixel box
  function ellipseSpans(x0, y0, x1, y1) {
    const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
    const cx = (ax + bx) / 2, cy = (ay + by) / 2, A = (bx - ax + 1) / 2, B = (by - ay + 1) / 2;
    const spans = [];
    for (let y = ay; y <= by; y++) {
      const dy = (y - cy) / B;
      const hw = A * Math.sqrt(Math.max(0, 1 - dy * dy));
      let l = Math.ceil(cx - hw - 1e-9), r = Math.floor(cx + hw + 1e-9);
      if (r < l) l = r = Math.round(cx);
      spans.push([clamp(l, ax, bx), clamp(r, ax, bx)]);
    }
    return { spans, y0: ay };
  }
  function ellipse(x0, y0, x1, y1, filled, cb) {
    const { spans, y0: top } = ellipseSpans(x0, y0, x1, y1);
    spans.forEach(([l, r], i) => {
      const y = top + i;
      if (filled) {
        for (let x = l; x <= r; x++) cb(x, y);
        return;
      }
      // outline: edge pixel plus the horizontal run that joins it to the neighbouring rows
      const pv = spans[i - 1] || [r + 1, l - 1], nx = spans[i + 1] || [r + 1, l - 1];
      const leftTo = Math.min(r, Math.max(pv[0], nx[0], l + 1) - 1);
      const rightFrom = Math.max(l, Math.min(pv[1], nx[1], r - 1) + 1);
      for (let x = l; x <= leftTo; x++) cb(x, y);
      for (let x = Math.max(rightFrom, leftTo + 1); x <= r; x++) cb(x, y);
    });
  }
  const brushCache = new Map();
  // offsets of a brush of `size` around its anchor pixel
  function brushOffsets(size, shape) {
    size = clamp(Math.round(size) || 1, 1, 128);
    const key = size + shape;
    if (brushCache.has(key)) return brushCache.get(key);
    const out = [], lo = -Math.floor((size - 1) / 2), c = (size - 1) / 2, r2 = (size * size) / 4 - 0.5;
    for (let j = 0; j < size; j++)
      for (let i = 0; i < size; i++) {
        if (shape === "square" || size <= 2 || (i - c) * (i - c) + (j - c) * (j - c) <= r2) out.push(lo + i, lo + j);
      }
    brushCache.set(key, out);
    return out;
  }

  // ---------------------------------------------------------------- masks (selection)
  const newMask = (w, h) => new Uint8Array(w * h);
  function maskFromShape(w, h, kind, x0, y0, x1, y1) {
    const m = newMask(w, h);
    const put = (x, y) => { if (x >= 0 && y >= 0 && x < w && y < h) m[y * w + x] = 1; };
    if (kind === "ellipse") ellipse(x0, y0, x1, y1, true, put);
    else rect(x0, y0, x1, y1, true, put);
    return m;
  }
  // even-odd scanline fill of a closed polygon through pixel-centre points
  function maskFromPolygon(w, h, pts) {
    const m = newMask(w, h);
    if (pts.length < 3) return m;
    for (let y = 0; y < h; y++) {
      const xs = [];
      for (let i = 0; i < pts.length; i++) {
        const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
        if ((ay <= y && by > y) || (by <= y && ay > y)) xs.push(ax + ((y - ay) / (by - ay)) * (bx - ax));
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2)
        for (let x = Math.max(0, Math.round(xs[k])); x <= Math.min(w - 1, Math.round(xs[k + 1])); x++) m[y * w + x] = 1;
    }
    // the outline itself counts too, so a thin lasso still selects something
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[(i + 1) % pts.length];
      line(ax, ay, bx, by, (x, y) => { if (x >= 0 && y >= 0 && x < w && y < h) m[y * w + x] = 1; });
    }
    return m;
  }
  function combineMasks(a, b, mode, w, h) {
    if (!a || mode === "replace") return b;
    const out = newMask(w, h);
    for (let i = 0; i < out.length; i++) {
      out[i] = mode === "add" ? (a[i] | b[i]) : mode === "sub" ? (a[i] & ~b[i] & 1) : (a[i] & b[i]);
    }
    return out;
  }
  function invertMask(m, w, h) {
    const out = newMask(w, h);
    for (let i = 0; i < out.length; i++) out[i] = m ? (m[i] ? 0 : 1) : 1;
    return out;
  }
  function maskBounds(m, w, h) {
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++)
        if (m[y * w + x]) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
    return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }
  function maskCount(m) {
    let n = 0;
    for (let i = 0; i < m.length; i++) n += m[i];
    return n;
  }
  function shiftMask(m, w, h, dx, dy) {
    const out = newMask(w, h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) {
        if (!m[y * w + x]) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < w && ny < h) out[ny * w + nx] = 1;
      }
    return out;
  }

  // ---------------------------------------------------------------- flood fill
  function colorsMatch(d, o, t, tol) {
    if (t[3] === 0 && d[o + 3] === 0) return true;
    return Math.abs(d[o] - t[0]) <= tol && Math.abs(d[o + 1] - t[1]) <= tol && Math.abs(d[o + 2] - t[2]) <= tol && Math.abs(d[o + 3] - t[3]) <= tol;
  }
  // returns a 0/1 mask of the filled region. limit (optional mask) confines it.
  function floodFill(data, w, h, sx, sy, tol, contiguous, limit) {
    const mask = newMask(w, h);
    if (sx < 0 || sy < 0 || sx >= w || sy >= h) return mask;
    const o0 = (sy * w + sx) * 4, t = [data[o0], data[o0 + 1], data[o0 + 2], data[o0 + 3]];
    const ok = (x, y) => (!limit || limit[y * w + x]) && colorsMatch(data, (y * w + x) * 4, t, tol);
    if (!contiguous) {
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (ok(x, y)) mask[y * w + x] = 1;
      return mask;
    }
    if (!ok(sx, sy)) return mask;
    const stack = [[sx, sy]];
    while (stack.length) {
      const [x, y] = stack.pop();
      if (mask[y * w + x] || !ok(x, y)) continue;
      let l = x, r = x;
      while (l > 0 && !mask[y * w + l - 1] && ok(l - 1, y)) l--;
      while (r < w - 1 && !mask[y * w + r + 1] && ok(r + 1, y)) r++;
      for (let i = l; i <= r; i++) mask[y * w + i] = 1;
      for (const ny of [y - 1, y + 1]) {
        if (ny < 0 || ny >= h) continue;
        let inRun = false;
        for (let i = l; i <= r; i++) {
          const can = !mask[ny * w + i] && ok(i, ny);
          if (can && !inRun) stack.push([i, ny]);
          inRun = can;
        }
      }
    }
    return mask;
  }

  // ---------------------------------------------------------------- dither
  function bayer(n) {
    if (n === 1) return [[0]];
    const p = bayer(n / 2), out = [];
    for (let y = 0; y < n; y++) {
      out.push([]);
      for (let x = 0; x < n; x++) {
        const base = p[y % (n / 2)][x % (n / 2)] * 4;
        out[y].push(base + [[0, 2], [3, 1]][Math.floor(y / (n / 2))][Math.floor(x / (n / 2))]);
      }
    }
    return out;
  }
  const DITHERS = { bayer2: bayer(2), bayer4: bayer(4), bayer8: bayer(8), checker: [[0, 2], [3, 1]].map((r) => r.map((v) => (v > 1 ? 1 : 0))) };
  // threshold 0..1 for a pixel under the named pattern, null for smooth
  function ditherThreshold(name, x, y) {
    const m = DITHERS[name];
    if (!m) return null;
    const n = m.length;
    if (name === "checker") return (x + y) % 2 ? 0.75 : 0.25;
    return (m[y % n][x % n] + 0.5) / (n * n);
  }

  // ---------------------------------------------------------------- region transforms
  // flip / rotate the masked pixels of a cel (or the whole cel when mask is null); returns {data, mask}
  function transformRegion(data, w, h, mask, kind) {
    const b = mask ? maskBounds(mask, w, h) : { x: 0, y: 0, w, h };
    if (!b) return { data, mask };
    const out = new Uint8ClampedArray(data), nm = newMask(w, h);
    const inside = (x, y) => (mask ? mask[y * w + x] : 1);
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (inside(x, y)) setPx(out, y * w + x, 0);
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
    for (let y = b.y; y < b.y + b.h; y++)
      for (let x = b.x; x < b.x + b.w; x++) {
        if (!inside(x, y)) continue;
        let nx, ny;
        if (kind === "flipH") { nx = b.x + b.w - 1 - (x - b.x); ny = y; }
        else if (kind === "flipV") { nx = x; ny = b.y + b.h - 1 - (y - b.y); }
        else {
          // quarter turns about the box centre
          const rx = x + 0.5 - cx, ry = y + 0.5 - cy;
          const [qx, qy] = kind === "rotCW" ? [-ry, rx] : kind === "rotCCW" ? [ry, -rx] : [-rx, -ry];
          nx = Math.floor(cx + qx);
          ny = Math.floor(cy + qy);
        }
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        setPx(out, ny * w + nx, overPx(getPx(out, ny * w + nx), getPx(data, y * w + x)));
        nm[ny * w + nx] = 1;
      }
    return { data: out, mask: nm };
  }
  // nearest-neighbour scale of the masked region about its top-left corner
  function scaleRegion(data, w, h, mask, sx, sy) {
    const b = mask ? maskBounds(mask, w, h) : { x: 0, y: 0, w, h };
    if (!b) return { data, mask };
    const out = new Uint8ClampedArray(data), nm = newMask(w, h);
    for (let y = b.y; y < b.y + b.h; y++) for (let x = b.x; x < b.x + b.w; x++) if (!mask || mask[y * w + x]) setPx(out, y * w + x, 0);
    const nw = Math.max(1, Math.round(b.w * sx)), nh = Math.max(1, Math.round(b.h * sy));
    for (let y = 0; y < nh; y++)
      for (let x = 0; x < nw; x++) {
        const ox = b.x + Math.min(b.w - 1, Math.floor(x / sx)), oy = b.y + Math.min(b.h - 1, Math.floor(y / sy));
        if (mask && !mask[oy * w + ox]) continue;
        const tx = b.x + x, ty = b.y + y;
        if (tx >= w || ty >= h) continue;
        setPx(out, ty * w + tx, getPx(data, oy * w + ox));
        nm[ty * w + tx] = 1;
      }
    return { data: out, mask: nm };
  }

  // ---------------------------------------------------------------- document
  const PICO8 = ["#000000", "#1d2b53", "#7e2553", "#008751", "#ab5236", "#5f574f", "#c2c3c7", "#fff1e8", "#ff004d", "#ffa300", "#ffec27", "#00e436", "#29adff", "#83769c", "#ff77a8", "#ffccaa"];
  const uid = () => Math.floor(Math.random() * 1e9) + 1000;

  class Doc {
    constructor(w, h) {
      this.v = 1;
      this.w = clamp(w | 0 || 32, 1, 1024);
      this.h = clamp(h | 0 || 32, 1, 1024);
      this.palette = PICO8.slice();
      this.layers = [{ id: 1, name: "Layer 1", visible: true, locked: false, opacity: 255, blend: "normal" }];
      this.frames = [{ id: 1, ms: 100 }];
      this.tags = [];
      this.cels = new Map(); // "layerId:frameId" -> Uint8ClampedArray (missing = empty)
    }
    key(lid, fid) { return lid + ":" + fid; }
    layerIndex(id) { return this.layers.findIndex((l) => l.id === id); }
    frameIndex(id) { return this.frames.findIndex((f) => f.id === id); }
    getLayer(id) { return this.layers[this.layerIndex(id)] || null; }
    // cel by layer id + frame INDEX (what ops and exporters use)
    cel(lid, fi, create) {
      const f = this.frames[fi];
      if (!f || this.layerIndex(lid) < 0) return null;
      const k = this.key(lid, f.id);
      let c = this.cels.get(k);
      if (!c && create) {
        c = new Uint8ClampedArray(this.w * this.h * 4);
        this.cels.set(k, c);
      }
      return c || null;
    }
    // read-only view for exporters: composite of one frame (optionally only some layers)
    flattenData(fi, opts) {
      const out = new Uint8ClampedArray(this.w * this.h * 4);
      opts = opts || {};
      for (const L of this.layers) {
        if (!L.visible && !opts.includeHidden) continue;
        if (opts.layers && !opts.layers.includes(L.id)) continue;
        const c = this.cel(L.id, fi, false);
        if (c) compositeCel(out, c, L.opacity, L.blend);
      }
      return out;
    }
    flatten(fi, opts) {
      return makeImageData(this.flattenData(fi, opts), this.w, this.h);
    }
    // ---- the single mutation entry: local edits and remote ops both land here
    apply(op) {
      const W = this.w, H = this.h;
      switch (op.k) {
        case "px": {
          const c = this.cel(op.l, op.f, true);
          if (!c) return false;
          for (let i = 0; i + 2 < op.pts.length; i += 3) {
            const x = op.pts[i], y = op.pts[i + 1];
            if (x >= 0 && y >= 0 && x < W && y < H) setPx(c, y * W + x, op.pts[i + 2] >>> 0);
          }
          return true;
        }
        case "cel-set": {
          const f = this.frames[op.f];
          if (!f || this.layerIndex(op.l) < 0) return false;
          if (op.rle) this.cels.set(this.key(op.l, f.id), rleDecode(op.rle, W * H * 4));
          else this.cels.delete(this.key(op.l, f.id));
          return true;
        }
        case "layer-add": {
          if (this.getLayer(op.layer.id)) return false;
          const L = Object.assign({ id: op.layer.id, name: "Layer", visible: true, locked: false, opacity: 255, blend: "normal" }, op.layer);
          this.layers.splice(clamp(op.at == null ? this.layers.length : op.at, 0, this.layers.length), 0, L);
          for (const fi in op.cels || {}) this.apply({ k: "cel-set", l: L.id, f: +fi, rle: op.cels[fi] });
          return true;
        }
        case "layer-del": {
          const i = this.layerIndex(op.id);
          if (i < 0 || this.layers.length < 2) return false;
          this.layers.splice(i, 1);
          for (const f of this.frames) this.cels.delete(this.key(op.id, f.id));
          return true;
        }
        case "layer-set": {
          const L = this.getLayer(op.id);
          if (!L) return false;
          Object.assign(L, op.props);
          L.opacity = clamp(Math.round(L.opacity), 0, 255);
          if (!BLEND[L.blend]) L.blend = "normal";
          return true;
        }
        case "layer-move": {
          const i = this.layerIndex(op.id);
          if (i < 0) return false;
          const [L] = this.layers.splice(i, 1);
          this.layers.splice(clamp(op.to, 0, this.layers.length), 0, L);
          return true;
        }
        case "frame-add": {
          if (this.frames.some((f) => f.id === op.fid)) return false;
          const f = { id: op.fid, ms: clamp(op.ms | 0 || 100, 10, 60000) };
          const at = clamp(op.at == null ? this.frames.length : op.at, 0, this.frames.length);
          this.frames.splice(at, 0, f);
          this.tags.forEach((t) => {
            if (t.from >= at) t.from++;
            if (t.to >= at) t.to++;
          });
          for (const lid in op.cels || {}) this.apply({ k: "cel-set", l: +lid, f: at, rle: op.cels[lid] });
          return true;
        }
        case "frame-del": {
          const i = this.frameIndex(op.fid);
          if (i < 0 || this.frames.length < 2) return false;
          this.frames.splice(i, 1);
          for (const L of this.layers) this.cels.delete(this.key(L.id, op.fid));
          const last = this.frames.length - 1;
          this.tags = this.tags
            .map((t) => ({ ...t, from: t.from > i ? t.from - 1 : t.from, to: t.to >= i ? Math.max(t.to - 1, 0) : t.to }))
            .map((t) => ({ ...t, from: Math.min(t.from, last), to: Math.min(Math.max(t.to, t.from), last) }));
          return true;
        }
        case "frame-set": {
          const f = this.frames.find((x) => x.id === op.fid);
          if (!f) return false;
          f.ms = clamp(op.ms | 0 || f.ms, 10, 60000);
          return true;
        }
        case "frame-move": {
          const i = this.frameIndex(op.fid);
          if (i < 0) return false;
          const [f] = this.frames.splice(i, 1);
          this.frames.splice(clamp(op.to, 0, this.frames.length), 0, f);
          return true;
        }
        case "tags":
          this.tags = (op.tags || []).map((t) => ({
            name: String(t.name || "tag").slice(0, 40),
            from: clamp(t.from | 0, 0, this.frames.length - 1),
            to: clamp(t.to | 0, 0, this.frames.length - 1),
            dir: ["forward", "reverse", "pingpong"].includes(t.dir) ? t.dir : "forward",
            color: t.color || "#ffcc00",
          }));
          return true;
        case "palette":
          this.palette = (op.palette || []).slice(0, 1024);
          return true;
        case "canvas": {
          // new size with the old art placed at (ox, oy); negative offsets crop
          const nw = clamp(op.w | 0, 1, 1024), nh = clamp(op.h | 0, 1, 1024), ox = op.ox | 0, oy = op.oy | 0;
          this.mapCels(nw, nh, (src, out) => {
            for (let y = 0; y < H; y++) {
              const ty = y + oy;
              if (ty < 0 || ty >= nh) continue;
              for (let x = 0; x < W; x++) {
                const tx = x + ox;
                if (tx >= 0 && tx < nw) setPx(out, ty * nw + tx, getPx(src, y * W + x));
              }
            }
          });
          return true;
        }
        case "scale": {
          const nw = clamp(op.w | 0, 1, 1024), nh = clamp(op.h | 0, 1, 1024);
          this.mapCels(nw, nh, (src, out) => {
            for (let y = 0; y < nh; y++)
              for (let x = 0; x < nw; x++) setPx(out, y * nw + x, getPx(src, Math.floor((y * H) / nh) * W + Math.floor((x * W) / nw)));
          });
          return true;
        }
        case "rot": {
          const d = op.d === 180 ? 180 : op.d === -90 ? -90 : 90;
          const nw = d === 180 ? W : H, nh = d === 180 ? H : W;
          this.mapCels(nw, nh, (src, out) => {
            for (let y = 0; y < H; y++)
              for (let x = 0; x < W; x++) {
                const [tx, ty] = d === 90 ? [H - 1 - y, x] : d === -90 ? [y, W - 1 - x] : [W - 1 - x, H - 1 - y];
                setPx(out, ty * nw + tx, getPx(src, y * W + x));
              }
          });
          return true;
        }
        case "flip": {
          this.mapCels(W, H, (src, out) => {
            for (let y = 0; y < H; y++)
              for (let x = 0; x < W; x++) setPx(out, y * W + x, getPx(src, op.axis === "v" ? (H - 1 - y) * W + x : y * W + (W - 1 - x)));
          });
          return true;
        }
        case "doc":
          this.replaceWith(Doc.parse(op.s));
          return true;
      }
      return false;
    }
    mapCels(nw, nh, fn) {
      const next = new Map();
      for (const [k, src] of this.cels) {
        const out = new Uint8ClampedArray(nw * nh * 4);
        fn(src, out);
        next.set(k, out);
      }
      this.cels = next;
      this.w = nw;
      this.h = nh;
    }
    replaceWith(d) {
      Object.assign(this, { w: d.w, h: d.h, palette: d.palette, layers: d.layers, frames: d.frames, tags: d.tags, cels: d.cels });
    }
    // structure snapshot for undo: arrays are cloned, pixel buffers are shared by reference
    snapshot() {
      return {
        w: this.w, h: this.h, palette: this.palette.slice(),
        layers: this.layers.map((l) => ({ ...l })), frames: this.frames.map((f) => ({ ...f })),
        tags: this.tags.map((t) => ({ ...t })), cels: new Map(this.cels),
      };
    }
    restore(s) {
      this.w = s.w; this.h = s.h; this.palette = s.palette.slice();
      this.layers = s.layers.map((l) => ({ ...l })); this.frames = s.frames.map((f) => ({ ...f }));
      this.tags = s.tags.map((t) => ({ ...t })); this.cels = new Map(s.cels);
    }
    serialize() {
      // one colour table for the whole doc keeps the per-cel runs to ~2 bytes each
      const table = new Map(), list = [];
      const cels = [], seen = new Map();
      this.layers.forEach((L) =>
        this.frames.forEach((f, fi) => {
          const c = this.cels.get(this.key(L.id, f.id));
          if (!c || isEmpty(c)) return;
          eachRun(c, (n, v) => { if (!table.has(v)) { table.set(v, list.length); list.push(v); } });
          const enc = rleEncodeIdx(c, table);
          const same = seen.get(L.id + "|" + enc);
          if (same !== undefined && enc.length > 12) cels.push([L.id, fi, "=" + same]); // identical to an earlier frame
          else {
            seen.set(L.id + "|" + enc, fi);
            cels.push([L.id, fi, enc]);
          }
        })
      );
      const ct = new Uint8Array(list.length * 4);
      list.forEach((v, i) => { ct[i * 4] = v >>> 24; ct[i * 4 + 1] = (v >>> 16) & 255; ct[i * 4 + 2] = (v >>> 8) & 255; ct[i * 4 + 3] = v & 255; });
      return JSON.stringify({
        v: 1, w: this.w, h: this.h, palette: this.palette,
        layers: this.layers, frames: this.frames, tags: this.tags, ct: b64enc(ct), cels,
      });
    }
    static parse(str) {
      const j = typeof str === "string" ? JSON.parse(str) : str;
      if (!j || j.v !== 1) throw new Error("not a pixel studio document");
      const d = new Doc(j.w, j.h);
      d.palette = Array.isArray(j.palette) && j.palette.length ? j.palette.slice(0, 1024) : PICO8.slice();
      d.layers = (j.layers || []).map((l, i) => ({ id: l.id || i + 1, name: String(l.name || "Layer"), visible: l.visible !== false, locked: !!l.locked, opacity: clamp(l.opacity == null ? 255 : l.opacity, 0, 255), blend: BLEND[l.blend] ? l.blend : "normal" }));
      if (!d.layers.length) d.layers = [{ id: 1, name: "Layer 1", visible: true, locked: false, opacity: 255, blend: "normal" }];
      d.frames = (j.frames || []).map((f, i) => ({ id: f.id || i + 1, ms: clamp(f.ms || 100, 10, 60000) }));
      if (!d.frames.length) d.frames = [{ id: 1, ms: 100 }];
      d.tags = (j.tags || []).slice();
      const ctBytes = b64dec(j.ct || ""), colors = new Uint32Array(ctBytes.length / 4);
      for (let i = 0; i < colors.length; i++) colors[i] = pack(ctBytes[i * 4], ctBytes[i * 4 + 1], ctBytes[i * 4 + 2], ctBytes[i * 4 + 3]);
      const len = d.w * d.h * 4, byPos = new Map();
      for (const [lid, fi, enc] of j.cels || []) {
        const L = d.layers.find((l) => l.id === lid), F = d.frames[fi];
        if (!L || !F) continue;
        const data = enc[0] === "=" ? byPos.get(lid + "|" + enc.slice(1)) : rleDecodeIdx(enc, colors, len);
        if (!data) continue;
        byPos.set(lid + "|" + fi, data);
        d.cels.set(d.key(lid, F.id), enc[0] === "=" ? new Uint8ClampedArray(data) : data);
      }
      return d;
    }
  }

  // ---------------------------------------------------------------- history
  class History {
    constructor(limit) {
      this.limit = limit || 300;
      this.undos = [];
      this.redos = [];
    }
    push(entry) {
      this.undos.push(entry);
      if (this.undos.length > this.limit) this.undos.shift();
      this.redos.length = 0;
    }
    undo() {
      const e = this.undos.pop();
      if (!e) return null;
      e.undo();
      this.redos.push(e);
      return e;
    }
    redo() {
      const e = this.redos.pop();
      if (!e) return null;
      e.redo();
      this.undos.push(e);
      return e;
    }
    clear() {
      this.undos.length = 0;
      this.redos.length = 0;
    }
    get canUndo() { return this.undos.length > 0; }
    get canRedo() { return this.redos.length > 0; }
  }

  // records the pre-edit value of every pixel touched so a stroke can be rolled back or diffed
  class Tx {
    constructor(cel) {
      this.cel = cel;
      this.before = new Map();
    }
    get(i) { return getPx(this.cel, i); }
    set(i, v) {
      if (!this.before.has(i)) this.before.set(i, getPx(this.cel, i));
      setPx(this.cel, i, v);
    }
    rollback() {
      for (const [i, v] of this.before) setPx(this.cel, i, v);
      this.before.clear();
    }
    // changed pixels only: Map idx -> [old, new]
    changes() {
      const out = new Map();
      for (const [i, old] of this.before) {
        const cur = getPx(this.cel, i);
        if (cur !== old) out.set(i, [old, cur]);
      }
      return out;
    }
  }

  const core = {
    clamp, pack, unpack, getPx, setPx, hexToPacked, packedToHex, overPx, lerpPx,
    b64enc, b64dec, rleEncode, rleDecode, rleEncodeIdx, rleDecodeIdx, isEmpty,
    BLEND, BLEND_MODES, compositeCel, makeImageData,
    line, rect, ellipse, ellipseSpans, brushOffsets,
    newMask, maskFromShape, maskFromPolygon, combineMasks, invertMask, maskBounds, maskCount, shiftMask,
    floodFill, bayer, ditherThreshold, DITHERS, transformRegion, scaleRegion,
    Doc, History, Tx, PICO8,
  };

  // ---------------------------------------------------------------- registries (read at menu-open time)
  const PixelStudio = {
    version: 1,
    core,
    filters: [],
    exporters: [],
    palettes: [],
    registerFilter(f) { return putById(this.filters, f, ["id", "label", "apply"]); },
    registerExporter(e) { return putById(this.exporters, e, ["id", "label", "export"]); },
    registerPalette(p) { return putById(this.palettes, p, ["id", "name", "colors"]); },
    mount(host, opts) {
      if (!PixelStudio._ui) throw new Error("PixelStudio UI not available here");
      return PixelStudio._ui(host, opts || {});
    },
  };
  function putById(list, item, need) {
    if (!item || need.some((k) => item[k] == null)) throw new Error("PixelStudio: registration needs " + need.join(", "));
    const i = list.findIndex((x) => x.id === item.id);
    if (i >= 0) list[i] = item;
    else list.push(item);
    return item;
  }

  //@UI-BEGIN
  //@UI-END
  return { core, PixelStudio, Doc, History };
});
