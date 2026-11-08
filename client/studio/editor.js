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
    if (mode === "replace" || (!a && mode === "add")) return b;
    if (!a) return newMask(w, h);
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
  // ================================================================ UI
  const isDom = typeof document !== "undefined";
  const { getPx: gp, setPx: sp } = core;

  // 12x12 pixel icons, painted through CSS masks so they follow the theme colour
  const ICON_ROWS = {
    pencil: ["........###.", ".......#####", "......#####.", ".....#####..", "....#####...", "...#####....", "..#####.....", ".#####......", ".####.......", "###.........", "##..........", "............"],
    eraser: ["............", "............", "...######...", "..#######...", ".########...", ".#######.#..", ".######.##..", ".#####.###..", ".....#####..", "............", "............", "............"],
    line: ["..........##", ".........##.", "........##..", ".......##...", "......##....", ".....##.....", "....##......", "...##.......", "..##........", ".##.........", "##..........", "............"],
    rect: ["............", ".##########.", ".#........#.", ".#........#.", ".#........#.", ".#........#.", ".#........#.", ".#........#.", ".#........#.", ".##########.", "............", "............"],
    ellipse: ["............", "....####....", "..##....##..", ".#........#.", ".#........#.", "#..........#", "#..........#", ".#........#.", ".#........#.", "..##....##..", "....####....", "............"],
    bucket: [".....##.....", "....#..#....", "...#....#...", "..#......#..", ".#...##...#.", "#...####...#", ".#.######.#.", "..########..", "...######.#.", "....####..##", ".....##...##", "............"],
    gradient: ["............", "............", "............", "#.#.#.#.#.#.", ".#.#.#.#.#.#", "#.#.#.#.#.#.", "............", "#...#...#...", "............", "..#...#...#.", "............", "#..........."],
    picker: [".........##.", "........####", ".......####.", "......###...", ".....##.#...", "....##.#....", "...##.......", "..##........", ".##.........", "##..........", "#...........", "............"],
    spray: [".......#....", "..#.........", "......#..#..", "....#.......", ".#....#...#.", "......#.....", "..##..#.#...", ".....#......", "#..###..#...", "...####..#..", "..######....", "...####....."],
    marquee: ["............", ".##.##.##.#.", ".#........#.", "............", ".#........#.", "............", ".#........#.", "............", ".#........#.", ".##.##.##.#.", "............", "............"],
    ellmarquee: ["............", "....#.##....", "..##....#...", ".#........#.", "............", "#..........#", "............", "#..........#", ".#........#.", "..#.....##..", "....##.#....", "............"],
    lasso: ["...######...", "..#......#..", ".#........#.", ".#........#.", ".#........#.", "..#......#..", "...##..##...", ".....##.....", "....#.......", "....#.......", ".....#......", "............"],
    wand: [".........#..", "..#.....###.", ".........#..", ".......##...", "......##....", ".....##.....", "....##......", "...##.......", "..##........", ".##.....#...", "##.....###..", "........#..."],
    move: [".....##.....", "....####....", "...######...", ".....##.....", ".#...##...#.", "####....####", "####....####", ".#...##...#.", ".....##.....", "...######...", "....####....", ".....##....."],
    hand: ["....#.#.#...", "....#.#.#.#.", "..#.#.#.#.#.", "..#.#######.", "..#.########", "..##########", "...#########", "...#########", "....########", ".....######.", ".....#####..", "............"],
    zoom: ["..####......", ".#....#.....", "#......#....", "#......#....", "#......#....", ".#....#.....", "..####.#....", "........#...", ".........#..", "..........#.", "...........#", "............"],
    eye: ["............", "............", "...######...", ".##......##.", "#...####...#", "#..######..#", "#...####...#", ".##......##.", "...######...", "............", "............", "............"],
    lock: ["............", "...######...", "..#......#..", "..#......#..", "..#......#..", ".##########.", ".#........#.", ".#...##...#.", ".#...##...#.", ".#........#.", ".##########.", "............"],
  };
  const iconCache = {};
  function iconUrl(name) {
    if (iconCache[name]) return iconCache[name];
    const rows = ICON_ROWS[name], cv = document.createElement("canvas");
    cv.width = cv.height = 12;
    const c = cv.getContext("2d");
    rows.forEach((r, y) => [...r].forEach((ch, x) => ch === "#" && c.fillRect(x, y, 1, 1)));
    return (iconCache[name] = "url(" + cv.toDataURL() + ")");
  }
  const icon = (name) => h("span", { class: "pxs-ico", style: "--i:" + iconUrl(name) });

  function h(tag, attrs, ...kids) {
    const e = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "style") e.style.cssText = v;
      else if (k === "text") e.textContent = v;
      else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
      else if (k in e && k !== "list") e[k] = v;
      else e.setAttribute(k, v === true ? "" : v);
    }
    kids.flat().forEach((c) => c != null && c !== false && e.append(c.nodeType ? c : document.createTextNode(c)));
    return e;
  }

  // shortcut -> tools (pressing the same key again cycles inside the group, like Aseprite)
  const TOOLS = [
    { id: "pencil", key: "b", label: "Pencil" }, { id: "eraser", key: "e", label: "Eraser" },
    { id: "line", key: "l", label: "Line" }, { id: "rect", key: "u", label: "Rectangle" }, { id: "ellipse", key: "u", label: "Ellipse" },
    { id: "bucket", key: "g", label: "Paint bucket" }, { id: "gradient", key: "g", label: "Gradient" },
    { id: "picker", key: "i", label: "Eyedropper" }, { id: "spray", key: "s", label: "Spray" },
    { id: "marquee", key: "m", label: "Rect select" }, { id: "ellmarquee", key: "m", label: "Ellipse select" },
    { id: "lasso", key: "q", label: "Lasso" }, { id: "wand", key: "w", label: "Magic wand" },
    { id: "move", key: "v", label: "Move" }, { id: "hand", key: "h", label: "Pan" }, { id: "zoom", key: "z", label: "Zoom" },
  ];
  const PAINT_TOOLS = ["pencil", "eraser", "line", "rect", "ellipse", "bucket", "gradient", "spray"];
  const ZOOMS = [0.5, 1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];
  const STRUCT_OPS = ["layer-add", "layer-del", "layer-set", "layer-move", "frame-add", "frame-del", "frame-set", "frame-move", "canvas", "scale", "rot", "flip", "doc"];

  const luma = (v) => 0.299 * (v >>> 24) + 0.587 * ((v >>> 16) & 255) + 0.114 * ((v >>> 8) & 255);

  class Editor {
    constructor(host, opts) {
      this.host = host;
      this.opts = opts;
      this.readOnly = !!opts.readOnly;
      this.hist = new History();
      this.clip = null;
      this.applying = false;
      this.fg = core.hexToPacked("#000000");
      this.bg = core.hexToPacked("#ffffff");
      this.tool = "pencil";
      this.sel = null;
      this.zoom = 8;
      this.pan = { x: 0, y: 0 };
      this.o = {
        size: 1, shape: "circle", pp: true, ink: "simple", tol: 0, contig: true, fill: false, selMode: "replace",
        symX: false, symY: false, tiled: false, grid: false, gridSize: 1, onion: false, onionPrev: 1, onionNext: 1,
        dither: "none", pressure: false, sample: "all", sprayR: 6, sprayD: 8, loop: "loop",
      };
      this.playing = false;
      this.tagSel = -1;
      this.gen = 0;
      this.fcache = new Map();
      this.touches = new Map();
      this.sizeLabels = {};
      try { this.doc = opts.doc ? Doc.parse(opts.doc) : new Doc(32, 32); } catch (e) { this.doc = new Doc(32, 32); }
      this.cur = { l: this.doc.layers[0].id, f: 0 };
      this.buildUI();
      this.fit();
      this.refresh();
    }

    // ---------------------------------------------------------------- public api
    getDoc() { return this.doc; }
    serialize() { return this.doc.serialize(); }
    load(s) {
      this.stop();
      this.doc = Doc.parse(s);
      this.hist.clear();
      this.sel = null;
      this.cur = { l: this.doc.layers[0].id, f: 0 };
      this.tagSel = -1;
      this.changed(true);
      this.fit();
    }
    applyOp(op) {
      if (!op || !op.k) return;
      this.applying = true;
      try {
        if (this.doc.apply(op)) {
          // remote structure changes make our undo snapshots lie, so drop them
          if (STRUCT_OPS.includes(op.k)) this.hist.clear();
          this.changed(STRUCT_OPS.includes(op.k), true);
        }
      } catch (e) { console.warn("PixelStudio.applyOp", e); }
      this.applying = false;
    }
    canvasOf(fi, scale) {
      const d = this.doc, cv = document.createElement("canvas");
      scale = scale || 1;
      cv.width = d.w * scale;
      cv.height = d.h * scale;
      const c = cv.getContext("2d"), src = document.createElement("canvas");
      src.width = d.w; src.height = d.h;
      src.getContext("2d").putImageData(d.flatten(clamp(fi | 0, 0, d.frames.length - 1)), 0, 0);
      c.imageSmoothingEnabled = false;
      c.drawImage(src, 0, 0, cv.width, cv.height);
      return cv;
    }
    exportPNG(fi) { return this.canvasOf(fi || 0, 1).toDataURL("image/png"); }
    thumbnail(max) {
      max = max || 96;
      const d = this.doc, s = Math.max(1, Math.floor(max / Math.max(d.w, d.h)));
      const cv = this.canvasOf(this.cur.f, s);
      if (cv.width <= max && cv.height <= max) return cv.toDataURL("image/png");
      const k = max / Math.max(cv.width, cv.height), out = document.createElement("canvas");
      out.width = Math.max(1, Math.round(cv.width * k)); out.height = Math.max(1, Math.round(cv.height * k));
      const c = out.getContext("2d");
      c.imageSmoothingEnabled = false;
      c.drawImage(cv, 0, 0, out.width, out.height);
      return out.toDataURL("image/png");
    }
    destroy() {
      this.stop();
      this.dead = true;
      clearInterval(this.antTimer);
      this.ro && this.ro.disconnect();
      this.cleanups.forEach((f) => f());
      this.host.removeChild(this.root);
    }

    // ---------------------------------------------------------------- state plumbing
    emit(op) {
      if (this.applying || !this.opts.onOp) return;
      try { this.opts.onOp(op); } catch (e) { console.warn("PixelStudio.onOp", e); }
    }
    curLayer() { return this.doc.getLayer(this.cur.l); }
    curCel(create) { return this.doc.cel(this.cur.l, this.cur.f, create); }
    fixCur() {
      const d = this.doc;
      if (!d.getLayer(this.cur.l)) this.cur.l = d.layers[Math.min(d.layers.length - 1, 0)].id;
      this.cur.f = clamp(this.cur.f, 0, d.frames.length - 1);
      if (this.sel && this.sel.length !== d.w * d.h) this.sel = null;
      if (this.tagSel >= d.tags.length) this.tagSel = -1;
    }
    changed(structural, remote) {
      this.gen++;
      this.fcache.clear();
      this.fixCur();
      this._selPath = null;
      if (structural) this.uiDirty = true;
      this.uiDirty = true;
      this.scheduleRefresh();
      this.scheduleDraw();
      if (!remote && this.opts.onChange) { try { this.opts.onChange(); } catch (e) { console.warn(e); } }
    }
    scheduleRefresh() {
      if (this.refreshQueued || this.dead) return;
      this.refreshQueued = true;
      requestAnimationFrame(() => {
        this.refreshQueued = false;
        if (!this.dead && this.uiDirty) this.refresh();
      });
    }
    canEdit() { return !this.readOnly; }
    canPaint() {
      const L = this.curLayer();
      if (this.readOnly) return false;
      if (!L || L.locked || !L.visible) {
        this.flash(!L ? "No layer" : L.locked ? "Layer is locked" : "Layer is hidden");
        return false;
      }
      return true;
    }

    // ---- structure edits: apply ops, snapshot before/after for undo, emit coarse ops
    commit(label, ops) {
      if (this.readOnly) return false;
      const pre = this.doc.snapshot();
      let any = false;
      ops.forEach((op) => { if (this.doc.apply(op)) any = true; });
      if (!any) return false;
      this.pushStruct(label, pre, ops);
      return true;
    }
    pushStruct(label, pre, ops) {
      const post = this.doc.snapshot(), self = this;
      const go = (snap) => {
        self.doc.restore(snap);
        if (self.opts.onOp) self.emit({ k: "doc", s: self.doc.serialize() });
        self.changed(true);
      };
      this.hist.push({ label, undo: () => go(pre), redo: () => go(post) });
      ops.forEach((op) => this.emit(op));
      this.changed(true);
    }

    // ---- pixel edits
    beginTx() {
      const cel = this.curCel(true);
      if (!cel) return null;
      return { tx: new Tx(cel), lid: this.cur.l, fid: this.doc.frames[this.cur.f].id };
    }
    endTx(label, t, selB) {
      if (!t) return;
      this.pushPixels(label, t.lid, t.fid, t.tx.changes(), selB === undefined ? this.sel : selB, this.sel);
    }
    pushPixels(label, lid, fid, changes, selB, selA) {
      if (!changes.size && selB === selA) return;
      const self = this;
      this.hist.push({
        label,
        undo() { self.applyChanges(lid, fid, changes, 0); self.setSelRaw(selB); },
        redo() { self.applyChanges(lid, fid, changes, 1); self.setSelRaw(selA); },
      });
      if (changes.size) this.emitPixels(lid, fid, changes, 1);
      this.changed();
    }
    applyChanges(lid, fid, changes, which) {
      const d = this.doc, key = d.key(lid, fid);
      let c = d.cels.get(key);
      if (!c) {
        if (!d.getLayer(lid) || d.frameIndex(fid) < 0) return;
        c = new Uint8ClampedArray(d.w * d.h * 4);
        d.cels.set(key, c);
      }
      for (const [i, pair] of changes) sp(c, i, pair[which]);
      this.emitPixels(lid, fid, changes, which);
      this.changed();
    }
    emitPixels(lid, fid, changes, which) {
      if (!this.opts.onOp || this.applying) return;
      const d = this.doc, fi = d.frameIndex(fid);
      if (fi < 0) return;
      if (changes.size > (d.w * d.h) / 6) {
        const c = d.cels.get(d.key(lid, fid));
        this.emit({ k: "cel-set", l: lid, f: fi, rle: c && !core.isEmpty(c) ? core.rleEncode(c) : null });
        return;
      }
      let pts = [];
      for (const [i, pair] of changes) {
        pts.push(i % d.w, Math.floor(i / d.w), pair[which]);
        if (pts.length >= 9000) { this.emit({ k: "px", f: fi, l: lid, pts }); pts = []; }
      }
      if (pts.length) this.emit({ k: "px", f: fi, l: lid, pts });
    }

    // ---- selection state
    setSelRaw(m) {
      this.sel = m;
      this._selPath = null;
      this.scheduleDraw();
      this.syncStatus && this.syncStatus();
    }
    pushSel(label, before, after) {
      if (before === after) return;
      const self = this;
      this.hist.push({ label, undo: () => self.setSelRaw(before), redo: () => self.setSelRaw(after) });
    }
    setSel(m, label) {
      const before = this.sel;
      this.setSelRaw(m && core.maskCount(m) ? m : null);
      this.pushSel(label || "Select", before, this.sel);
    }

    // ---------------------------------------------------------------- painting primitives
    wrapOrReject(x, y) {
      const W = this.doc.w, H = this.doc.h;
      if (this.o.tiled) return ((y % H) + H) % H * W + (((x % W) + W) % W);
      return x < 0 || y < 0 || x >= W || y >= H ? -1 : y * W + x;
    }
    // one pixel through selection, ink and once-per-stroke rules
    plot(tx, x, y, col, st) {
      const i = this.wrapOrReject(x, y);
      if (i < 0) return false;
      if (this.sel && !this.sel[i]) return false;
      if (st.visited) {
        if (st.visited[i]) return false;
        st.visited[i] = 1;
      }
      const old = tx.get(i);
      let nv;
      if (st.erase) nv = 0;
      else if (st.ink === "lockalpha") {
        if (!(old & 255)) return false;
        nv = ((col & 0xffffff00) | (old & 255)) >>> 0;
      } else if (st.ink === "lighten" || st.ink === "darken") {
        if (!(old & 255)) return false;
        nv = this.shadeStep(old, st.ink === "lighten" ? 1 : -1);
      } else nv = (col & 255) === 255 ? col : overPx(old, col);
      if (nv === old) return true;
      tx.set(i, nv);
      if (st.log) st.log.push(i);
      return true;
    }
    // next lighter/darker palette colour (palette sorted by luma), keeping alpha
    shadeStep(old, dir) {
      const pal = (this._ramp = this._ramp && this._rampGen === this.doc.palette ? this._ramp : this.doc.palette.map(core.hexToPacked).sort((a, b) => luma(a) - luma(b)));
      this._rampGen = this.doc.palette;
      let best = 0, bd = 1e9;
      pal.forEach((c, k) => { const d = Math.abs(luma(c) - luma(old)) + (c >>> 8 === old >>> 8 ? -1e6 : 0); if (d < bd) { bd = d; best = k; } });
      const n = pal[clamp(best + dir, 0, pal.length - 1)];
      return ((n & 0xffffff00) | (old & 255)) >>> 0;
    }
    mirrorPoints(x, y, size) {
      const W = this.doc.w, H = this.doc.h, pts = [[x, y]], odd = size % 2 ? 0 : 1;
      if (this.o.symX) pts.push([W - 1 - x - odd, y]);
      if (this.o.symY) pts.push([x, H - 1 - y - odd]);
      if (this.o.symX && this.o.symY) pts.push([W - 1 - x - odd, H - 1 - y - odd]);
      return pts;
    }
    stamp(tx, x, y, col, st, size) {
      const offs = core.brushOffsets(size, this.o.shape);
      for (const [px, py] of this.mirrorPoints(x, y, size))
        for (let k = 0; k < offs.length; k += 2) this.plot(tx, px + offs[k], py + offs[k + 1], col, st);
    }
    newStroke(erase, extra) {
      return Object.assign({ visited: new Uint8Array(this.doc.w * this.doc.h), erase, ink: this.o.ink }, extra);
    }
    penSize(e) {
      let s = this.o.size;
      if (this.o.pressure && e && e.pointerType === "pen" && e.pressure > 0) s = Math.max(1, Math.round(s * (0.25 + e.pressure * 1.2)));
      return s;
    }

    // ---------------------------------------------------------------- compositing + drawing
    frameCanvas(fi) {
      let c = this.fcache.get(fi);
      if (!c) {
        c = document.createElement("canvas");
        c.width = this.doc.w;
        c.height = this.doc.h;
        c.getContext("2d").putImageData(this.doc.flatten(fi), 0, 0);
        this.fcache.set(fi, c);
      }
      return c;
    }
    scheduleDraw() {
      if (this.drawQueued || this.dead) return;
      this.drawQueued = true;
      requestAnimationFrame(() => {
        this.drawQueued = false;
        if (!this.dead) this.draw();
      });
    }
    toScreen(x, y) { return [this.pan.x + x * this.zoom, this.pan.y + y * this.zoom]; }
    fit() {
      this.touched = false;
      const r = this.stage.getBoundingClientRect(), d = this.doc;
      const k = Math.min((r.width - 32) / d.w, (r.height - 32) / d.h);
      this.zoom = k >= 1 ? Math.max(1, Math.floor(k)) : Math.max(0.25, k);
      this.center();
      this.scheduleDraw();
      this.syncStatus && this.syncStatus();
    }
    center() {
      const r = this.stage.getBoundingClientRect();
      this.pan.x = Math.round((r.width - this.doc.w * this.zoom) / 2);
      this.pan.y = Math.round((r.height - this.doc.h * this.zoom) / 2);
    }
    zoomTo(z, cx, cy) {
      const r = this.stage.getBoundingClientRect();
      if (cx == null) { cx = r.width / 2; cy = r.height / 2; }
      this.touched = true;
      z = clamp(z, 0.25, 96);
      const px = (cx - this.pan.x) / this.zoom, py = (cy - this.pan.y) / this.zoom;
      this.zoom = z;
      this.pan.x = cx - px * z;
      this.pan.y = cy - py * z;
      this.scheduleDraw();
      this.syncStatus();
    }
    stepZoom(dir, cx, cy) {
      let i = ZOOMS.findIndex((z) => z >= this.zoom - 1e-6);
      if (i < 0) i = ZOOMS.length - 1;
      if (dir > 0) i = ZOOMS[i] > this.zoom + 1e-6 ? i : Math.min(ZOOMS.length - 1, i + 1);
      else i = Math.max(0, i - 1);
      this.zoomTo(ZOOMS[i], cx, cy);
    }
    selectionPath() {
      if (this._selPath || !this.sel) return this._selPath;
      const W = this.doc.w, H = this.doc.h, m = this.sel, p = new Path2D();
      const on = (x, y) => x >= 0 && y >= 0 && x < W && y < H && m[y * W + x];
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          if (!m[y * W + x]) continue;
          if (!on(x, y - 1)) { p.moveTo(x, y); p.lineTo(x + 1, y); }
          if (!on(x, y + 1)) { p.moveTo(x, y + 1); p.lineTo(x + 1, y + 1); }
          if (!on(x - 1, y)) { p.moveTo(x, y); p.lineTo(x, y + 1); }
          if (!on(x + 1, y)) { p.moveTo(x + 1, y); p.lineTo(x + 1, y + 1); }
        }
      return (this._selPath = p);
    }
    draw() {
      const cv = this.view, c = this.vctx, dpr = this.dpr || 1, d = this.doc, z = this.zoom;
      const cssW = cv.width / dpr, cssH = cv.height / dpr;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, cssW, cssH);
      c.imageSmoothingEnabled = false;
      const ox = Math.round(this.pan.x), oy = Math.round(this.pan.y), pw = d.w * z, ph = d.h * z;
      // checkerboard behind the sprite
      c.fillStyle = this.checker || (this.checker = this.makeChecker(c));
      c.save();
      c.translate(ox, oy);
      c.fillRect(0, 0, pw, ph);
      c.restore();
      const tiles = this.o.tiled ? [-1, 0, 1] : [0];
      const cur = this.frameCanvas(this.cur.f);
      for (const ty of tiles)
        for (const tx of tiles) {
          const dx = ox + tx * pw, dy = oy + ty * ph, ghost = tx || ty;
          if (ghost) { c.fillStyle = this.checker; c.fillRect(dx, dy, pw, ph); }
          c.globalAlpha = ghost ? 0.55 : 1;
          if (this.o.onion && !this.playing) {
            for (let k = 1; k <= this.o.onionPrev; k++) if (this.cur.f - k >= 0) { c.globalAlpha = (ghost ? 0.55 : 1) * 0.28 / k; c.drawImage(this.frameCanvas(this.cur.f - k), dx, dy, pw, ph); }
            for (let k = 1; k <= this.o.onionNext; k++) if (this.cur.f + k < d.frames.length) { c.globalAlpha = (ghost ? 0.55 : 1) * 0.2 / k; c.drawImage(this.frameCanvas(this.cur.f + k), dx, dy, pw, ph); }
            c.globalAlpha = ghost ? 0.55 : 1;
          }
          c.drawImage(cur, dx, dy, pw, ph);
          c.globalAlpha = 1;
        }
      // pixel / tile grid
      const gs = this.o.grid ? this.o.gridSize : 0;
      if (gs && z * gs >= 4) {
        c.strokeStyle = "rgba(128,128,128,.4)";
        c.lineWidth = 1;
        c.beginPath();
        for (let x = 0; x <= d.w; x += gs) { c.moveTo(ox + x * z + 0.5, oy); c.lineTo(ox + x * z + 0.5, oy + ph); }
        for (let y = 0; y <= d.h; y += gs) { c.moveTo(ox, oy + y * z + 0.5); c.lineTo(ox + pw, oy + y * z + 0.5); }
        c.stroke();
      }
      c.strokeStyle = "rgba(0,0,0,.5)";
      c.strokeRect(ox - 0.5, oy - 0.5, pw + 1, ph + 1);
      // symmetry guides
      c.save();
      c.strokeStyle = "rgba(255,0,200,.7)";
      c.setLineDash([4, 4]);
      c.beginPath();
      if (this.o.symX) { c.moveTo(ox + pw / 2, oy - 6); c.lineTo(ox + pw / 2, oy + ph + 6); }
      if (this.o.symY) { c.moveTo(ox - 6, oy + ph / 2); c.lineTo(ox + pw + 6, oy + ph / 2); }
      c.stroke();
      c.restore();
      // selection ants
      const path = this.selectionPath();
      if (path) {
        c.save();
        c.translate(ox, oy);
        c.scale(z, z);
        c.lineWidth = 1 / z;
        c.setLineDash([3 / z, 3 / z]);
        c.strokeStyle = "#fff";
        c.lineDashOffset = -(this.ants || 0) / z;
        c.stroke(path);
        c.strokeStyle = "#000";
        c.lineDashOffset = (3 - (this.ants || 0)) / z;
        c.stroke(path);
        c.restore();
      }
      // lasso in progress
      if (this.st && this.st.kind === "lasso" && this.st.pts.length > 1) {
        c.save();
        c.strokeStyle = "#fff";
        c.setLineDash([4, 4]);
        c.beginPath();
        this.st.pts.forEach(([x, y], i) => { const [sx, sy] = this.toScreen(x + 0.5, y + 0.5); i ? c.lineTo(sx, sy) : c.moveTo(sx, sy); });
        c.stroke();
        c.restore();
      }
      // brush footprint under the cursor
      if (this.hover && !this.playing && (PAINT_TOOLS.includes(this.tool) || this.tool === "spray")) {
        const size = this.tool === "bucket" || this.tool === "gradient" ? 1 : this.o.size;
        const offs = core.brushOffsets(size, this.o.shape);
        c.fillStyle = "rgba(255,255,255,.28)";
        c.strokeStyle = "rgba(0,0,0,.55)";
        for (const [mx, my] of this.mirrorPoints(this.hover.x, this.hover.y, size))
          for (let k = 0; k < offs.length; k += 2) {
            const [sx, sy] = this.toScreen(mx + offs[k], my + offs[k + 1]);
            c.fillRect(sx, sy, z, z);
            if (z >= 6) c.strokeRect(sx + 0.5, sy + 0.5, z - 1, z - 1);
          }
      }
    }
    makeChecker(c) {
      const t = document.createElement("canvas");
      t.width = t.height = 16;
      const k = t.getContext("2d");
      k.fillStyle = "#c9c9d1"; k.fillRect(0, 0, 16, 16);
      k.fillStyle = "#e7e7ee"; k.fillRect(0, 0, 8, 8); k.fillRect(8, 8, 8, 8);
      return c.createPattern(t, "repeat");
    }
    resizeView() {
      const r = this.stage.getBoundingClientRect();
      this.dpr = window.devicePixelRatio || 1;
      this.view.width = Math.max(1, Math.round(r.width * this.dpr));
      this.view.height = Math.max(1, Math.round(r.height * this.dpr));
      this.scheduleDraw();
    }
    flash(msg) {
      if (!this.statusMsg) return;
      this.statusMsg.textContent = msg;
      clearTimeout(this.flashT);
      this.flashT = setTimeout(() => (this.statusMsg.textContent = ""), 1800);
    }
  }

  // ================================================================ tools + pointer input
  Object.assign(Editor.prototype, {
    pos(e) {
      const r = this.view.getBoundingClientRect();
      const fx = (e.clientX - r.left - this.pan.x) / this.zoom, fy = (e.clientY - r.top - this.pan.y) / this.zoom;
      return { x: Math.floor(fx), y: Math.floor(fy), fx, fy, sx: e.clientX - r.left, sy: e.clientY - r.top };
    },
    onDown(e) {
      this.root.focus({ preventScroll: true });
      this.view.setPointerCapture(e.pointerId);
      const p = this.pos(e);
      if (e.pointerType === "touch") {
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.touches.size >= 2) {
          this.cancelStroke();
          this.startGesture();
          return;
        }
      }
      if (e.button === 1 || this.spaceDown || this.tool === "hand" || (e.pointerType === "touch" && this.panMode)) {
        this.drag = { kind: "pan", sx: e.clientX, sy: e.clientY, px: this.pan.x, py: this.pan.y };
        return;
      }
      if (this.playing) this.stop();
      let tool = this.tool;
      if (e.altKey && PAINT_TOOLS.includes(tool)) tool = "picker";
      const t = this.toolDefs[tool];
      if (!t) return;
      if (t.edit && !this.canPaint()) return;
      if (t.sel && this.readOnly) return;
      this.btn = e.button;
      this.drag = { kind: "tool", tool: t, e };
      t.down && t.down.call(this, p, e);
      this.scheduleDraw();
    },
    onMove(e) {
      const p = this.pos(e);
      this.hover = p;
      this.syncStatus(p);
      if (e.pointerType === "touch" && this.touches.has(e.pointerId)) {
        this.touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (this.gesture) return this.moveGesture();
      }
      const dr = this.drag;
      if (dr && dr.kind === "pan") {
        this.touched = true;
        this.pan.x = dr.px + (e.clientX - dr.sx);
        this.pan.y = dr.py + (e.clientY - dr.sy);
      } else if (dr && dr.kind === "tool") {
        // coalesced events keep fast pen/mouse strokes from skipping pixels
        const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
        (evs.length ? evs : [e]).forEach((ev) => {
          const q = ev === e ? p : this.pos(ev);
          dr.tool.move && dr.tool.move.call(this, q, ev.pressure ? ev : e);
        });
      }
      this.scheduleDraw();
    },
    onUp(e) {
      this.touches.delete(e.pointerId);
      if (this.gesture) {
        if (this.touches.size < 2) this.gesture = null;
        return;
      }
      const dr = this.drag;
      this.drag = null;
      if (dr && dr.kind === "tool") dr.tool.up && dr.tool.up.call(this, this.pos(e), e);
      this.stopSpray();
      this.scheduleDraw();
    },
    cancelStroke() {
      if (this.st && this.st.t) this.st.t.tx.rollback();
      if (this.mv) this.mv.tx.rollback();
      this.st = null;
      this.mv = null;
      this.drag = null;
      this.stopSpray();
      this.changed();
    },
    startGesture() {
      const pts = [...this.touches.values()];
      this.gesture = { d: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1, cx: (pts[0].x + pts[1].x) / 2, cy: (pts[0].y + pts[1].y) / 2 };
    },
    moveGesture() {
      const pts = [...this.touches.values()], g = this.gesture;
      if (pts.length < 2) return;
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1, cx = (pts[0].x + pts[1].x) / 2, cy = (pts[0].y + pts[1].y) / 2;
      const r = this.view.getBoundingClientRect();
      this.pan.x += cx - g.cx;
      this.pan.y += cy - g.cy;
      this.zoomTo(this.zoom * (d / g.d), cx - r.left, cy - r.top);
      g.d = d; g.cx = cx; g.cy = cy;
    },
    onWheel(e) {
      e.preventDefault();
      const r = this.view.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey || !e.shiftKey) this.stepZoom(e.deltaY < 0 ? 1 : -1, e.clientX - r.left, e.clientY - r.top);
      else { this.pan.x -= e.deltaY; this.scheduleDraw(); }
    },
    selModeFor(e) {
      return e.shiftKey && (e.altKey) ? "intersect" : e.shiftKey ? "add" : e.altKey ? "sub" : this.o.selMode;
    },
    colorFor(e) { return this.btn === 2 ? this.bg : this.fg; },
    stopSpray() { clearInterval(this.sprayT); this.sprayT = null; },
    sprayAt(p) {
      const st = this.st;
      if (!st) return;
      for (let n = 0; n < this.o.sprayD; n++) {
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * this.o.sprayR;
        const x = Math.round(p.x + Math.cos(a) * r), y = Math.round(p.y + Math.sin(a) * r);
        for (const [mx, my] of this.mirrorPoints(x, y, 1)) this.plot(st.t.tx, mx, my, st.col, st);
      }
      this.changed();
    },
    // flat sample under the cursor: merged frame or just the current cel
    samplePx(x, y) {
      const d = this.doc;
      if (x < 0 || y < 0 || x >= d.w || y >= d.h) return null;
      const data = this.o.sample === "layer" ? this.curCel(false) : d.flattenData(this.cur.f);
      return data ? gp(data, y * d.w + x) : 0;
    },
    pickAt(p) {
      const v = this.samplePx(p.x, p.y);
      if (v == null) return;
      if (this.btn === 2) this.setBg(v); else this.setFg(v);
    },
  });

  // per-tool behaviours; `this` is the editor
  Editor.prototype.toolDefs = (function () {
    const freehand = (erase) => ({
      edit: true,
      down(p, e) {
        const t = this.beginTx();
        if (!t) return;
        const size = this.penSize(e);
        const st = (this.st = this.newStroke(erase, { t, col: this.colorFor(e), last: p, path: [], size, log: [], pp: this.o.pp && size === 1, selB: this.sel }));
        this.freeStep(p, true);
        this.changed();
      },
      move(p, e) {
        const st = this.st;
        if (!st || (p.x === st.last.x && p.y === st.last.y)) return;
        st.size = this.penSize(e);
        const from = st.last;
        core.line(from.x, from.y, p.x, p.y, (x, y) => {
          if (x === from.x && y === from.y) return;
          this.freeStep({ x, y }, false);
        });
        st.last = p;
        this.changed();
      },
      up() {
        const st = this.st;
        this.st = null;
        if (st) this.endTx(erase ? "Erase" : "Pencil", st.t, st.selB);
      },
    });
    // one freehand point: stamp it, and for pixel-perfect drop the middle pixel of any L-corner
    Editor.prototype.freeStep = function (p, first) {
      const st = this.st, tx = st.t.tx;
      st.log.length = 0;
      this.stamp(tx, p.x, p.y, st.col, st, st.size);
      if (!st.pp) return;
      const path = st.path;
      path.push({ x: p.x, y: p.y, idx: st.log.slice() });
      const n = path.length;
      if (n < 3) return;
      const a = path[n - 3], b = path[n - 2], c = path[n - 1];
      const corner = Math.abs(a.x - c.x) === 1 && Math.abs(a.y - c.y) === 1 && (a.x === b.x || a.y === b.y) && (b.x === c.x || b.y === c.y);
      if (corner) {
        for (const i of b.idx) {
          if (tx.before.has(i)) { sp(tx.cel, i, tx.before.get(i)); tx.before.delete(i); }
          st.visited[i] = 0;
        }
        path.splice(n - 2, 1);
      }
    };

    const shape = (kind) => ({
      edit: true,
      down(p, e) {
        const t = this.beginTx();
        if (!t) return;
        this.st = { kind, t, a: p, col: this.colorFor(e), selB: this.sel };
        this.shapeDraw(p, e);
      },
      move(p, e) { this.st && this.shapeDraw(p, e); },
      up() {
        const st = this.st;
        this.st = null;
        if (st) this.endTx(kind === "line" ? "Line" : kind === "rect" ? "Rectangle" : "Ellipse", st.t, st.selB);
      },
    });
    Editor.prototype.shapeDraw = function (p, e) {
      const st = this.st, tx = st.t.tx;
      tx.rollback();
      let { x: ax, y: ay } = st.a, bx = p.x, by = p.y;
      if (e.shiftKey) {
        const dx = bx - ax, dy = by - ay;
        if (st.kind === "line") {
          // snap to 8 directions
          const ang = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(dx, dy);
          bx = ax + Math.round(Math.cos(ang) * len); by = ay + Math.round(Math.sin(ang) * len);
        } else {
          const m = Math.max(Math.abs(dx), Math.abs(dy));
          bx = ax + Math.sign(dx || 1) * m; by = ay + Math.sign(dy || 1) * m;
        }
      }
      if (e.ctrlKey && st.kind !== "line") { ax = 2 * st.a.x - bx; ay = 2 * st.a.y - by; } // from centre
      const s = this.newStroke(false, { ink: this.o.ink });
      const col = st.col, size = this.o.size;
      if (st.kind === "line") core.line(ax, ay, bx, by, (x, y) => this.stamp(tx, x, y, col, s, size));
      else {
        const fn = st.kind === "rect" ? core.rect : core.ellipse;
        if (this.o.fill) {
          const f = this.newStroke(false, { ink: this.o.ink });
          fn(ax, ay, bx, by, true, (x, y) => this.stamp(tx, x, y, col, f, 1));
        }
        const sOut = this.newStroke(false, { ink: this.o.ink });
        // an unfilled shape keeps each pixel once; with a thick brush overlapping stamps would double-blend
        fn(ax, ay, bx, by, false, (x, y) => this.stamp(tx, x, y, col, sOut, size));
      }
      this.changed();
    };

    return {
      pencil: freehand(false),
      eraser: freehand(true),
      line: shape("line"),
      rect: shape("rect"),
      ellipse: shape("ellipse"),
      spray: {
        edit: true,
        down(p, e) {
          const t = this.beginTx();
          if (!t) return;
          this.st = this.newStroke(false, { t, col: this.colorFor(e), selB: this.sel, visited: null });
          let cur = p;
          this.sprayPos = () => cur;
          this.sprayMove = (q) => (cur = q);
          this.sprayAt(p);
          this.sprayT = setInterval(() => this.sprayAt(cur), 30);
        },
        move(p) { this.sprayMove && this.sprayMove(p); },
        up() {
          const st = this.st;
          this.st = null;
          this.stopSpray();
          if (st) this.endTx("Spray", st.t, st.selB);
        },
      },
      bucket: {
        edit: true,
        down(p, e) {
          const t = this.beginTx();
          if (!t) return;
          const d = this.doc;
          if (p.x < 0 || p.y < 0 || p.x >= d.w || p.y >= d.h) return;
          const src = this.o.sample === "layer" ? t.tx.cel : d.flattenData(this.cur.f);
          const mask = core.floodFill(src, d.w, d.h, p.x, p.y, this.o.tol, this.o.contig, this.sel);
          const fg = this.fg, bg = this.bg, col = this.btn === 2 ? bg : fg, dith = this.o.dither;
          for (let i = 0; i < mask.length; i++) {
            if (!mask[i]) continue;
            const x = i % d.w, y = (i / d.w) | 0;
            let c = col;
            if (dith !== "none") c = (core.ditherThreshold(dith, x, y) > 0.5 ? bg : fg);
            t.tx.set(i, (c & 255) === 255 ? c : overPx(t.tx.get(i), c));
          }
          this.endTx("Fill", t);
          this.changed();
        },
      },
      gradient: {
        edit: true,
        down(p, e) {
          const t = this.beginTx();
          if (!t) return;
          this.st = { kind: "gradient", t, a: p, selB: this.sel };
        },
        move(p) {
          const st = this.st;
          if (!st) return;
          const { tx } = st.t, d = this.doc, ax = st.a.x, ay = st.a.y, dx = p.x - ax, dy = p.y - ay, len2 = dx * dx + dy * dy;
          tx.rollback();
          if (!len2) return this.changed();
          for (let y = 0; y < d.h; y++)
            for (let x = 0; x < d.w; x++) {
              const i = y * d.w + x;
              if (this.sel && !this.sel[i]) continue;
              const t = clamp(((x - ax) * dx + (y - ay) * dy) / len2, 0, 1), thr = core.ditherThreshold(this.o.dither, x, y);
              tx.set(i, thr == null ? core.lerpPx(this.fg, this.bg, t) : t > thr ? this.bg : this.fg);
            }
          this.changed();
        },
        up() {
          const st = this.st;
          this.st = null;
          if (st) this.endTx("Gradient", st.t, st.selB);
        },
      },
      picker: {
        down(p) { this.pickAt(p); },
        move(p) { this.pickAt(p); },
      },
      marquee: selShape("rect"),
      ellmarquee: selShape("ellipse"),
      lasso: {
        sel: true,
        down(p, e) { this.st = { kind: "lasso", pts: [[p.x, p.y]], base: this.sel, mode: this.selModeFor(e) }; },
        move(p) {
          const st = this.st, last = st && st.pts[st.pts.length - 1];
          if (st && (last[0] !== p.x || last[1] !== p.y)) st.pts.push([p.x, p.y]);
        },
        up(p) {
          const st = this.st;
          this.st = null;
          if (!st) return;
          const d = this.doc;
          if (st.pts.length < 3) return void (st.mode === "replace" && this.setSel(null, "Deselect"));
          this.setSelRaw(null);
          const m = core.maskFromPolygon(d.w, d.h, st.pts);
          this.sel = st.base;
          this.setSel(core.combineMasks(st.base, m, st.mode, d.w, d.h), "Lasso");
        },
      },
      wand: {
        sel: true,
        down(p, e) {
          const d = this.doc;
          if (p.x < 0 || p.y < 0 || p.x >= d.w || p.y >= d.h) return;
          const src = this.o.sample === "layer" ? this.curCel(false) || new Uint8ClampedArray(d.w * d.h * 4) : d.flattenData(this.cur.f);
          const m = core.floodFill(src, d.w, d.h, p.x, p.y, this.o.tol, this.o.contig);
          this.setSel(core.combineMasks(this.sel, m, this.selModeFor(e), d.w, d.h), "Magic wand");
        },
      },
      move: {
        edit: true,
        down(p) {
          const t = this.beginTx();
          if (!t) return;
          this.mv = { tx: t.tx, lid: t.lid, fid: t.fid, src: new Uint8ClampedArray(t.tx.cel), mask: this.sel, selB: this.sel, ax: p.x, ay: p.y };
        },
        move(p) { this.mv && this.moveBy(p.x - this.mv.ax, p.y - this.mv.ay); },
        up() { this.endMove(); },
      },
      hand: {},
      zoom: {
        down(p, e) {
          const r = this.view.getBoundingClientRect();
          this.stepZoom(this.btn === 2 || e.altKey ? -1 : 1, e.clientX - r.left, e.clientY - r.top);
        },
      },
    };
    function selShape(kind) {
      return {
        sel: true,
        down(p, e) { this.st = { kind: "sel", shape: kind, a: p, base: this.sel, mode: this.selModeFor(e), moved: false }; },
        move(p, e) {
          const st = this.st;
          if (!st) return;
          const d = this.doc;
          let bx = p.x, by = p.y;
          if (e.shiftKey && st.mode === "replace") {
            const m = Math.max(Math.abs(bx - st.a.x), Math.abs(by - st.a.y));
            bx = st.a.x + Math.sign(bx - st.a.x || 1) * m; by = st.a.y + Math.sign(by - st.a.y || 1) * m;
          }
          if (bx !== st.a.x || by !== st.a.y) st.moved = true;
          const m = core.maskFromShape(d.w, d.h, st.shape, st.a.x, st.a.y, bx, by);
          this.setSelRaw(core.combineMasks(st.base, m, st.mode, d.w, d.h));
        },
        up(p) {
          const st = this.st;
          this.st = null;
          if (!st) return;
          if (!st.moved && st.mode === "replace") this.setSelRaw(null);
          if (this.sel && !core.maskCount(this.sel)) this.setSelRaw(null);
          this.pushSel("Select", st.base, this.sel);
        },
      };
    }
  })();

  // ---------------------------------------------------------------- move session (selection contents or whole cel)
  Object.assign(Editor.prototype, {
    moveBy(dx, dy) {
      const m = this.mv, d = this.doc, W = d.w, H = d.h, tx = m.tx, src = m.src;
      tx.rollback();
      const put = (i) => {
        const v = gp(src, i);
        if (!(v & 255)) return;
        const nx = (i % W) + dx, ny = ((i / W) | 0) + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) return;
        const j = ny * W + nx;
        tx.set(j, overPx(tx.get(j), v));
      };
      const n = W * H;
      for (let i = 0; i < n; i++) if ((m.mask ? m.mask[i] : 1) && gp(src, i) & 255) tx.set(i, 0);
      for (let i = 0; i < n; i++) if (m.mask ? m.mask[i] : 1) put(i);
      if (m.mask) this._selPath = null, (this.sel = core.shiftMask(m.mask, W, H, dx, dy));
      this.changed();
    },
    endMove() {
      const m = this.mv;
      this.mv = null;
      if (!m) return;
      this.pushPixels("Move", m.lid, m.fid, m.tx.changes(), m.selB, this.sel);
    },
    nudge(dx, dy) {
      if (!this.canPaint()) return;
      const t = this.beginTx();
      if (!t) return;
      this.mv = { tx: t.tx, lid: t.lid, fid: t.fid, src: new Uint8ClampedArray(t.tx.cel), mask: this.sel, selB: this.sel };
      this.moveBy(dx, dy);
      this.endMove();
    },
  });

  // ================================================================ chrome: layout, panels, menus
  const OPTION_DEFS = [
    { key: "size", type: "range", min: 1, max: 32, label: "Size", tools: "pencil eraser line rect ellipse spray" },
    { key: "shape", type: "select", options: [["circle", "Round"], ["square", "Square"]], label: "Brush", tools: "pencil eraser line rect ellipse" },
    { key: "pp", type: "check", label: "Pixel-perfect", tools: "pencil eraser" },
    { key: "ink", type: "select", options: [["simple", "Simple ink"], ["lockalpha", "Lock alpha"], ["lighten", "Lighten"], ["darken", "Darken"]], label: "Ink", tools: "pencil eraser line rect ellipse spray" },
    { key: "pressure", type: "check", label: "Pen pressure", tools: "pencil eraser" },
    { key: "fill", type: "check", label: "Filled", tools: "rect ellipse" },
    { key: "sprayR", type: "range", min: 1, max: 40, label: "Radius", tools: "spray" },
    { key: "sprayD", type: "range", min: 1, max: 40, label: "Density", tools: "spray" },
    { key: "tol", type: "range", min: 0, max: 255, label: "Tolerance", tools: "bucket wand" },
    { key: "contig", type: "check", label: "Contiguous", tools: "bucket wand" },
    { key: "sample", type: "select", options: [["all", "All layers"], ["layer", "This layer"]], label: "Sample", tools: "bucket wand picker" },
    { key: "dither", type: "select", options: [["none", "Smooth"], ["bayer2", "Bayer 2x2"], ["bayer4", "Bayer 4x4"], ["bayer8", "Bayer 8x8"], ["checker", "Checker"]], label: "Dither", tools: "bucket gradient" },
    { key: "selMode", type: "seg", options: [["replace", "New"], ["add", "Add"], ["sub", "Subtract"], ["intersect", "Intersect"]], label: "Mode", tools: "marquee ellmarquee lasso wand" },
    { key: "symX", type: "check", label: "Mirror X", tools: "pencil eraser line rect ellipse spray" },
    { key: "symY", type: "check", label: "Mirror Y", tools: "pencil eraser line rect ellipse spray" },
    { key: "tiled", type: "check", label: "Tiled", tools: "pencil eraser line rect ellipse spray bucket gradient move picker hand zoom marquee ellmarquee lasso wand" },
  ];

  Object.assign(Editor.prototype, {
    buildUI() {
      this.cleanups = [];
      const on = (t, ev, fn, o) => { t.addEventListener(ev, fn, o); this.cleanups.push(() => t.removeEventListener(ev, fn, o)); };
      const root = (this.root = h("div", { class: "pxs-ed", tabIndex: 0, "data-panel": "" }));
      this.menubar = h("div", { class: "pxs-menubar" });
      this.toolbar = h("div", { class: "pxs-tools" });
      this.optbar = h("div", { class: "pxs-opts" });
      this.view = h("canvas", { class: "pxs-view" });
      this.statusMsg = h("span", { class: "pxs-msg" });
      this.statusPos = h("span", { class: "pxs-pos" });
      this.stage = h("div", { class: "pxs-stage" }, this.view);
      this.side = h("div", { class: "pxs-side" });
      this.tl = h("div", { class: "pxs-tl" });
      const tabs = h("div", { class: "pxs-tabs" },
        ["colors:Colors", "layers:Layers", "frames:Frames"].map((s) => {
          const [k, l] = s.split(":");
          return h("button", { type: "button", class: "pxs-tab", onclick: () => { root.dataset.panel = root.dataset.panel === k ? "" : k; this.resizeSoon(); } }, l);
        }));
      root.append(
        this.menubar,
        h("div", { class: "pxs-body" },
          this.toolbar,
          h("div", { class: "pxs-mid" }, this.optbar, this.stage, h("div", { class: "pxs-status" }, this.statusPos, this.statusMsg)),
          this.side),
        this.tl, tabs);
      this.host.appendChild(root);
      this.vctx = this.view.getContext("2d");

      this.buildTools();
      this.buildOptions();
      this.buildMenubar();
      this.buildSide();

      on(this.view, "pointerdown", (e) => this.onDown(e));
      on(this.view, "pointermove", (e) => this.onMove(e));
      on(this.view, "pointerup", (e) => this.onUp(e));
      on(this.view, "pointercancel", (e) => this.onUp(e));
      on(this.view, "pointerleave", () => { this.hover = null; this.scheduleDraw(); });
      on(this.view, "wheel", (e) => this.onWheel(e), { passive: false });
      on(this.view, "contextmenu", (e) => e.preventDefault());
      on(root, "keydown", (e) => this.onKey(e));
      on(root, "keyup", (e) => { if (e.key === " ") this.spaceDown = false; });
      on(document, "pointerdown", (e) => { if (this.menuEl && !this.menuEl.contains(e.target) && !e.target.closest(".pxs-mb")) this.closeMenu(); });
      if (typeof ResizeObserver === "function") {
        this.ro = new ResizeObserver(() => { this.resizeView(); if (!this.touched && this.stage.clientWidth > 0) this.fit(); });
        this.ro.observe(this.stage);
      } else on(window, "resize", () => this.resizeView());
      this.antTimer = setInterval(() => { if (this.sel && !this.dead) { this.ants = ((this.ants || 0) + 1) % 6; this.scheduleDraw(); } }, 140);
      this.resizeView();
      this.setTool("pencil");
    },
    resizeSoon() { requestAnimationFrame(() => { this.resizeView(); this.center(); this.scheduleDraw(); }); },

    buildTools() {
      this.toolBtns = {};
      TOOLS.forEach((t) => {
        const b = h("button", { type: "button", class: "pxs-tool", title: t.label + " (" + t.key.toUpperCase() + ")", "aria-label": t.label, onclick: () => this.setTool(t.id) }, icon(t.id));
        this.toolBtns[t.id] = b;
        this.toolbar.append(b);
      });
      this.toolbar.append(h("button", { type: "button", class: "pxs-tool pxs-panbtn", title: "Touch pan mode", onclick: (e) => { this.panMode = !this.panMode; e.currentTarget.classList.toggle("on", this.panMode); } }, icon("hand")));
    },
    setTool(id) {
      this.tool = id;
      for (const k in this.toolBtns) this.toolBtns[k].classList.toggle("on", k === id);
      this.optEls && this.optEls.forEach((o) => (o.wrap.hidden = !o.tools.includes(id)));
      this.view.style.cursor = id === "hand" ? "grab" : id === "zoom" ? "zoom-in" : id === "picker" ? "copy" : "crosshair";
      this.scheduleDraw();
    },
    pressToolKey(key) {
      const group = TOOLS.filter((t) => t.key === key);
      if (!group.length) return false;
      const i = group.findIndex((t) => t.id === this.tool);
      this.setTool(group[(i + 1) % group.length].id);
      return true;
    },
    buildOptions() {
      this.optEls = [];
      OPTION_DEFS.forEach((def) => {
        let ctl, val;
        const key = def.key;
        const set = (v) => { this.o[key] = v; this.scheduleDraw(); this.syncSizeLabels && this.syncSizeLabels(); };
        if (def.type === "range") {
          const out = h("output", { text: this.o[key] });
          ctl = h("input", { type: "range", min: def.min, max: def.max, value: this.o[key], oninput: (e) => { out.textContent = e.target.value; set(+e.target.value); } });
          ctl.sync = () => { ctl.value = this.o[key]; out.textContent = this.o[key]; };
          val = [ctl, out];
        } else if (def.type === "check") {
          ctl = h("input", { type: "checkbox", checked: !!this.o[key], onchange: (e) => set(e.target.checked) });
          ctl.sync = () => (ctl.checked = !!this.o[key]);
          val = [ctl];
        } else if (def.type === "select") {
          ctl = h("select", { onchange: (e) => set(e.target.value) }, def.options.map(([v, l]) => h("option", { value: v, text: l })));
          ctl.value = this.o[key];
          ctl.sync = () => (ctl.value = this.o[key]);
          val = [ctl];
        } else {
          const btns = def.options.map(([v, l]) => h("button", { type: "button", class: "pxs-seg", text: l, onclick: () => { set(v); ctl.sync(); } }));
          ctl = h("span", { class: "pxs-segs" }, btns);
          ctl.sync = () => btns.forEach((b, i) => b.classList.toggle("on", def.options[i][0] === this.o[key]));
          ctl.sync();
          val = [ctl];
        }
        const wrap = h("label", { class: "pxs-opt pxs-opt-" + def.type }, h("span", { class: "pxs-optl", text: def.label }), val);
        this.optEls.push({ wrap, tools: def.tools.split(" "), ctl });
        this.optbar.append(wrap);
      });
      this.syncSizeLabels = () => this.optEls.forEach((o) => o.ctl.sync && o.ctl.sync());
    },

    // ---------------------------------------------------------------- menus
    buildMenubar() {
      const labels = ["File", "Edit", "Select", "Sprite", "Layer", "Frame", "View", "Filters", "Export"];
      const all = () => labels.concat((this.opts.menus || []).map((m) => m.label));
      all().forEach((l) => this.addMenuButton(l));
      this.menubar.append(h("span", { class: "pxs-grow" }));
      this.undoBtn = h("button", { type: "button", class: "pxs-mini", title: "Undo (Ctrl+Z)", text: "↶", onclick: () => this.undo() });
      this.redoBtn = h("button", { type: "button", class: "pxs-mini", title: "Redo (Ctrl+Y)", text: "↷", onclick: () => this.redo() });
      this.zoomLbl = h("button", { type: "button", class: "pxs-mini pxs-zoomlbl", title: "Fit to window", onclick: () => this.fit() });
      this.menubar.append(
        this.undoBtn, this.redoBtn,
        h("button", { type: "button", class: "pxs-mini", title: "Zoom out", text: "−", onclick: () => this.stepZoom(-1) }),
        this.zoomLbl,
        h("button", { type: "button", class: "pxs-mini", title: "Zoom in", text: "+", onclick: () => this.stepZoom(1) }));
    },
    addMenuButton(label) {
      const b = h("button", { type: "button", class: "pxs-mb", text: label, onclick: () => (this.menuBtn === b ? this.closeMenu() : this.openMenu(b, label)), onmouseenter: () => { if (this.menuEl && this.menuBtn !== b) this.openMenu(b, label); } });
      this.menubar.insertBefore(b, this.menubar.querySelector(".pxs-grow"));
    },
    closeMenu() {
      if (this.menuEl) this.menuEl.remove();
      if (this.menuBtn) this.menuBtn.classList.remove("open");
      this.menuEl = this.menuBtn = null;
    },
    openMenu(btn, label) {
      this.closeMenu();
      // rebuilt on every open so late-registered filters/exporters show up
      const def = this.menuDefs().concat(this.opts.menus || []).find((m) => m.label === label);
      if (!def) return;
      const dd = h("div", { class: "pxs-menu" });
      def.items.forEach((it) => {
        if (!it || it.sep) return dd.append(h("div", { class: "pxs-sep" }));
        if (it.header) return dd.append(h("div", { class: "pxs-mh", text: it.header }));
        dd.append(h("button", {
          type: "button", class: "pxs-mi" + (it.checked ? " chk" : ""), disabled: !!it.disabled,
          onclick: () => { this.closeMenu(); try { it.onClick && it.onClick(); } catch (e) { console.warn(e); this.flash(String(e.message || e)); } },
        }, h("span", { text: it.label }), it.hint ? h("kbd", { text: it.hint }) : null));
      });
      this.root.append(dd);
      const rb = btn.getBoundingClientRect(), rr = this.root.getBoundingClientRect();
      dd.style.left = Math.max(0, Math.min(rb.left - rr.left, rr.width - dd.offsetWidth - 4)) + "px";
      dd.style.top = rb.bottom - rr.top + "px";
      btn.classList.add("open");
      this.menuEl = dd;
      this.menuBtn = btn;
    },
    menuDefs() {
      const d = this.doc, ro = this.readOnly, hasSel = !!this.sel, L = this.curLayer();
      const li = d.layerIndex(this.cur.l), E = (x) => ({ disabled: ro, ...x });
      const filters = PixelStudio.filters.map((f) => E({ label: f.label + (f.params && f.params.length ? "…" : ""), onClick: () => this.filterDialog(f) }));
      const exporters = PixelStudio.exporters.map((x) => ({ label: x.label, onClick: () => this.exportDialog(x) }));
      return [
        { label: "File", items: [
          E({ label: "New sprite…", hint: "Ctrl+N", onClick: () => this.newDialog() }),
          E({ label: "Open file…", hint: "Ctrl+O", onClick: () => this.openFile(false) }),
          E({ label: "Import image as layer…", onClick: () => this.openFile(true) }),
          { sep: true },
          { label: "Save project (.pxs)", hint: "Ctrl+S", onClick: () => this.saveProject() },
        ] },
        { label: "Edit", items: [
          E({ label: "Undo", hint: "Ctrl+Z", disabled: ro || !this.hist.canUndo, onClick: () => this.undo() }),
          E({ label: "Redo", hint: "Ctrl+Y", disabled: ro || !this.hist.canRedo, onClick: () => this.redo() }),
          { sep: true },
          E({ label: "Cut", hint: "Ctrl+X", onClick: () => this.copySel(true) }),
          { label: "Copy", hint: "Ctrl+C", onClick: () => this.copySel(false) },
          E({ label: "Paste", hint: "Ctrl+V", disabled: ro || !this.clip, onClick: () => this.paste() }),
          E({ label: "Clear", hint: "Del", onClick: () => this.clearSel() }),
          { sep: true },
          E({ label: "Flip horizontal", onClick: () => this.transformSel("flipH") }),
          E({ label: "Flip vertical", onClick: () => this.transformSel("flipV") }),
          E({ label: "Rotate 90° clockwise", onClick: () => this.transformSel("rotCW") }),
          E({ label: "Rotate 90° counter-clockwise", onClick: () => this.transformSel("rotCCW") }),
          E({ label: "Scale…", onClick: () => this.scaleDialog() }),
        ] },
        { label: "Select", items: [
          { label: "All", hint: "Ctrl+A", onClick: () => this.selectAll() },
          { label: "Deselect", hint: "Ctrl+D", disabled: !hasSel, onClick: () => this.setSel(null, "Deselect") },
          { label: "Inverse", hint: "Ctrl+Shift+I", onClick: () => this.setSel(core.invertMask(this.sel, d.w, d.h), "Invert selection") },
        ] },
        { label: "Sprite", items: [
          E({ label: "Canvas size…", onClick: () => this.canvasDialog() }),
          E({ label: "Crop to selection", disabled: ro || !hasSel, onClick: () => this.cropToSel() }),
          E({ label: "Scale sprite…", onClick: () => this.spriteScaleDialog() }),
          { sep: true },
          E({ label: "Flip sprite horizontal", onClick: () => this.spriteOp({ k: "flip", axis: "h" }, "Flip sprite") }),
          E({ label: "Flip sprite vertical", onClick: () => this.spriteOp({ k: "flip", axis: "v" }, "Flip sprite") }),
          E({ label: "Rotate sprite 90° CW", onClick: () => this.spriteOp({ k: "rot", d: 90 }, "Rotate sprite") }),
          E({ label: "Rotate sprite 90° CCW", onClick: () => this.spriteOp({ k: "rot", d: -90 }, "Rotate sprite") }),
          E({ label: "Rotate sprite 180°", onClick: () => this.spriteOp({ k: "rot", d: 180 }, "Rotate sprite") }),
        ] },
        { label: "Layer", items: [
          E({ label: "New layer", hint: "Shift+N", onClick: () => this.addLayer() }),
          E({ label: "Duplicate layer", onClick: () => this.dupLayer() }),
          E({ label: "Delete layer", disabled: ro || d.layers.length < 2, onClick: () => this.delLayer() }),
          E({ label: "Merge down", disabled: ro || li < 1, onClick: () => this.mergeDown() }),
          { sep: true },
          E({ label: "Move up", disabled: ro || li >= d.layers.length - 1, onClick: () => this.moveLayer(1) }),
          E({ label: "Move down", disabled: ro || li < 1, onClick: () => this.moveLayer(-1) }),
          E({ label: "Properties…", onClick: () => this.layerDialog() }),
        ] },
        { label: "Frame", items: [
          E({ label: "New frame", hint: "Alt+N", onClick: () => this.addFrame(false) }),
          E({ label: "Duplicate frame", onClick: () => this.addFrame(true) }),
          E({ label: "Delete frame", disabled: ro || d.frames.length < 2, onClick: () => this.delFrame() }),
          E({ label: "Move frame left", disabled: ro || this.cur.f < 1, onClick: () => this.moveFrame(-1) }),
          E({ label: "Move frame right", disabled: ro || this.cur.f >= d.frames.length - 1, onClick: () => this.moveFrame(1) }),
          { sep: true },
          E({ label: "Frame duration…", onClick: () => this.durationDialog() }),
          E({ label: "Tags…", onClick: () => this.tagsDialog() }),
          { sep: true },
          { label: this.playing ? "Pause" : "Play", hint: "Enter", onClick: () => this.play() },
        ] },
        { label: "View", items: [
          { label: "Zoom in", hint: "+", onClick: () => this.stepZoom(1) },
          { label: "Zoom out", hint: "-", onClick: () => this.stepZoom(-1) },
          { label: "Fit to window", hint: "F", onClick: () => this.fit() },
          { label: "Actual size (1x)", onClick: () => { this.zoomTo(1); this.center(); } },
          { sep: true },
          { label: "Pixel grid", hint: "Ctrl+'", checked: this.o.grid && this.o.gridSize === 1, onClick: () => this.setGrid(this.o.grid && this.o.gridSize === 1 ? 0 : 1) },
          { label: "Tile grid 8", checked: this.o.grid && this.o.gridSize === 8, onClick: () => this.setGrid(this.o.grid && this.o.gridSize === 8 ? 0 : 8) },
          { label: "Tile grid 16", checked: this.o.grid && this.o.gridSize === 16, onClick: () => this.setGrid(this.o.grid && this.o.gridSize === 16 ? 0 : 16) },
          { label: "Tiled mode", checked: this.o.tiled, onClick: () => { this.o.tiled = !this.o.tiled; this.syncSizeLabels(); this.scheduleDraw(); } },
          { label: "Onion skin", hint: "O", checked: this.o.onion, onClick: () => { this.o.onion = !this.o.onion; this.refresh(); this.scheduleDraw(); } },
          { label: "Mirror X", checked: this.o.symX, onClick: () => { this.o.symX = !this.o.symX; this.syncSizeLabels(); this.scheduleDraw(); } },
          { label: "Mirror Y", checked: this.o.symY, onClick: () => { this.o.symY = !this.o.symY; this.syncSizeLabels(); this.scheduleDraw(); } },
        ] },
        { label: "Filters", items: filters.length ? filters : [{ label: "No filters loaded", disabled: true }] },
        { label: "Export", items: [
          { label: "PNG image (this frame)", onClick: () => this.exportDialog(BUILTIN_EXPORTS[0]) },
          { label: "PNG sprite sheet (all frames)", onClick: () => this.exportDialog(BUILTIN_EXPORTS[1]) },
          ...(exporters.length ? [{ sep: true }, ...exporters] : []),
        ] },
      ];
    },
    setGrid(size) {
      this.o.grid = !!size;
      if (size) this.o.gridSize = size;
      this.scheduleDraw();
    },

    // ---------------------------------------------------------------- side panels
    buildSide() {
      this.fgSw = h("input", { type: "color", class: "pxs-sw pxs-fg", title: "Foreground colour", oninput: (e) => this.setFg(this.withAlpha(core.hexToPacked(e.target.value), this.fg & 255)) });
      this.bgSw = h("input", { type: "color", class: "pxs-sw pxs-bg", title: "Background colour", oninput: (e) => this.setBg(this.withAlpha(core.hexToPacked(e.target.value), this.bg & 255)) });
      this.hexIn = h("input", { type: "text", class: "pxs-hex", spellcheck: false, maxLength: 9, title: "Hex colour (#rrggbb or #rrggbbaa)", onchange: (e) => this.setFg(core.hexToPacked(e.target.value)) });
      this.alphaIn = h("input", { type: "range", min: 0, max: 255, class: "pxs-alpha", title: "Alpha", oninput: (e) => this.setFg(this.withAlpha(this.fg, +e.target.value)) });
      this.palEl = h("div", { class: "pxs-pal" });
      this.presetSel = h("select", { class: "pxs-preset", title: "Palette presets", onmousedown: () => this.fillPresets(), onfocus: () => this.fillPresets(), onchange: (e) => { this.applyPreset(e.target.value); e.target.value = ""; } }, h("option", { value: "", text: "Presets…" }));
      const colors = h("section", { class: "pxs-sec pxs-sec-colors" },
        h("div", { class: "pxs-h", text: "Colors" }),
        h("div", { class: "pxs-cols" },
          h("div", { class: "pxs-swatches" }, this.bgSw, this.fgSw, h("button", { type: "button", class: "pxs-swap", title: "Swap (X)", text: "⇄", onclick: () => this.swapColors() })),
          h("div", { class: "pxs-colin" }, this.hexIn, this.alphaIn)),
        this.palEl,
        h("div", { class: "pxs-row" },
          h("button", { type: "button", class: "pxs-mini", title: "Add foreground to palette", text: "+", onclick: () => this.palAdd() }),
          h("button", { type: "button", class: "pxs-mini", title: "Remove selected colour", text: "−", onclick: () => this.palRemove() }),
          h("button", { type: "button", class: "pxs-mini", title: "Sort palette", text: "Sort", onclick: () => this.palSort() }),
          h("button", { type: "button", class: "pxs-mini", title: "Palette from sprite colours", text: "From art", onclick: () => this.palExtract() }),
          this.presetSel));
      this.layersEl = h("div", { class: "pxs-layers" });
      this.blendSel = h("select", { title: "Blend mode", onchange: (e) => this.commit("Blend mode", [{ k: "layer-set", id: this.cur.l, props: { blend: e.target.value } }]) }, core.BLEND_MODES.map((m) => h("option", { value: m, text: m })));
      this.opacityIn = h("input", { type: "range", min: 0, max: 255, title: "Layer opacity",
        oninput: (e) => { const L = this.curLayer(); if (!L || this.readOnly) return; if (!this.propPre) this.propPre = this.doc.snapshot(); L.opacity = +e.target.value; this.changed(); },
        onchange: (e) => { if (this.propPre) { this.pushStruct("Opacity", this.propPre, [{ k: "layer-set", id: this.cur.l, props: { opacity: +e.target.value } }]); this.propPre = null; } } });
      const btn = (t, title, fn) => h("button", { type: "button", class: "pxs-mini", title, text: t, onclick: fn });
      const layers = h("section", { class: "pxs-sec pxs-sec-layers" },
        h("div", { class: "pxs-h" }, "Layers",
          h("span", { class: "pxs-hbtns" },
            btn("+", "New layer", () => this.addLayer()), btn("⧉", "Duplicate", () => this.dupLayer()), btn("−", "Delete", () => this.delLayer()),
            btn("↑", "Move up", () => this.moveLayer(1)), btn("↓", "Move down", () => this.moveLayer(-1)), btn("⤓", "Merge down", () => this.mergeDown()))),
        this.layersEl,
        h("div", { class: "pxs-lprops" }, this.blendSel, this.opacityIn));
      this.side.append(colors, layers);
      this.setFg(this.fg);
      this.setBg(this.bg);
    },
    withAlpha(v, a) { return ((v & 0xffffff00) | a) >>> 0; },
    setFg(v) { this.fg = v >>> 0; this.syncColors(); },
    setBg(v) { this.bg = v >>> 0; this.syncColors(); },
    swapColors() { const f = this.fg; this.fg = this.bg; this.bg = f; this.syncColors(); },
    syncColors() {
      const hex6 = (v) => core.packedToHex(v | 255).slice(0, 7);
      this.fgSw.value = hex6(this.fg);
      this.bgSw.value = hex6(this.bg);
      this.hexIn.value = core.packedToHex(this.fg);
      this.alphaIn.value = this.fg & 255;
      this.fgSw.style.opacity = 0.35 + 0.65 * ((this.fg & 255) / 255);
      this.renderPalette();
    },
    renderPalette() {
      if (!this.palEl) return;
      const pal = this.doc.palette, fg = core.packedToHex(this.fg).toLowerCase();
      this.palEl.textContent = "";
      pal.forEach((hex, i) => {
        const b = h("button", { type: "button", class: "pxs-pc" + (hex.toLowerCase() === fg ? " on" : ""), title: hex, style: "background:" + hex,
          onclick: (e) => { this.palSel = i; e.shiftKey ? this.setBg(core.hexToPacked(hex)) : this.setFg(core.hexToPacked(hex)); },
          oncontextmenu: (e) => { e.preventDefault(); this.setBg(core.hexToPacked(hex)); } });
        this.palEl.append(b);
      });
    },
    fillPresets() {
      const sel = this.presetSel, keep = sel.value;
      while (sel.options.length > 1) sel.remove(1);
      PixelStudio.palettes.forEach((p) => sel.append(h("option", { value: p.id, text: p.name + " (" + p.colors.length + ")" })));
      sel.value = keep;
    },
    applyPreset(id) {
      const p = PixelStudio.palettes.find((x) => x.id === id);
      if (p && !this.readOnly) this.commit("Palette", [{ k: "palette", palette: p.colors.slice() }]);
    },
    palAdd() {
      const hex = core.packedToHex(this.fg);
      if (this.doc.palette.includes(hex)) return;
      this.commit("Add colour", [{ k: "palette", palette: this.doc.palette.concat(hex) }]);
    },
    palRemove() {
      const pal = this.doc.palette, i = this.palSel != null && pal[this.palSel] ? this.palSel : pal.indexOf(core.packedToHex(this.fg));
      if (i < 0 || pal.length < 2) return;
      this.palSel = null;
      this.commit("Remove colour", [{ k: "palette", palette: pal.filter((_, j) => j !== i) }]);
    },
    palSort() {
      const key = (hex) => {
        const [r, g, b] = core.unpack(core.hexToPacked(hex)).map((v) => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), dl = mx - mn;
        let hue = dl === 0 ? 0 : mx === r ? ((g - b) / dl + 6) % 6 : mx === g ? (b - r) / dl + 2 : (r - g) / dl + 4;
        return [dl < 0.08 ? -1 : Math.floor(hue), mx];
      };
      const sorted = this.doc.palette.slice().sort((a, b) => { const A = key(a), B = key(b); return A[0] - B[0] || A[1] - B[1]; });
      this.commit("Sort palette", [{ k: "palette", palette: sorted }]);
    },
    palExtract() {
      const seen = new Set(), d = this.doc;
      for (const c of d.cels.values())
        for (let i = 0; i < c.length && seen.size < 256; i += 4) if (c[i + 3] === 255) seen.add(core.packedToHex(gp(c, i / 4)));
      if (seen.size) this.commit("Palette from sprite", [{ k: "palette", palette: [...seen] }]);
    },

    renderLayers() {
      const d = this.doc, box = this.layersEl;
      box.textContent = "";
      [...d.layers].reverse().forEach((L) => {
        const row = h("div", { class: "pxs-layer" + (L.id === this.cur.l ? " sel" : "") + (L.visible ? "" : " off"), onclick: () => this.setCur(L.id, this.cur.f) },
          h("button", { type: "button", class: "pxs-lbtn" + (L.visible ? " on" : ""), title: "Visible", onclick: (e) => { e.stopPropagation(); this.commit("Visibility", [{ k: "layer-set", id: L.id, props: { visible: !L.visible } }]); } }, icon("eye")),
          h("button", { type: "button", class: "pxs-lbtn" + (L.locked ? " on" : ""), title: "Locked", onclick: (e) => { e.stopPropagation(); this.commit("Lock", [{ k: "layer-set", id: L.id, props: { locked: !L.locked } }]); } }, icon("lock")),
          h("span", { class: "pxs-lname", text: L.name, ondblclick: () => this.layerDialog(L.id) }));
        box.append(row);
      });
      const L = this.curLayer();
      if (L) { this.blendSel.value = L.blend; this.opacityIn.value = L.opacity; }
    },
    setCur(l, f) {
      this.cur.l = l;
      this.cur.f = clamp(f, 0, this.doc.frames.length - 1);
      this.uiDirty = true;
      this.refresh();
      this.scheduleDraw();
    },
    setFrame(f) {
      if (this.playing) {
        // light path while animating: just move the highlight
        this.cur.f = f;
        this.tl.querySelectorAll(".cur").forEach((n) => n.classList.remove("cur"));
        this.tl.querySelectorAll('[data-f="' + f + '"]').forEach((n) => n.classList.add("cur"));
        this.syncStatus();
        this.scheduleDraw();
      } else this.setCur(this.cur.l, f);
    },

    renderTimeline() {
      const d = this.doc, tl = this.tl;
      tl.textContent = "";
      const btn = (t, title, fn, cls) => h("button", { type: "button", class: "pxs-mini " + (cls || ""), title, text: t, onclick: fn });
      this.playBtn = btn(this.playing ? "❚❚" : "▶", "Play / pause (Enter)", () => this.play());
      const loop = h("select", { title: "Playback mode", onchange: (e) => (this.o.loop = e.target.value) },
        [["loop", "Loop"], ["pingpong", "Ping-pong"], ["once", "Once"]].map(([v, l]) => h("option", { value: v, text: l, selected: this.o.loop === v })));
      const tagSel = h("select", { title: "Play a tag", onchange: (e) => { this.tagSel = +e.target.value; this.uiDirty = true; this.refresh(); } },
        h("option", { value: -1, text: "All frames" }), d.tags.map((t, i) => h("option", { value: i, text: t.name, selected: this.tagSel === i })));
      const bar = h("div", { class: "pxs-tlbar" },
        btn("⏮", "First frame", () => this.setFrame(0)), btn("◀", "Previous frame (,)", () => this.stepFrame(-1)), this.playBtn,
        btn("▶ ", "Next frame (.)", () => this.stepFrame(1)), btn("⏭", "Last frame", () => this.setFrame(d.frames.length - 1)),
        loop, tagSel,
        btn("Onion", "Onion skin (O)", () => { this.o.onion = !this.o.onion; this.refresh(); this.scheduleDraw(); }, this.o.onion ? "on" : ""),
        h("span", { class: "pxs-grow" }),
        btn("+ Frame", "New frame (Alt+N)", () => this.addFrame(false)), btn("Dup", "Duplicate frame", () => this.addFrame(true)), btn("− Frame", "Delete frame", () => this.delFrame()),
        btn("Tags", "Edit tags", () => this.tagsDialog()));
      const grid = h("div", { class: "pxs-grid", style: "grid-template-columns:70px repeat(" + d.frames.length + ",minmax(34px,1fr))" });
      // tag strip
      if (d.tags.length) {
        grid.append(h("div", { class: "pxs-gl" }));
        const spans = h("div", { class: "pxs-tags", style: "grid-column:2 / span " + d.frames.length + ";grid-template-columns:repeat(" + d.frames.length + ",minmax(34px,1fr))" });
        d.tags.forEach((t, i) => spans.append(h("button", { type: "button", class: "pxs-tag" + (this.tagSel === i ? " on" : ""), style: "grid-column:" + (t.from + 1) + " / " + (t.to + 2) + ";background:" + t.color, title: t.name + " (" + t.dir + ")", text: t.name, onclick: () => { this.tagSel = this.tagSel === i ? -1 : i; this.uiDirty = true; this.refresh(); }, ondblclick: () => this.tagsDialog() })));
        grid.append(spans);
      }
      grid.append(h("div", { class: "pxs-gl", text: "Frame" }));
      d.frames.forEach((f, fi) => grid.append(h("button", { type: "button", class: "pxs-fh" + (fi === this.cur.f ? " cur" : ""), "data-f": fi, title: f.ms + " ms (double-click to edit)", onclick: () => this.setFrame(fi), ondblclick: () => this.durationDialog(fi) }, h("b", { text: fi + 1 }), h("small", { text: f.ms }))));
      [...d.layers].reverse().forEach((L) => {
        grid.append(h("div", { class: "pxs-gl" + (L.id === this.cur.l ? " sel" : ""), text: L.name, title: L.name }));
        d.frames.forEach((f, fi) => {
          const c = d.cel(L.id, fi, false);
          grid.append(h("button", { type: "button", "data-f": fi, class: "pxs-cel" + (c && !core.isEmpty(c) ? " has" : "") + (L.id === this.cur.l && fi === this.cur.f ? " cur" : "") + (fi === this.cur.f ? " col" : ""), onclick: () => this.setCur(L.id, fi) }));
        });
      });
      tl.append(bar, h("div", { class: "pxs-gridwrap" }, grid));
    },
    refresh() {
      this.uiDirty = false;
      this.renderLayers();
      this.renderTimeline();
      this.renderPalette();
      this.syncStatus();
      if (this.undoBtn) {
        this.undoBtn.disabled = this.readOnly || !this.hist.canUndo;
        this.redoBtn.disabled = this.readOnly || !this.hist.canRedo;
      }
    },
    syncStatus(p) {
      if (!this.statusPos) return;
      const d = this.doc, q = p || this.hover;
      const L = this.curLayer();
      this.statusPos.textContent = (q && q.x >= 0 && q.y >= 0 && q.x < d.w && q.y < d.h ? q.x + "," + q.y + "  " : "") + d.w + "×" + d.h + "  F" + (this.cur.f + 1) + "/" + d.frames.length + "  " + (L ? L.name : "") + (this.sel ? "  sel " + core.maskCount(this.sel) : "");
      this.zoomLbl.textContent = Math.round(this.zoom * 100) + "%";
    },

    // ---------------------------------------------------------------- dialogs
    modal(title, body, buttons, onClose) {
      this.closeModal(true);
      const close = (cancel) => { if (this.modalEl) { this.modalEl.remove(); this.modalEl = null; } if (cancel && onClose) onClose(); };
      const box = h("div", { class: "pxs-dialog", role: "dialog" }, h("div", { class: "pxs-dtitle", text: title }), body,
        h("div", { class: "pxs-dbtns" }, (buttons || [{ label: "Close" }]).map((b) => h("button", { type: "button", class: "pxs-btn" + (b.primary ? " primary" : ""), text: b.label, onclick: () => { if (!b.onClick || b.onClick() !== false) close(!b.primary && !b.onClick ? true : false); } }))));
      const ov = h("div", { class: "pxs-modal", onpointerdown: (e) => { if (e.target === ov) close(true); } }, box);
      this.modalEl = ov;
      this.closeModal = (silent) => { if (this.modalEl) close(!silent); };
      this.root.append(ov);
      const first = box.querySelector("input,select");
      first && first.focus();
      return { close, box };
    },
    closeModal() {},
    // small form helper: fields -> values object on OK
    form(title, fields, onOk, okLabel) {
      const els = {};
      const body = h("div", { class: "pxs-form" }, fields.map((f) => {
        let el;
        if (f.type === "select") el = h("select", {}, f.options.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return h("option", { value: v, text: l, selected: String(v) === String(f.value) }); }));
        else if (f.type === "check") el = h("input", { type: "checkbox", checked: !!f.value });
        else el = h("input", { type: f.type || "text", value: f.value, min: f.min, max: f.max, step: f.step });
        els[f.id] = el;
        return h("label", { class: "pxs-frow" }, h("span", { text: f.label }), el);
      }));
      const read = () => { const out = {}; fields.forEach((f) => { const e = els[f.id]; out[f.id] = f.type === "check" ? e.checked : f.type === "number" || f.type === "range" ? +e.value : e.value; }); return out; };
      this.modal(title, body, [{ label: "Cancel" }, { label: okLabel || "OK", primary: true, onClick: () => { try { onOk(read()); } catch (e) { this.flash(String(e.message || e)); } } }]);
      body.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); body.parentNode.querySelector(".primary").click(); } });
      return els;
    },
    newDialog() {
      this.form("New sprite", [
        { id: "w", label: "Width", type: "number", value: 32, min: 1, max: 1024 },
        { id: "h", label: "Height", type: "number", value: 32, min: 1, max: 1024 },
      ], (v) => this.loadDoc(new Doc(v.w, v.h)), "Create");
    },
    loadDoc(doc) {
      this.load(doc.serialize());
      this.emit({ k: "doc", s: this.doc.serialize() });
      this.opts.onChange && this.opts.onChange();
    },
    canvasDialog() {
      const d = this.doc;
      this.form("Canvas size", [
        { id: "w", label: "Width", type: "number", value: d.w, min: 1, max: 1024 },
        { id: "h", label: "Height", type: "number", value: d.h, min: 1, max: 1024 },
        { id: "ax", label: "Anchor X", type: "select", value: "c", options: [["l", "Left"], ["c", "Centre"], ["r", "Right"]] },
        { id: "ay", label: "Anchor Y", type: "select", value: "c", options: [["t", "Top"], ["c", "Centre"], ["b", "Bottom"]] },
      ], (v) => {
        const nw = clamp(v.w | 0, 1, 1024), nh = clamp(v.h | 0, 1, 1024);
        const ox = v.ax === "l" ? 0 : v.ax === "r" ? nw - d.w : Math.floor((nw - d.w) / 2);
        const oy = v.ay === "t" ? 0 : v.ay === "b" ? nh - d.h : Math.floor((nh - d.h) / 2);
        this.spriteOp({ k: "canvas", w: nw, h: nh, ox, oy }, "Canvas size");
      });
    },
    spriteScaleDialog() {
      const d = this.doc;
      this.form("Scale sprite", [
        { id: "w", label: "Width", type: "number", value: d.w * 2, min: 1, max: 1024 },
        { id: "h", label: "Height", type: "number", value: d.h * 2, min: 1, max: 1024 },
      ], (v) => this.spriteOp({ k: "scale", w: v.w, h: v.h }, "Scale sprite"));
    },
    spriteOp(op, label) {
      if (this.readOnly) return;
      this.sel = null;
      this.commit(label, [op]);
      this.center();
    },
    cropToSel() {
      const b = this.sel && core.maskBounds(this.sel, this.doc.w, this.doc.h);
      if (b) this.spriteOp({ k: "canvas", w: b.w, h: b.h, ox: -b.x, oy: -b.y }, "Crop");
    },
    scaleDialog() {
      this.form("Scale selection / cel", [
        { id: "sx", label: "Width %", type: "number", value: 200, min: 10, max: 800 },
        { id: "sy", label: "Height %", type: "number", value: 200, min: 10, max: 800 },
      ], (v) => {
        if (!this.canPaint()) return;
        const t = this.beginTx(), d = this.doc, selB = this.sel;
        const res = core.scaleRegion(new Uint8ClampedArray(t.tx.cel), d.w, d.h, this.sel, v.sx / 100, v.sy / 100);
        this.writeCel(t, res.data);
        if (this.sel) this.setSelRaw(res.mask);
        this.endTx("Scale", t, selB);
      });
    },
    layerDialog(id) {
      const L = this.doc.getLayer(id || this.cur.l);
      if (!L || this.readOnly) return;
      this.form("Layer properties", [
        { id: "name", label: "Name", value: L.name },
        { id: "blend", label: "Blend", type: "select", value: L.blend, options: core.BLEND_MODES },
        { id: "opacity", label: "Opacity (0-255)", type: "number", value: L.opacity, min: 0, max: 255 },
      ], (v) => this.commit("Layer properties", [{ k: "layer-set", id: L.id, props: { name: v.name.slice(0, 40) || L.name, blend: v.blend, opacity: v.opacity } }]));
    },
    durationDialog(fi) {
      if (this.readOnly) return;
      fi = fi == null ? this.cur.f : fi;
      const f = this.doc.frames[fi];
      this.form("Frame " + (fi + 1) + " duration", [
        { id: "ms", label: "Milliseconds", type: "number", value: f.ms, min: 10, max: 60000 },
        { id: "all", label: "Apply to all frames", type: "check", value: false },
      ], (v) => this.commit("Frame duration", (v.all ? this.doc.frames : [f]).map((x) => ({ k: "frame-set", fid: x.id, ms: v.ms }))));
    },
    tagsDialog() {
      if (this.readOnly) return;
      const d = this.doc;
      const tags = d.tags.map((t) => ({ ...t }));
      const list = h("div", { class: "pxs-taglist" });
      const draw = () => {
        list.textContent = "";
        tags.forEach((t, i) => list.append(h("div", { class: "pxs-tagrow" },
          h("input", { value: t.name, size: 8, oninput: (e) => (t.name = e.target.value) }),
          h("input", { type: "number", min: 1, max: d.frames.length, value: t.from + 1, title: "From", oninput: (e) => (t.from = clamp(+e.target.value - 1, 0, d.frames.length - 1)) }),
          h("input", { type: "number", min: 1, max: d.frames.length, value: t.to + 1, title: "To", oninput: (e) => (t.to = clamp(+e.target.value - 1, 0, d.frames.length - 1)) }),
          h("select", { onchange: (e) => (t.dir = e.target.value) }, ["forward", "reverse", "pingpong"].map((v) => h("option", { value: v, text: v, selected: t.dir === v }))),
          h("input", { type: "color", value: t.color || "#ffcc00", oninput: (e) => (t.color = e.target.value) }),
          h("button", { type: "button", class: "pxs-mini", text: "✕", onclick: () => { tags.splice(i, 1); draw(); } }))));
      };
      draw();
      const add = h("button", { type: "button", class: "pxs-btn", text: "Add tag", onclick: () => { tags.push({ name: "tag " + (tags.length + 1), from: this.cur.f, to: this.cur.f, dir: "forward", color: "#ffcc00" }); draw(); } });
      this.modal("Tags", h("div", {}, list, add), [{ label: "Cancel" }, { label: "OK", primary: true, onClick: () => { this.commit("Tags", [{ k: "tags", tags: tags.map((t) => ({ ...t, to: Math.max(t.from, t.to) })) }]); } }]);
    },

    // live-preview dialog for registry filters
    filterDialog(f) {
      if (!this.canPaint()) return;
      const t = this.beginTx();
      if (!t) return;
      const d = this.doc, orig = new Uint8ClampedArray(t.tx.cel), selB = this.sel;
      const params = {}, body = h("div", { class: "pxs-form" }), err = h("div", { class: "pxs-err" });
      let timer = null, ok = true;
      const run = () => {
        t.tx.rollback();
        const input = core.makeImageData(new Uint8ClampedArray(orig), d.w, d.h);
        let out;
        try { out = f.apply(input, { ...params }); } catch (e) { out = null; err.textContent = "Filter failed: " + (e.message || e); ok = false; }
        if (out && (out.width !== d.w || out.height !== d.h)) { out = null; err.textContent = "Filter returned a different size"; ok = false; }
        if (out) {
          err.textContent = "";
          ok = true;
          for (let i = 0; i < d.w * d.h; i++) {
            if (this.sel && !this.sel[i]) continue;
            const v = gp(out.data, i);
            if (v !== gp(orig, i)) t.tx.set(i, v);
          }
        }
        this.changed();
      };
      const later = () => { clearTimeout(timer); timer = setTimeout(run, 50); };
      (f.params || []).forEach((p) => {
        params[p.id] = p.def != null ? p.def : p.type === "bool" ? false : p.type === "color" ? "#000000" : p.type === "select" ? (p.options && (Array.isArray(p.options[0]) ? p.options[0][0] : p.options[0])) : p.min || 0;
        let el, out;
        if (p.type === "range") {
          out = h("output", { text: params[p.id] });
          el = h("input", { type: "range", min: p.min, max: p.max, step: p.step || 1, value: params[p.id], oninput: (e) => { params[p.id] = +e.target.value; out.textContent = e.target.value; later(); } });
        } else if (p.type === "color") el = h("input", { type: "color", value: params[p.id], oninput: (e) => { params[p.id] = e.target.value; later(); } });
        else if (p.type === "bool") el = h("input", { type: "checkbox", checked: !!params[p.id], onchange: (e) => { params[p.id] = e.target.checked; later(); } });
        else el = h("select", { onchange: (e) => { params[p.id] = e.target.value; later(); } }, (p.options || []).map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return h("option", { value: v, text: l, selected: String(v) === String(params[p.id]) }); }));
        body.append(h("label", { class: "pxs-frow" }, h("span", { text: p.label || p.id }), el, out));
      });
      body.append(err);
      run();
      const cancel = () => { clearTimeout(timer); t.tx.rollback(); this.changed(); };
      this.modal(f.label, body, [
        { label: "Cancel", onClick: () => { cancel(); } },
        { label: "Apply", primary: true, onClick: () => { clearTimeout(timer); run(); if (!ok) return false; this.endTx("Filter: " + f.label, t, selB); } },
      ], cancel);
    },

    exportDialog(exp) {
      const done = (blob) => this.saveBlob(blob, (this.opts.name || "sprite") + "." + (exp.ext || "bin"));
      this.form("Export: " + exp.label, [
        { id: "scale", label: "Scale", type: "select", value: 1, options: [1, 2, 3, 4, 8, 16] },
        { id: "tag", label: "Frames", type: "select", value: "all", options: [["all", "All frames"], ["cur", "Current frame"]].concat(this.doc.tags.map((t, i) => ["tag" + i, "Tag: " + t.name])) },
      ], (v) => {
        const d = this.doc, o = { scale: +v.scale, frame: this.cur.f };
        if (v.tag === "cur") o.frames = [this.cur.f];
        else if (v.tag.startsWith("tag")) { const t = d.tags[+v.tag.slice(3)]; o.tag = t; o.frames = Array.from({ length: t.to - t.from + 1 }, (_, i) => t.from + i); }
        else o.frames = d.frames.map((_, i) => i);
        Promise.resolve(exp.export(d, o)).then(done, (e) => this.flash("Export failed: " + (e.message || e)));
      }, "Export");
    },
    saveBlob(blob, name) {
      const a = h("a", { href: URL.createObjectURL(blob), download: name });
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    },
    cropPx(px, sw, w, h) { const o = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) o.set(px.subarray(y * sw * 4, y * sw * 4 + w * 4), y * w * 4); return o; },
    saveProject() { this.saveBlob(new Blob([this.serialize()], { type: "application/json" }), (this.opts.name || "sprite") + ".pxs"); },
    openFile(asLayer) {
      const inp = h("input", { type: "file", accept: asLayer ? "image/*" : ".pxs,.json,image/*", style: "display:none" });
      inp.onchange = async () => {
        const file = inp.files[0];
        inp.remove();
        if (!file) return;
        try {
          if (/\.(pxs|json)$/i.test(file.name)) return void this.loadDoc(Doc.parse(await file.text()));
          const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
          const cv = document.createElement("canvas");
          cv.width = img.naturalWidth; cv.height = img.naturalHeight;
          const c = cv.getContext("2d");
          c.drawImage(img, 0, 0);
          const px = c.getImageData(0, 0, cv.width, cv.height).data;
          if (asLayer) {
            const d = this.doc, out = new Uint8ClampedArray(d.w * d.h * 4);
            for (let y = 0; y < Math.min(d.h, cv.height); y++) for (let x = 0; x < Math.min(d.w, cv.width); x++) sp(out, y * d.w + x, gp(px, y * cv.width + x));
            const id = uid();
            this.commit("Import image", [{ k: "layer-add", layer: { id, name: file.name.slice(0, 30) }, at: d.layers.length, cels: { [this.cur.f]: core.rleEncode(out) } }]);
            this.setCur(id, this.cur.f);
          } else {
            const nd = new Doc(Math.min(1024, cv.width), Math.min(1024, cv.height));
            nd.apply({ k: "cel-set", l: 1, f: 0, rle: core.rleEncode(nd.w === cv.width ? new Uint8ClampedArray(px) : this.cropPx(px, cv.width, nd.w, nd.h)) });
            this.loadDoc(nd);
          }
        } catch (e) { this.flash("Could not open file"); console.warn(e); }
      };
      document.body.appendChild(inp);
      inp.click();
    },
  });

  // built-in exporters so the editor works without fx.js (not in the registry: fx may add richer ones)
  const BUILTIN_EXPORTS = [
    { id: "png", label: "PNG image", ext: "png", mime: "image/png", export: (doc, o) => canvasBlob(sheetCanvas(doc, [o.frames ? o.frames[0] : o.frame || 0], o.scale || 1)) },
    { id: "sheet", label: "PNG sprite sheet", ext: "png", mime: "image/png", export: (doc, o) => canvasBlob(sheetCanvas(doc, o.frames && o.frames.length ? o.frames : doc.frames.map((_, i) => i), o.scale || 1)) },
  ];
  function sheetCanvas(doc, frames, scale) {
    const cv = document.createElement("canvas"), src = document.createElement("canvas");
    cv.width = doc.w * scale * frames.length; cv.height = doc.h * scale;
    src.width = doc.w; src.height = doc.h;
    const c = cv.getContext("2d");
    c.imageSmoothingEnabled = false;
    frames.forEach((f, i) => { src.getContext("2d").putImageData(doc.flatten(f), 0, 0); c.drawImage(src, i * doc.w * scale, 0, doc.w * scale, doc.h * scale); });
    return cv;
  }
  const canvasBlob = (cv) => new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("toBlob failed"))), "image/png"));

  // ================================================================ commands + keyboard
  Object.assign(Editor.prototype, {
    undo() {
      if (this.readOnly || this.drag) return;
      this.hist.undo();
      this.uiDirty = true;
      this.refresh();
    },
    redo() {
      if (this.readOnly || this.drag) return;
      this.hist.redo();
      this.uiDirty = true;
      this.refresh();
    },
    // write a whole data array into the tx'd cel (only differing pixels get recorded)
    writeCel(t, data) {
      const n = this.doc.w * this.doc.h;
      for (let i = 0; i < n; i++) {
        const v = gp(data, i);
        if (v !== t.tx.get(i)) t.tx.set(i, v);
      }
    },
    addLayer() {
      const d = this.doc, id = uid();
      this.commit("New layer", [{ k: "layer-add", layer: { id, name: "Layer " + (d.layers.length + 1) }, at: d.layerIndex(this.cur.l) + 1 }]);
      this.setCur(id, this.cur.f);
    },
    dupLayer() {
      const d = this.doc, L = this.curLayer(), id = uid(), cels = {};
      if (!L) return;
      d.frames.forEach((f, fi) => { const c = d.cel(L.id, fi, false); if (c && !core.isEmpty(c)) cels[fi] = core.rleEncode(c); });
      this.commit("Duplicate layer", [{ k: "layer-add", layer: { ...L, id, name: L.name + " copy" }, at: d.layerIndex(L.id) + 1, cels }]);
      this.setCur(id, this.cur.f);
    },
    delLayer() {
      if (this.doc.layers.length < 2) return;
      const i = this.doc.layerIndex(this.cur.l);
      this.commit("Delete layer", [{ k: "layer-del", id: this.cur.l }]);
      this.setCur(this.doc.layers[Math.max(0, i - 1)].id, this.cur.f);
    },
    mergeDown() {
      const d = this.doc, i = d.layerIndex(this.cur.l);
      if (i < 1) return;
      const L = d.layers[i], B = d.layers[i - 1], ops = [];
      d.frames.forEach((f, fi) => {
        const src = d.cel(L.id, fi, false);
        if (!src) return;
        const base = new Uint8ClampedArray(d.cel(B.id, fi, false) || d.w * d.h * 4);
        core.compositeCel(base, src, L.opacity, L.blend);
        ops.push({ k: "cel-set", l: B.id, f: fi, rle: core.rleEncode(base) });
      });
      ops.push({ k: "layer-del", id: L.id });
      this.commit("Merge down", ops);
      this.setCur(B.id, this.cur.f);
    },
    moveLayer(dir) {
      const d = this.doc, i = d.layerIndex(this.cur.l), to = i + dir;
      if (to < 0 || to >= d.layers.length) return;
      this.commit("Move layer", [{ k: "layer-move", id: this.cur.l, to }]);
    },
    addFrame(copy) {
      const d = this.doc, fid = uid(), cels = {}, at = this.cur.f + 1;
      if (copy) d.layers.forEach((L) => { const c = d.cel(L.id, this.cur.f, false); if (c && !core.isEmpty(c)) cels[L.id] = core.rleEncode(c); });
      this.commit(copy ? "Duplicate frame" : "New frame", [{ k: "frame-add", fid, at, ms: d.frames[this.cur.f].ms, cels }]);
      this.setCur(this.cur.l, at);
    },
    delFrame() {
      const d = this.doc;
      if (d.frames.length < 2) return;
      const f = this.cur.f;
      this.commit("Delete frame", [{ k: "frame-del", fid: d.frames[f].id }]);
      this.setCur(this.cur.l, Math.min(f, d.frames.length - 1));
    },
    moveFrame(dir) {
      const d = this.doc, to = this.cur.f + dir;
      if (to < 0 || to >= d.frames.length) return;
      this.commit("Move frame", [{ k: "frame-move", fid: d.frames[this.cur.f].id, to }]);
      this.setCur(this.cur.l, to);
    },
    stepFrame(dir) {
      const n = this.doc.frames.length;
      this.setFrame((this.cur.f + dir + n) % n);
    },
    // ---- playback
    play() {
      if (this.playing) return this.stop();
      this.playing = true;
      this.pdir = 1;
      this.uiDirty = true;
      this.refresh();
      this.playT = setTimeout(() => this.tick(), this.doc.frames[this.cur.f].ms);
    },
    stop() {
      clearTimeout(this.playT);
      if (!this.playing) return;
      this.playing = false;
      this.uiDirty = true;
      this.refresh();
      this.scheduleDraw();
    },
    tick() {
      if (!this.playing) return;
      const d = this.doc, tag = this.tagSel >= 0 ? d.tags[this.tagSel] : null;
      const from = tag ? tag.from : 0, to = tag ? tag.to : d.frames.length - 1;
      const mode = tag && tag.dir !== "forward" ? (tag.dir === "pingpong" ? "pingpong" : "reverse") : this.o.loop;
      let f = this.cur.f;
      if (f < from || f > to) f = from;
      else if (mode === "reverse") f = f <= from ? to : f - 1;
      else if (mode === "pingpong") {
        if (this.pdir > 0) { if (f >= to) { this.pdir = -1; f = Math.max(from, f - 1); } else f++; }
        else if (f <= from) { this.pdir = 1; f = Math.min(to, f + 1); } else f--;
      } else if (mode === "once") { if (f >= to) return this.stop(); f++; }
      else f = f >= to ? from : f + 1;
      this.setFrame(f);
      this.playT = setTimeout(() => this.tick(), d.frames[f].ms);
    },
    // ---- selection + clipboard
    selectAll() { this.setSel(core.invertMask(null, this.doc.w, this.doc.h), "Select all"); },
    copySel(cut) {
      const d = this.doc, cel = this.curCel(false);
      if (!cel) return;
      const b = this.sel ? core.maskBounds(this.sel, d.w, d.h) : { x: 0, y: 0, w: d.w, h: d.h };
      if (!b) return;
      const data = new Uint8ClampedArray(b.w * b.h * 4);
      for (let y = 0; y < b.h; y++) for (let x = 0; x < b.w; x++) {
        const i = (b.y + y) * d.w + b.x + x;
        if (!this.sel || this.sel[i]) sp(data, y * b.w + x, gp(cel, i));
      }
      this.clip = { w: b.w, h: b.h, data };
      if (cut) this.clearSel();
    },
    paste() {
      if (!this.clip || !this.canPaint()) return;
      const d = this.doc, c = this.clip, t = this.beginTx(), selB = this.sel, m = core.newMask(d.w, d.h);
      const b = this.sel && core.maskBounds(this.sel, d.w, d.h), ox = b ? b.x : 0, oy = b ? b.y : 0;
      for (let y = 0; y < c.h; y++) for (let x = 0; x < c.w; x++) {
        const v = gp(c.data, y * c.w + x), X = x + ox, Y = y + oy;
        if (!(v & 255) || X >= d.w || Y >= d.h) continue;
        const i = Y * d.w + X;
        t.tx.set(i, overPx(t.tx.get(i), v));
        m[i] = 1;
      }
      this.setSelRaw(core.maskCount(m) ? m : null);
      this.endTx("Paste", t, selB);
    },
    clearSel() {
      if (!this.canPaint()) return;
      const t = this.beginTx(), n = this.doc.w * this.doc.h;
      for (let i = 0; i < n; i++) if (!this.sel || this.sel[i]) if (t.tx.get(i)) t.tx.set(i, 0);
      this.endTx("Clear", t);
    },
    transformSel(kind) {
      if (!this.canPaint()) return;
      const t = this.beginTx(), d = this.doc, selB = this.sel;
      const res = core.transformRegion(new Uint8ClampedArray(t.tx.cel), d.w, d.h, this.sel, kind);
      this.writeCel(t, res.data);
      if (this.sel) this.setSelRaw(res.mask);
      this.endTx("Transform", t, selB);
    },

    // ---- keyboard (Aseprite-flavoured)
    onKey(e) {
      const tg = e.target, tag = tg.tagName;
      if (tag === "TEXTAREA" || (tag === "INPUT" && !["range", "checkbox", "color"].includes(tg.type)) || tag === "SELECT") return;
      if (this.modalEl) { if (e.key === "Escape") this.closeModal(); return; }
      const k = e.key, lk = k.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
      const eat = () => { e.preventDefault(); e.stopPropagation(); };
      if (k === " ") { this.spaceDown = true; return eat(); }
      if (ctrl) {
        const map = {
          z: () => (e.shiftKey ? this.redo() : this.undo()), y: () => this.redo(), a: () => this.selectAll(),
          d: () => this.setSel(null, "Deselect"), c: () => this.copySel(false), x: () => this.copySel(true), v: () => this.paste(),
          s: () => this.saveProject(), n: () => this.newDialog(), o: () => this.openFile(false),
          i: () => e.shiftKey && this.setSel(core.invertMask(this.sel, this.doc.w, this.doc.h), "Invert selection"),
          "'": () => this.setGrid(this.o.grid ? 0 : 1),
        };
        if (map[lk]) { eat(); map[lk](); }
        return;
      }
      if (e.altKey && lk === "n") { eat(); return this.addFrame(false); }
      if (e.shiftKey && lk === "n") { eat(); return this.addLayer(); }
      if (k === "Escape") { if (this.drag) this.cancelStroke(); else if (this.sel) this.setSel(null, "Deselect"); return; }
      if (k === "Delete" || k === "Backspace") { eat(); return this.clearSel(); }
      if (k === "Enter") { eat(); return this.play(); }
      if (k === ",") { eat(); return this.stepFrame(-1); }
      if (k === ".") { eat(); return this.stepFrame(1); }
      if (k === "+" || k === "=") { eat(); return this.stepZoom(1); }
      if (k === "-" || k === "_") { eat(); return this.stepZoom(-1); }
      if (k === "[" || k === "]") {
        this.o.size = clamp(this.o.size + (k === "]" ? 1 : -1), 1, 32);
        this.syncSizeLabels(); this.scheduleDraw();
        return eat();
      }
      if (k.startsWith("Arrow")) {
        if (this.tool === "move" || this.sel) {
          eat();
          const s = e.shiftKey ? 8 : 1;
          return this.nudge(k === "ArrowLeft" ? -s : k === "ArrowRight" ? s : 0, k === "ArrowUp" ? -s : k === "ArrowDown" ? s : 0);
        }
        return;
      }
      if (lk === "x") { eat(); return this.swapColors(); }
      if (lk === "d") { eat(); this.setFg(core.hexToPacked("#000000")); return this.setBg(core.hexToPacked("#ffffff")); }
      if (lk === "f") { eat(); return this.fit(); }
      if (lk === "o") { eat(); this.o.onion = !this.o.onion; this.refresh(); return this.scheduleDraw(); }
      if (lk === "p") { eat(); return this.setTool("pencil"); }
      if (k.length === 1 && this.pressToolKey(lk)) eat();
    },
  });

  if (isDom) {
    PixelStudio._ui = (host, opts) => {
      const ed = new Editor(host, opts || {});
      return ed;
    };
  }

  //@UI-END
  return { core, PixelStudio, Doc, History };
});
