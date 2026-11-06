// Cone Game: a crane swings a traffic cone back and forth, you drop it onto the tower. Whatever hangs
// over the edge gets sliced off, so the tower gets skinnier until you miss. Land dead centre to chain
// PERFECTs, build the multiplier and (after three in a row) grow the cone back.
//
// The top half is the whole game as pure functions so node can test it (same shape as brawl-sim.js).
// It never touches Math.random or the clock. One step() is 1/60th of a second.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.ConeGame = api;
})(typeof self !== "undefined" ? self : this, function (root) {
  const W = 320;
  const MARGIN = 24; // the crane never swings further than this from the walls
  const BASE_W = 96;
  const MIN_W = 4; // slice it thinner than this and there is nothing left to stack on
  const REGROW = 4;
  const MAX_MULT = 8;

  // each mode bends one rule. Locked ones open up from your best tower / best score (kept in the browser)
  const MODES = {
    classic: { name: "Classic", blurb: "One cone. One button. Do not blink.", speed: 1, tol: 5, score: 1, color: "#ff7a1a", unlock: null },
    ghost: { name: "Ghost Cone", blurb: "The crane flickers out. Trust your soul.", speed: 1, tol: 6, score: 1.5, color: "#a88cff", unlock: { cones: 12 } },
    gusty: { name: "Gale Force", blurb: "Wind speeds the crane up and slows it down.", speed: 1, tol: 5, score: 1.5, color: "#3fd0ff", unlock: { score: 1500 } },
    chaos: { name: "Cone Chaos", blurb: "The crane changes its mind. Often.", speed: 1.05, tol: 6, score: 2, color: "#ff3d8b", unlock: { cones: 25 } },
  };

  const multiplier = (combo) => Math.min(MAX_MULT, 1 + Math.floor(combo / 3));
  // slow enough at the start to learn the timing, then it just keeps getting worse
  const speedAt = (n) => Math.min(6, 2 + n * 0.09);

  function isUnlocked(mode, stats) {
    const need = MODES[mode] && MODES[mode].unlock;
    if (!MODES[mode]) return false;
    if (!need) return true;
    const s = stats || {};
    return Boolean((need.cones && (s.bestCones || 0) >= need.cones) || (need.score && (s.bestScore || 0) >= need.score));
  }
  const unlockHint = (mode) => {
    const need = MODES[mode] && MODES[mode].unlock;
    if (!need) return "";
    return need.cones ? `Stack ${need.cones} cones to unlock` : `Score ${need.score.toLocaleString()} to unlock`;
  };

  // mulberry32, so a seed replays the same chaos
  function rand(s) {
    s.rng = (s.rng + 0x6d2b79f5) | 0;
    let t = Math.imul(s.rng ^ (s.rng >>> 15), 1 | s.rng);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function spawn(s) {
    const top = s.stack[s.stack.length - 1];
    // alternate sides so you cannot just hammer the button right after a drop
    const fromLeft = s.n % 2 === 0;
    s.mover = { x: fromLeft ? MARGIN : W - MARGIN, dir: fromLeft ? 1 : -1, w: top.w };
  }

  function create(opts = {}) {
    const mode = MODES[opts.mode] ? opts.mode : "classic";
    const s = {
      mode, rng: (opts.seed == null ? 1 : opts.seed) | 0, t: 0, n: 0, score: 0, combo: 0, bestCombo: 0, perfects: 0,
      phase: "play", flip: 0, stack: [{ x: W / 2, w: BASE_W }], mover: null, events: [],
    };
    spawn(s);
    return s;
  }

  // ghost mode hides the crane for part of each swing, never during the first few cones
  const visible = (s) => s.mode !== "ghost" || s.n < 4 || s.t % 100 < 55;

  function step(s) {
    if (s.phase !== "play") return s;
    const m = MODES[s.mode];
    s.t++;
    let v = speedAt(s.n) * m.speed;
    if (s.mode === "gusty") v *= 1 + 0.5 * Math.sin(s.t / 34);
    if (s.mode === "chaos" && s.t - s.flip > 24 && rand(s) < 0.01 + Math.min(s.n, 40) * 0.0012) {
      s.mover.dir *= -1;
      s.flip = s.t;
    }
    const mv = s.mover;
    mv.x += mv.dir * v;
    if (mv.x > W - MARGIN) { mv.x = W - MARGIN; mv.dir = -1; }
    if (mv.x < MARGIN) { mv.x = MARGIN; mv.dir = 1; }
    return s;
  }

  // let go of the cone. returns the event (also pushed on s.events for the renderer)
  function drop(s) {
    if (s.phase !== "play") return null;
    const m = MODES[s.mode];
    const top = s.stack[s.stack.length - 1];
    const mv = s.mover;
    const delta = mv.x - top.x;
    const lo = Math.max(top.x - top.w / 2, mv.x - mv.w / 2);
    const hi = Math.min(top.x + top.w / 2, mv.x + mv.w / 2);
    const overlap = hi - lo;
    let ev;
    if (overlap < MIN_W) {
      s.phase = "over";
      s.combo = 0;
      ev = { type: "miss", x: mv.x, w: mv.w, score: s.score };
    } else if (Math.abs(delta) <= m.tol) {
      s.combo++;
      s.perfects++;
      s.bestCombo = Math.max(s.bestCombo, s.combo);
      const w = s.combo >= 3 ? Math.min(BASE_W, top.w + REGROW) : top.w;
      s.stack.push({ x: top.x, w });
      ev = { type: "perfect", x: top.x, w, combo: s.combo, grew: w > top.w };
    } else {
      s.combo = 0;
      s.stack.push({ x: (lo + hi) / 2, w: overlap });
      const side = delta > 0 ? 1 : -1;
      const sliceW = Math.abs(delta);
      ev = { type: "trim", x: (lo + hi) / 2, w: overlap, slice: { x: side > 0 ? hi + sliceW / 2 : lo - sliceW / 2, w: sliceW, side } };
    }
    if (ev.type !== "miss") {
      s.n++;
      const mult = multiplier(s.combo);
      ev.mult = mult;
      ev.points = Math.round((10 + (ev.type === "perfect" ? 15 : 0) + Math.min(s.n, 50)) * mult * m.score);
      s.score += ev.points;
      if (s.stack[s.stack.length - 1].w < MIN_W + 2) {
        s.phase = "over"; // a sliver you cannot possibly hit: call it
        ev.final = true;
      } else spawn(s);
    }
    s.events.push(ev);
    return ev;
  }

  const api = { W, MARGIN, BASE_W, MIN_W, MODES, multiplier, speedAt, isUnlocked, unlockHint, create, step, drop, visible };
  if (!root.document || !root.ArcadeGames) return api;

  // ------------------------------------------------------------------ browser cabinet
  const SH = 480; // screen height; the canvas is W x SH, CSS scales it
  const GROUND = 440;
  const CONE_H = 16;
  const FIXED = 1000 / 60;
  const STORE = "cone.stats";
  const ICON = "assets/ui/minigames/icon-cone.png";
  const VARIANT = { classic: 0, ghost: 1, gusty: 2, chaos: 3 }; // column in cones.png

  const loadStats = () => {
    try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; }
  };
  const saveStats = (stats) => {
    try { localStorage.setItem(STORE, JSON.stringify(stats)); } catch (e) { /* private window, just don't remember */ }
  };
  const loadImg = (src) => {
    const img = new Image();
    img.src = src;
    return img;
  };

  function mount(host, ctx) {
    host.replaceChildren();
    const reduced = root.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const wrap = document.createElement("div");
    wrap.className = "cone-wrap";
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = SH;
    canvas.className = "cone-canvas";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "Cone Game. A crane swings a traffic cone over a tower of cones. Press space or tap to drop it.");
    const panel = document.createElement("div");
    panel.className = "cone-panel";
    wrap.append(canvas, panel);
    host.append(wrap);
    const g = canvas.getContext("2d");
    g.imageSmoothingEnabled = false;
    // sprites are optional: if they fail to load the canvas shapes below still draw everything
    const sheet = loadImg("client/games/cone/cones.png");
    const skyline = loadImg("client/games/cone/skyline.png");
    const hook = loadImg("client/games/cone/hook.png");
    const ready = (img) => img.complete && img.naturalWidth > 0;

    let stats = loadStats();
    let mode = "classic";
    let s = create({ mode, seed: 1 });
    let screen = "menu"; // menu | play | over
    let board = null;
    let raf = 0;
    let last = 0;
    let acc = 0;
    let cam = 0;
    let shake = 0;
    let flash = 0;
    let fx = []; // falling slices, sparkles, popups
    let audio = null;
    let landT = 0; // squash timer for the cone that just landed
    let finishTimer = 0;

    // ---- sound, all synthesized
    function ac() {
      if (!audio) {
        try { audio = new (root.AudioContext || root.webkitAudioContext)(); } catch (e) { audio = false; }
      }
      if (audio && audio.state === "suspended") audio.resume();
      return audio || null;
    }
    function tone(freq, dur, type, vol, slide, delay) {
      const a = ac();
      if (!a) return;
      const t = a.currentTime + (delay || 0);
      const o = a.createOscillator();
      const gain = a.createGain();
      o.type = type || "square";
      o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
      gain.gain.setValueAtTime(vol || 0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(gain).connect(a.destination);
      o.start(t);
      o.stop(t + dur + 0.02);
    }
    function noise(dur, vol) {
      const a = ac();
      if (!a) return;
      const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
      const src = a.createBufferSource();
      const gain = a.createGain();
      gain.gain.value = vol || 0.12;
      src.buffer = buf;
      src.connect(gain).connect(a.destination);
      src.start();
    }
    // pentatonic climb so a perfect streak sounds like it is going somewhere
    const SCALE = [0, 2, 4, 7, 9];
    const noteHz = (i) => 392 * 2 ** ((SCALE[i % 5] + 12 * Math.floor(i / 5)) / 12);

    // ---- flow
    function begin() {
      clearTimeout(finishTimer);
      s = create({ mode, seed: (Date.now() & 0xffff) | 1 });
      screen = "play";
      fx = [];
      cam = 0;
      landT = 0;
      if (board) board.destroy();
      board = null;
      panel.hidden = true;
      ac();
    }

    function press() {
      if (screen !== "play" || s.phase !== "play") return;
      const ev = drop(s);
      if (!ev) return;
      const topY = stackTopY(s.stack.length - 1);
      if (ev.type === "miss") {
        fx.push({ kind: "piece", x: ev.x, y: topY - 70, w: ev.w, vy: 0, vx: 0, rot: 0, vr: 0.05, life: 70 });
        shake = 18;
        flash = 1;
        noise(0.5, 0.2);
        tone(300, 0.7, "sawtooth", 0.1, -240);
        finishTimer = setTimeout(finish, 900); // let the cone fall before the panel covers it
        return;
      }
      landT = 1;
      if (ev.slice) {
        fx.push({ kind: "piece", x: ev.slice.x, y: topY, w: ev.slice.w, vy: -1.5, vx: ev.slice.side * 1.5, rot: 0, vr: ev.slice.side * 0.08, life: 60 });
        shake = Math.max(shake, 4);
        noise(0.12, 0.1);
        tone(160, 0.12, "triangle", 0.12, -60);
      } else {
        for (let i = 0; i < 14; i++) fx.push({ kind: "spark", x: ev.x, y: topY, vx: (Math.random() - 0.5) * 5, vy: -Math.random() * 4 - 1, life: 30 + Math.random() * 20, hue: Math.random() * 60 + 20 });
        flash = 0.25;
        tone(noteHz(ev.combo - 1), 0.18, "square", 0.08);
        tone(noteHz(ev.combo - 1) * 2, 0.22, "triangle", 0.06, 0, 0.04);
        if (ev.grew) tone(880, 0.25, "sine", 0.07, 400, 0.1);
      }
      tone(110, 0.08, "sine", 0.18, -50);
      fx.push({ kind: "text", x: ev.x, y: topY - 10, text: ev.type === "perfect" ? `PERFECT +${ev.points}` : `+${ev.points}`, color: ev.type === "perfect" ? "#ffe14a" : "#fff", life: 50 });
      if (ev.mult > 1 && ev.type === "perfect" && ev.combo % 3 === 0) fx.push({ kind: "text", x: W / 2, y: 120, text: `x${ev.mult} MULTIPLIER`, color: "#ff7ad9", life: 70, big: true });
      if (s.n % 10 === 0) {
        fx.push({ kind: "text", x: W / 2, y: 90, text: `${s.n} CONES!`, color: "#7dffb0", life: 80, big: true });
        [0, 4, 7, 12].forEach((st, i) => tone(523 * 2 ** (st / 12), 0.15, "square", 0.07, 0, i * 0.07));
      }
      if (s.phase === "over") finish();
    }

    const note = document.createElement("p");
    note.className = "cone-note";
    const boardHost = document.createElement("div");
    boardHost.className = "cone-board";

    function finish() {
      if (screen === "over") return;
      screen = "over";
      const before = Object.assign({}, stats);
      stats.bestCones = Math.max(stats.bestCones || 0, s.n);
      stats.bestScore = Math.max(stats.bestScore || 0, s.score);
      saveStats(stats);
      const opened = Object.keys(MODES).filter((k) => !isUnlocked(k, before) && isUnlocked(k, stats));
      renderOver(opened);
      const me = ctx.me && ctx.me();
      board = ctx.leaderboard.mountCanvas(boardHost, "cone", { title: "CONE GAME", me: me && me.username, width: W, height: 250 });
      Promise.resolve(ctx.leaderboard.submit("cone", s.score, { mode: s.mode, cones: s.n })).then((res) => {
        if (screen !== "over") return;
        if (res && res.improved) note.textContent = (note.textContent ? note.textContent + "  " : "") + "New personal best on the board!";
        if (board) board.refresh();
      });
    }

    // ---- DOM panel (menu + game over)
    function modeButtons() {
      const row = document.createElement("div");
      row.className = "cone-modes";
      for (const id of Object.keys(MODES)) {
        const m = MODES[id];
        const b = document.createElement("button");
        b.type = "button";
        const open = isUnlocked(id, stats);
        b.className = "cone-mode" + (id === mode ? " on" : "");
        b.disabled = !open;
        b.style.setProperty("--c", m.color);
        const name = document.createElement("strong");
        const sub = document.createElement("span");
        name.textContent = open ? m.name : "??? locked";
        sub.textContent = open ? `${m.blurb} (x${m.score} score)` : unlockHint(id);
        b.append(name, sub);
        b.addEventListener("click", () => { mode = id; renderMenu(); });
        row.append(b);
      }
      return row;
    }

    function button(label, fn, cls) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "cone-go " + (cls || "");
      b.textContent = label;
      b.addEventListener("click", fn);
      return b;
    }

    function renderMenu() {
      panel.hidden = false;
      const h = document.createElement("h2");
      h.textContent = "CONE GAME";
      const p = document.createElement("p");
      p.textContent = "Stack the cones. Slice what hangs over. Space, click or tap to drop.";
      const best = document.createElement("p");
      best.className = "cone-best";
      best.textContent = stats.bestCones ? `Best tower: ${stats.bestCones} cones / best score: ${(stats.bestScore || 0).toLocaleString()}` : "No tower yet. The cones are waiting.";
      const img = document.createElement("img");
      img.src = ICON;
      img.alt = "";
      img.className = "cone-hero";
      panel.replaceChildren(img, h, p, modeButtons(), button("START", begin), best);
    }

    function renderOver(opened) {
      panel.hidden = false;
      const h = document.createElement("h2");
      h.textContent = s.n >= 20 ? "CONE-QUERED" : s.n >= 8 ? "COLLAPSED" : "TIMBER, BUT CONE";
      const p = document.createElement("p");
      p.className = "cone-final";
      p.textContent = `${s.score.toLocaleString()} pts / ${s.n} cones / best streak ${s.bestCombo}`;
      note.textContent = opened.length ? `UNLOCKED: ${opened.map((k) => MODES[k].name).join(", ")}` : "";
      const row = document.createElement("div");
      row.className = "cone-row";
      row.append(
        button("AGAIN", begin),
        button("MODES", () => { screen = "menu"; if (board) board.destroy(); board = null; renderMenu(); }, "alt"),
        button("QUIT", () => ctx.close(), "alt"),
      );
      boardHost.replaceChildren();
      panel.replaceChildren(h, p, note, row, boardHost);
    }

    // ---- input
    const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test((e.target && e.target.tagName) || "");
    function onKey(e) {
      if (typing(e)) return;
      if (e.code === "Space" || e.code === "ArrowDown" || e.code === "Enter") {
        if (screen === "play") { e.preventDefault(); if (!e.repeat) press(); }
        else if (screen === "over" && e.code !== "Enter") { e.preventDefault(); begin(); }
      } else if (e.code === "KeyR" && screen !== "menu") begin();
    }
    root.addEventListener("keydown", onKey);
    canvas.addEventListener("pointerdown", (e) => { e.preventDefault(); press(); });

    // ---- drawing
    const stackTopY = (i) => GROUND - (i + 1) * CONE_H + cam;
    const camTarget = () => Math.max(0, (s.stack.length + 1) * CONE_H - (GROUND - 330));

    function drawCone(cx, bottom, w, variant, alpha, squash) {
      const h = CONE_H - (squash || 0);
      g.globalAlpha = alpha == null ? 1 : alpha;
      if (ready(sheet)) {
        g.drawImage(sheet, variant * 32, 0, 32, 16, cx - w / 2, bottom - h, w, h);
      } else {
        g.fillStyle = "#2a2140";
        g.fillRect(cx - w / 2, bottom - 3, w, 3);
        g.fillStyle = MODES[Object.keys(VARIANT)[variant]].color;
        g.fillRect(cx - w * 0.4, bottom - h, w * 0.8, h - 3);
      }
      g.globalAlpha = 1;
    }

    function sky() {
      const t = Math.min(1, s.n / 60);
      const gr = g.createLinearGradient(0, 0, 0, SH);
      gr.addColorStop(0, `hsl(${250 - t * 40} 60% ${14 - t * 8}%)`);
      gr.addColorStop(1, `hsl(${290 - t * 60} 70% ${30 - t * 12}%)`);
      g.fillStyle = gr;
      g.fillRect(0, 0, W, SH);
      g.fillStyle = "#fff";
      for (let i = 0; i < 40; i++) { // stars drift down as the tower climbs past them
        const y = (((i * 53) % SH) + cam * 0.2) % SH;
        g.globalAlpha = 0.25 + ((i * 7) % 5) / 8 + Math.sin(s.t / 20 + i) * 0.15;
        g.fillRect((i * 97) % W, y, 2, 2);
      }
      g.globalAlpha = 1;
      // the city sits further back than the tower so it scrolls slower
      if (ready(skyline)) g.drawImage(skyline, 0, GROUND - 96 + cam * 0.5);
      g.fillStyle = "#1b1233";
      g.fillRect(0, GROUND + cam, W, SH);
      g.fillStyle = "#3a2a66";
      g.fillRect(0, GROUND + cam, W, 3);
    }

    function draw() {
      const v = VARIANT[s.mode];
      g.save();
      if (shake > 0 && !reduced) g.translate((Math.random() - 0.5) * shake, (Math.random() - 0.5) * shake);
      sky();
      const n = s.stack.length;
      for (let i = 0; i < n; i++) {
        const c = s.stack[i];
        // lower cones sway a little in the breeze, the top few stay put so aiming stays honest
        const sway = reduced ? 0 : Math.sin(s.t / 30 + i * 0.4) * Math.min(4, Math.max(0, n - 1 - i) * 0.15);
        drawCone(c.x + sway, GROUND - i * CONE_H + cam, c.w, v, 1, i === n - 1 ? landT * 5 : 0);
      }
      if (s.phase === "play" && screen === "play") {
        const my = stackTopY(n - 1) - 70;
        g.strokeStyle = "rgba(255,255,255,.4)";
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(s.mover.x, 0);
        g.lineTo(s.mover.x, my - CONE_H - 12);
        g.stroke();
        if (ready(hook)) g.drawImage(hook, s.mover.x - 6, my - CONE_H - 12);
        // faint guide line that fades with height so it stops being a freebie
        g.strokeStyle = `rgba(255,255,255,${Math.max(0, 0.12 - s.n * 0.003)})`;
        g.beginPath();
        g.moveTo(s.mover.x, my);
        g.lineTo(s.mover.x, stackTopY(n - 1));
        g.stroke();
        drawCone(s.mover.x, my, s.mover.w, v, visible(s) ? 1 : 0.07);
      }
      for (const f of fx) {
        if (f.kind === "piece") {
          g.save();
          g.translate(f.x, f.y);
          g.rotate(f.rot);
          drawCone(0, 0, f.w, v, Math.min(1, f.life / 30));
          g.restore();
        } else if (f.kind === "spark") {
          g.fillStyle = `hsl(${f.hue} 100% 65%)`;
          g.globalAlpha = Math.min(1, f.life / 20);
          g.fillRect(f.x, f.y, 3, 3);
          g.globalAlpha = 1;
        } else {
          g.globalAlpha = Math.min(1, f.life / 20);
          g.textAlign = "center";
          g.font = `bold ${f.big ? 22 : 13}px monospace`;
          g.fillStyle = "#000";
          g.fillText(f.text, f.x + 1, f.y + 1);
          g.fillStyle = f.color;
          g.fillText(f.text, f.x, f.y);
          g.globalAlpha = 1;
        }
      }
      hud();
      if (flash > 0) {
        g.fillStyle = `rgba(255,255,255,${flash * 0.35})`;
        g.fillRect(0, 0, W, SH);
      }
      g.restore();
    }

    function hud() {
      g.textAlign = "left";
      g.font = "bold 20px monospace";
      g.fillStyle = "#fff";
      g.fillText(String(s.score).padStart(6, "0"), 10, 26);
      g.font = "12px monospace";
      g.fillStyle = "#cbbcf5";
      g.fillText(`${s.n} cones`, 10, 44);
      const mult = multiplier(s.combo);
      g.textAlign = "right";
      g.fillStyle = mult > 1 ? "#ff7ad9" : "#8a7bc0";
      g.font = "bold 18px monospace";
      g.fillText(`x${mult}`, W - 10, 26);
      // streak pips toward the next multiplier step
      for (let i = 0; i < 3; i++) {
        g.fillStyle = i < s.combo % 3 ? "#ffe14a" : "rgba(255,255,255,.2)";
        g.fillRect(W - 14 - i * 12, 34, 9, 5);
      }
      const me = ctx.me && ctx.me();
      if (me && me.username) {
        g.textAlign = "center";
        g.font = "11px monospace";
        g.fillStyle = "rgba(255,255,255,.55)";
        g.fillText(me.username.slice(0, 18), W / 2, GROUND + cam + 24);
      }
    }

    function updateFx() {
      for (const f of fx) {
        f.life--;
        if (f.kind === "piece") { f.vy += 0.35; f.x += f.vx; f.y += f.vy; f.rot += f.vr; }
        else if (f.kind === "spark") { f.vy += 0.15; f.x += f.vx; f.y += f.vy; }
        else f.y -= 0.6;
      }
      fx = fx.filter((f) => f.life > 0);
      shake = Math.max(0, shake - 0.8);
      flash = Math.max(0, flash - 0.03);
      landT = Math.max(0, landT - 0.12);
      cam += (camTarget() - cam) * 0.1;
    }

    function frame(now) {
      raf = requestAnimationFrame(frame);
      acc += Math.min(100, now - (last || now));
      last = now;
      while (acc >= FIXED) {
        acc -= FIXED;
        if (screen === "play") step(s);
        else if (screen === "menu") s.t++; // menu: sky keeps breathing
        updateFx();
      }
      draw();
    }

    renderMenu();
    raf = requestAnimationFrame(frame);
    return {
      destroy() {
        cancelAnimationFrame(raf);
        clearTimeout(finishTimer);
        root.removeEventListener("keydown", onKey);
        if (board) board.destroy();
        if (audio && audio.close) audio.close();
        host.replaceChildren();
      },
    };
  }

  root.ArcadeGames.register({
    id: "cone",
    title: "Cone Game",
    blurb: "Stack traffic cones as high as you dare. Slice, combo, collapse.",
    icon: ICON,
    mount,
  });
  return api;
});
