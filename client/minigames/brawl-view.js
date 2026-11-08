// Draws a brawl. It only reads the fight state and never changes it, so the same view works for the
// CPU fight, the predicted online fight and the end screen. Sound is made here too, from plain
// WebAudio oscillators and noise, so there are no audio files to load.
(() => {
  const { W, FLOOR, BIT } = BrawlSim;
  const H = 540;
  const EMOTE = { light: "wave", heavy: "spin", special: "crashout", super: "crashout", airlight: "wave", airheavy: "spin", throw: "spin" };
  const FAR = () => Date.now() + 60000;
  const ICONS = "assets/ui/minigames/";
  const STAGE_ART = ["", "client/minigames/stage-neon.png", "client/minigames/stage-docks.png", "client/minigames/stage-roof.png"];
  // [id, icon or label, aria label, bits it holds]. Super is block and special pressed together
  const TOUCH = [
    ["L", "pad-left", "Left", [BIT.L]], ["R", "pad-right", "Right", [BIT.R]], ["U", "pad-up", "Jump", [BIT.U]], ["B", "pad-block", "Block", [BIT.B]],
    ["A", "pad-light", "Light attack", [BIT.A]], ["H", "pad-heavy", "Heavy attack", [BIT.H]], ["T", "Grab", "Throw", [BIT.T]],
    ["S", "pad-special", "Special", [BIT.S]], ["X", "Super", "Super, needs a full meter", [BIT.B, BIT.S]],
  ];
  const HIT_COLORS = ["#fff4a8", "#ffb347", "#ff7a1a"];

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  // ---------------------------------------------------------------- sound
  // Everything is a short burst of a tone or noise. The context is made on the first sound so it
  // only starts after the player has pressed something, which is when browsers let it.
  const Sfx = (() => {
    let ctx = null;
    let muted = false;
    try {
      muted = localStorage.getItem("brawl-muted") === "1";
    } catch {}
    let noise = null;

    const boot = () => {
      if (ctx || muted) return ctx;
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return null;
      ctx = new Audio();
      noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const data = noise.getChannelData(0);
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
      return ctx;
    };
    const tone = (type, from, to, len, gain = 0.15, delay = 0) => {
      const t = ctx.currentTime + delay;
      const osc = ctx.createOscillator();
      const amp = ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(from, t);
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t + len);
      amp.gain.setValueAtTime(gain, t);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + len);
      osc.connect(amp).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + len + 0.02);
    };
    const hiss = (len, freq, gain = 0.18, delay = 0) => {
      const t = ctx.currentTime + delay;
      const src = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const amp = ctx.createGain();
      src.buffer = noise;
      filter.type = "bandpass";
      filter.frequency.value = freq;
      amp.gain.setValueAtTime(gain, t);
      amp.gain.exponentialRampToValueAtTime(0.0001, t + len);
      src.connect(filter).connect(amp).connect(ctx.destination);
      src.start(t);
      src.stop(t + len + 0.02);
    };
    const sounds = {
      hit: () => (hiss(0.09, 1400, 0.2), tone("square", 220, 70, 0.1, 0.12)),
      big: () => (hiss(0.16, 900, 0.28), tone("square", 150, 40, 0.2, 0.2)),
      block: () => (tone("triangle", 900, 600, 0.05, 0.12), hiss(0.04, 3000, 0.08)),
      gbreak: () => (hiss(0.3, 4500, 0.25), tone("sawtooth", 1200, 200, 0.3, 0.12), tone("square", 90, 40, 0.25, 0.2)),
      throw: () => (hiss(0.2, 500, 0.2), tone("sine", 300, 80, 0.25, 0.2)),
      tech: () => tone("triangle", 600, 900, 0.1, 0.12),
      shoot: () => tone("sawtooth", 700, 250, 0.14, 0.08),
      burst: () => (hiss(0.22, 700, 0.2), tone("sine", 160, 60, 0.25, 0.18)),
      vanish: () => tone("sine", 900, 120, 0.2, 0.1),
      appear: () => tone("sine", 120, 900, 0.2, 0.1),
      buff: () => (tone("square", 300, 600, 0.3, 0.08), tone("square", 450, 900, 0.3, 0.06, 0.08)),
      flap: () => hiss(0.06, 2500, 0.06),
      cancel: () => tone("triangle", 500, 1000, 0.07, 0.1),
      super: () => (tone("sawtooth", 100, 800, 0.6, 0.14), tone("square", 200, 1600, 0.6, 0.08), hiss(0.5, 1200, 0.15)),
      ko: () => (hiss(0.5, 600, 0.3), tone("sawtooth", 300, 40, 0.7, 0.22)),
      fight: () => (tone("square", 440, 440, 0.12, 0.1), tone("square", 660, 660, 0.25, 0.1, 0.13)),
      zap: () => (hiss(0.3, 3500, 0.25), tone("sawtooth", 1500, 100, 0.3, 0.15)),
      thud: () => (tone("sine", 120, 40, 0.3, 0.3), hiss(0.2, 300, 0.2)),
    };
    return {
      play(name) {
        if (muted || !boot() || !sounds[name]) return;
        if (ctx.state === "suspended") ctx.resume();
        sounds[name]();
      },
      get muted() {
        return muted;
      },
      toggle() {
        muted = !muted;
        try {
          localStorage.setItem("brawl-muted", muted ? "1" : "0");
        } catch {}
        return muted;
      },
    };
  })();

  function buildArt(node, avatar) {
    const motion = node.querySelector(".avatar-motion");
    motion.replaceChildren();
    const layers = avatar?.layers || {};
    for (const key of ["extra", "body", "ears", "head", "chest", "eyes", "hair", "fit"]) {
      const source = layers[key];
      if (!source) continue;
      const img = document.createElement("img");
      img.src = source;
      img.alt = "";
      img.onerror = () => img.remove();
      AvatarLayout.apply(img, layers.body, key, source);
      if (avatar.adjustments?.[key]) img.style.transform = AvatarLayout.transform(avatar, key);
      AvatarColors.applyLayer(img, avatar, key, motion.querySelector('[data-avatar-color-layer="body"]')).then(() =>
        window.AvatarAnimations?.attach(node, img, source),
      );
      motion.append(img);
    }
  }

  function create(container, { players, mySide = 0, onInput }) {
    container.replaceChildren();
    const root = el("div", "bw");
    const arena = el("div", "bw-arena");
    arena.style.width = W + "px";
    arena.style.height = H + "px";
    const hud = el("div", "bw-hud");
    const stage = el("div", "bw-stage");
    const bg = el("div", "bw-bg");
    const banner = el("div", "bw-banner");
    const cutin = el("div", "bw-cutin");
    const flash = el("div", "bw-flash");
    const wind = el("div", "bw-wind");
    const zap = el("div", "bw-zap");
    const info = el("div", "bw-info");
    const mute = el("button", "bw-mute", Sfx.muted ? "SFX off" : "SFX on");
    mute.type = "button";
    mute.addEventListener("click", () => {
      mute.textContent = Sfx.toggle() ? "SFX off" : "SFX on";
      mute.blur();
    });
    // particles live on a canvas so a big hit can throw dozens without making dozens of nodes
    const canvas = el("canvas", "bw-particles");
    canvas.width = W;
    canvas.height = H;
    const pen = canvas.getContext("2d");
    arena.append(bg, zap, wind, stage, canvas, flash, hud, info, cutin, banner, mute);

    const bars = players.map((player, side) => {
      const wrap = el("div", "bw-bar " + (side ? "right" : "left"));
      const name = el("span", "bw-name", player.name + (side === mySide ? " (you)" : ""));
      const race = el("span", "bw-race", BrawlRaces.RACES[player.race]?.name || "Pixie");
      const hp = el("div", "bw-hp");
      const trail = el("i", "bw-trail");
      const fill = el("i", "bw-fill");
      hp.append(trail, fill);
      const guard = el("div", "bw-guard");
      const guardFill = el("i");
      guard.append(guardFill);
      const meter = el("div", "bw-meter");
      const meterFill = el("i");
      meter.append(meterFill);
      const special = el("span", "bw-special", BrawlRaces.specialOf(player.race).name);
      const pips = el("div", "bw-pips");
      pips.append(el("b"), el("b"));
      wrap.append(name, race, hp, guard, meter, special, pips);
      return { wrap, fill, trail, guardFill, meterFill, pips, special, hpShown: 1 };
    });
    const clock = el("div", "bw-clock", "60");
    hud.append(bars[0].wrap, clock, bars[1].wrap);

    const combos = players.map((_, side) => {
      const node = el("div", "bw-combo " + (side ? "right" : "left"));
      node.hidden = true;
      arena.append(node);
      return node;
    });

    const fighters = players.map((player, side) => {
      const node = el("div", "bw-f");
      node.dataset.side = side;
      const shadow = el("span", "bw-shadow");
      const art = el("span", "bw-art avatar-art");
      art.setAttribute("aria-hidden", "true");
      const motion = el("span", "avatar-motion");
      art.append(motion);
      const tag = el("span", "bw-tag", player.name);
      const shield = el("span", "bw-shield");
      node.append(shadow, art, shield, tag);
      node._emote = "";
      node._emoteUntil = 0;
      buildArt(node, player.avatar);
      stage.append(node);
      return node;
    });

    const projectiles = new Map();
    const barrels = [];
    const state = { last: null, shake: 0, phase: "", bannerUntil: 0, stage: -1, round: 0, parts: [], comboUntil: [0, 0], slowUntil: 0 };

    // touch buttons, hidden unless the device has a touchscreen. Left hand walks, right hand fights.
    const pad = el("div", "bw-touch");
    const left = el("div", "bw-pad bw-pad-move");
    const right = el("div", "bw-pad bw-pad-act");
    for (const [name, icon, label, bits] of TOUCH) {
      const button = el("button", "bw-btn bw-btn-" + name);
      if (icon.startsWith("pad-")) {
        const image = el("img");
        image.src = `${ICONS}${icon}.png`;
        image.alt = "";
        button.append(image);
      } else button.textContent = icon;
      button.type = "button";
      button.setAttribute("aria-label", label);
      const press = (down) => (event) => {
        event.preventDefault();
        if (down === button.classList.contains("down")) return;
        for (const bit of bits) onInput?.(bit, down);
        button.classList.toggle("down", down);
        if (down) navigator.vibrate?.(8);
      };
      button.addEventListener("pointerdown", press(true));
      for (const type of ["pointerup", "pointercancel", "pointerleave"]) button.addEventListener(type, press(false));
      (["L", "R", "U", "B"].includes(name) ? left : right).append(button);
    }
    pad.append(left, right);
    const fitbox = el("div", "bw-fitbox");
    fitbox.append(arena);
    root.append(fitbox, pad);
    container.append(root);

    // the arena is always 960x540 inside and scales to whatever room it is given, never stretching
    const fit = () => {
      const scale = Math.min(fitbox.clientWidth / W, fitbox.clientHeight / H);
      if (scale > 0) arena.style.transform = `scale(${scale})`;
    };
    const observer = new ResizeObserver(fit);
    observer.observe(fitbox);
    fit();

    const spawn = (className, x, y, text, ms = 500, extra) => {
      const node = el("span", "bw-fx " + className, text);
      node.style.left = x + "px";
      node.style.top = y + "px";
      if (extra) Object.assign(node.style, extra);
      stage.append(node);
      setTimeout(() => node.remove(), ms);
    };

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    function burst(x, y, n, colors, speed, dir = 0, gravity = 0.25) {
      if (reduced) return;
      for (let i = 0; i < n; i++) {
        // thrown mostly the way the hit travelled, with some spread
        const angle = (dir ? (dir > 0 ? 0 : Math.PI) + (Math.random() - 0.5) * 2.2 : Math.random() * Math.PI * 2);
        const v = speed * (0.4 + Math.random() * 0.8);
        state.parts.push({
          x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v - 1, g: gravity, life: 22 + Math.random() * 18, max: 40,
          size: 2 + Math.random() * 4, color: colors[i % colors.length],
        });
      }
      if (state.parts.length > 400) state.parts.splice(0, state.parts.length - 400);
    }

    function drawParticles() {
      pen.clearRect(0, 0, W, H);
      state.parts = state.parts.filter((p) => {
        p.life--;
        p.x += p.vx;
        p.vy += p.g;
        p.y += p.vy;
        if (p.life <= 0) return false;
        pen.globalAlpha = Math.min(1, p.life / 14);
        pen.fillStyle = p.color;
        pen.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
        return true;
      });
      pen.globalAlpha = 1;
    }

    function showCombo(side, hits) {
      // the counter sits over the person being hit
      const node = combos[side];
      node.hidden = false;
      node.textContent = `${hits} HITS`;
      node.classList.remove("pop");
      void node.offsetWidth;
      node.classList.add("pop");
      state.comboUntil[side] = performance.now() + 1400;
    }

    function fx(events) {
      for (const e of events) {
        if (e.k === "hit" || e.k === "armor") {
          spawn(e.big ? "spark big" : "spark", e.x, e.y, "", 320);
          spawn("dmg", e.x, e.y - 20, String(e.d), 700);
          burst(e.x, e.y, e.big ? 22 : 10, HIT_COLORS, e.big ? 7 : 4.5, e.dir);
          state.shake = Math.max(state.shake, e.big ? 9 : 3);
          Sfx.play(e.big ? "big" : "hit");
          if (e.side === mySide) navigator.vibrate?.(e.big ? 30 : 14);
          if (e.c >= 2) showCombo(e.side, e.c);
        } else if (e.k === "block") {
          spawn("spark blocked", e.x, e.y, "", 260);
          burst(e.x, e.y, 6, ["#8fe6ff", "#fff"], 3, e.dir);
          Sfx.play("block");
        } else if (e.k === "gbreak") {
          spawn("spark big blocked", e.x, e.y, "", 420);
          spawn("dmg word", e.x, e.y - 50, "GUARD BREAK", 900);
          burst(e.x, e.y, 30, ["#8fe6ff", "#fff", "#4a98ff"], 8, 0, 0.3);
          state.shake = 10;
          Sfx.play("gbreak");
        } else if (e.k === "throw") {
          spawn("spark big", e.x, e.y, "", 320);
          spawn("dmg", e.x, e.y - 20, String(e.d), 700);
          burst(e.x, e.y + 40, 18, ["#e4c2ff", "#fff"], 6, e.dir);
          state.shake = 8;
          Sfx.play("throw");
        } else if (e.k === "tech") {
          spawn("ring", e.x, e.y, "", 300, { width: "120px", height: "50px" });
          spawn("dmg word", e.x, e.y - 40, "TECH", 700);
          Sfx.play("tech");
        } else if (e.k === "cancel") {
          burst(e.x, e.y, 6, ["#fff", "#ffe9a6"], 3);
          Sfx.play("cancel");
        } else if (e.k === "burst") {
          spawn("ring", e.x, e.y, "", 420, { width: e.r * 2 + "px", height: e.r * 0.8 + "px" });
          Sfx.play("burst");
        } else if (e.k === "shoot") {
          spawn("puff", e.x, e.y, "", 300);
          Sfx.play("shoot");
        } else if (e.k === "vanish" || e.k === "appear") {
          spawn("smoke", e.x, e.y, "", 500);
          Sfx.play(e.k);
        } else if (e.k === "buff") {
          spawn("aura", e.x, e.y, "", 800);
          Sfx.play("buff");
        } else if (e.k === "flap") {
          spawn("feather", e.x, e.y, "", 400);
          Sfx.play("flap");
        } else if (e.k === "super") {
          const race = players[e.side].race;
          cutin.textContent = BrawlRaces.superOf(race).name;
          cutin.dataset.side = e.side;
          cutin.classList.remove("show");
          void cutin.offsetWidth;
          cutin.classList.add("show");
          flash.classList.remove("go");
          void flash.offsetWidth;
          flash.classList.add("go");
          burst(e.x, e.y, 30, ["#fff", "#ffe9a6", "#ff9a3c"], 6);
          Sfx.play("super");
        } else if (e.k === "zap") {
          spawn("bolt", e.x, e.y - 160, "", 400);
          state.shake = 9;
          Sfx.play("zap");
        } else if (e.k === "thud") {
          spawn("ring", e.x, e.y, "", 400, { width: "130px", height: "40px" });
          burst(e.x, e.y, 14, ["#c9a36a", "#8a6a44"], 4, 0, 0.35);
          state.shake = 8;
          Sfx.play("thud");
        } else if (e.k === "hazard") {
          spawn("spark big", e.x, e.y, "", 320);
          spawn("dmg", e.x, e.y - 20, String(e.d), 700);
          Sfx.play("big");
        } else if (e.k === "ko") {
          state.shake = 14;
          flash.classList.remove("go");
          void flash.offsetWidth;
          flash.classList.add("go");
          Sfx.play("ko");
        } else if (e.k === "fight") Sfx.play("fight");
      }
    }

    function showBanner(text, ms) {
      banner.textContent = text;
      banner.classList.toggle("show", Boolean(text));
      state.bannerUntil = ms ? performance.now() + ms : 0;
    }

    function setStage(index) {
      state.stage = index;
      bg.dataset.stage = String(index);
      const art = STAGE_ART[index];
      bg.style.backgroundImage = art ? `linear-gradient(#0a051944, #0a051922 50%, #0007), url("${art}")` : "";
      zap.hidden = BrawlSim.STAGES[index]?.hazard !== "zap";
    }

    function render(s) {
      state.last = s;
      if (s.stage !== state.stage) setStage(s.stage || 0);
      // fighters
      s.f.forEach((f, side) => {
        const node = fighters[side];
        node.style.left = f.x + "px";
        node.style.top = f.y + "px";
        node.style.zIndex = String(10 + Math.round(f.y) + (side === mySide ? 1 : 0));
        node.dataset.face = f.face > 0 ? "right" : "left";
        node.dataset.st = f.st;
        node.classList.toggle("is-flying", f.y < FLOOR - 2 && f.st !== "ko");
        node.classList.toggle("buffed", f.buff > 0);
        node.classList.toggle("armored", f.armor > 0);
        node.classList.toggle("blocking", f.st === "block");
        node.classList.toggle("hurt", f.st === "hit");
        node.classList.toggle("down", f.st === "ko");
        node.classList.toggle("invuln", f.inv > 0);
        node.classList.toggle("breaking", f.gd > 28);
        if (f.st === "atk") {
          node._emote = EMOTE[f.atk] || "wave";
          node._emoteUntil = Date.now() + 220;
        } else if (f.st === "ko") {
          node._emote = "crashout";
          node._emoteUntil = FAR();
        } else if (f.st === "win") {
          node._emote = "dance";
          node._emoteUntil = FAR();
        } else node._emoteUntil = 0;
        if (f.st === "walk") window.AvatarAnimations?.moved(node, 160);
        const shadow = node.firstChild;
        shadow.style.opacity = f.y < FLOOR ? String(Math.max(0.25, 1 - (FLOOR - f.y) / 260)) : "1";
        shadow.style.transform = `translate(-50%, ${FLOOR - f.y}px)`;
      });
      // hud
      bars.forEach((bar, side) => {
        const f = s.f[side];
        const ratio = Math.max(0, f.hp / f.max);
        bar.fill.style.width = ratio * 100 + "%";
        bar.hpShown = Math.max(ratio, bar.hpShown - 0.004);
        bar.trail.style.width = bar.hpShown * 100 + "%";
        bar.guardFill.style.width = Math.min(100, (f.gd / BrawlSim.GUARD_BREAK) * 100) + "%";
        bar.meterFill.style.width = f.meter + "%";
        bar.wrap.classList.toggle("ready", f.meter >= BrawlSim.SPECIAL_COST);
        bar.wrap.classList.toggle("super", f.meter >= BrawlSim.SUPER_COST);
        bar.special.textContent =
          f.meter >= BrawlSim.SUPER_COST ? "SUPER: " + BrawlRaces.superOf(players[side].race).name : BrawlRaces.specialOf(players[side].race).name;
        bar.pips.children[0].classList.toggle("on", s.wins[side] >= 1);
        bar.pips.children[1].classList.toggle("on", s.wins[side] >= 2);
        if (state.comboUntil[side] && performance.now() > state.comboUntil[side]) {
          combos[side].hidden = true;
          state.comboUntil[side] = 0;
        }
      });
      clock.textContent = s.phase === "fight" || s.phase === "roundend" ? String(Math.max(0, Math.ceil(s.timer / 60))) : "";
      // stage hazards
      const hazard = BrawlSim.STAGES[s.stage]?.hazard;
      if (hazard === "zap") zap.dataset.state = ["off", "warn", "live"][BrawlSim.zapState(s)];
      const gust = hazard === "wind" ? BrawlSim.windOf(s) : 0;
      wind.dataset.dir = String(gust);
      barrels.forEach((node, i) => (node.hidden = !s.h[i]));
      s.h.forEach((b, i) => {
        if (!barrels[i]) {
          barrels[i] = el("span", "bw-barrel");
          stage.append(barrels[i]);
        }
        const node = barrels[i];
        node.style.left = b.x + "px";
        // before it drops only a shadow shows on the floor where it is going to land
        node.style.top = (b.t < 45 ? FLOOR - 4 : b.y) + "px";
        node.dataset.warn = b.t < 45 ? "1" : "";
      });
      // projectiles
      const live = new Set();
      s.p.forEach((p, i) => {
        const key = p.o + ":" + Math.round(p.life) + ":" + i;
        live.add(key);
        let node = projectiles.get(key);
        if (!node) {
          node = el("span", "bw-shot");
          node.dataset.race = p.race;
          stage.append(node);
          projectiles.set(key, node);
        }
        node.style.left = p.x + "px";
        node.style.top = p.y + "px";
        node.style.width = node.style.height = p.r * 2 + "px";
      });
      for (const [key, node] of projectiles) {
        if (!live.has(key)) {
          node.remove();
          projectiles.delete(key);
        }
      }
      // banners
      if (s.phase !== state.phase) {
        state.phase = s.phase;
        if (s.phase === "intro") {
          const last = s.wins[0] === 1 && s.wins[1] === 1;
          showBanner(last ? "FINAL ROUND" : `ROUND ${s.round}`, 0);
        } else if (s.phase === "roundend") {
          const w = s.f[s.rw];
          showBanner(s.rw < 0 ? "DRAW" : s.timer <= 0 ? "TIME!" : w && w.hp >= w.max ? "PERFECT K.O.!" : "K.O.!", 0);
        } else if (s.phase === "matchend") showBanner(`${players[s.winner]?.name || "Nobody"} wins!`, 0);
        else if (s.phase === "fight") showBanner("FIGHT!", 700);
      }
      if (state.bannerUntil && performance.now() > state.bannerUntil) showBanner("", 0);
      arena.classList.toggle("slowmo", s.phase === "roundend" && s.pt > BrawlSim.ROUND_END - 30);
      drawParticles();
      if (state.shake > 0.3) {
        arena.style.translate = `${(Math.random() - 0.5) * state.shake}px ${(Math.random() - 0.5) * state.shake}px`;
        state.shake *= 0.82;
      } else arena.style.translate = "";
    }

    return {
      render,
      fx,
      banner: showBanner,
      // a line under the clock, used by the gauntlet for the streak
      info(text) {
        info.textContent = text;
      },
      destroy() {
        observer.disconnect();
        container.replaceChildren();
      },
    };
  }

  // ---------------------------------------------------------------- move list
  // Built from the same tables the sim runs, so it can never disagree with the game.
  function moveList(container, race) {
    const M = BrawlSim.MOVES;
    const stats = BrawlRaces.RACES[race] || BrawlRaces.RACES.pixie;
    const special = BrawlRaces.specialOf(race);
    const sup = BrawlRaces.superOf(race);
    const frames = (m) => `${m.startup}f start-up`;
    const dmg = (m) => (m.shots ? `${m.shots.length} x ${m.shots[0].dmg}` : m.hits ? `${m.hits} x ${m.dmg}` : String(m.dmg));
    const rows = [
      ["Light", "J / Z", `${frames(M.light)}, ${M.light.dmg} dmg. Fast. Tap again to chain up to ${BrawlSim.MAX_CHAIN} lights.`],
      ["Heavy", "K / X", `${frames(M.heavy)}, ${M.heavy.dmg} dmg. Slow, big knock-back, steps forward.`],
      ["Air light / heavy", "J / K in the air", `Jump-in attacks. The heavy slams the other fighter down. Land to end them early.`],
      ["Throw", "I / U", `${frames(M.throw)}, ${M.throw.dmg} dmg. Beats blocking. Misses jumpers. Both throw at once and you tech.`],
      ["Special", "L / C", `${special.name}: ${dmg(special)} dmg, costs ${BrawlSim.SPECIAL_COST} meter.`],
      ["Super", "S + L, or O", `${sup.name}: ${dmg(sup)} dmg, costs a full meter. You cannot be hit while it winds up.`],
      ["Block", "S / down", "Cuts damage to a sliver, but every blocked hit fills the guard gauge. A full gauge is a guard break."],
    ];
    const tips = [
      "Cancels: a light that connects can be cancelled into a heavy, special or super by pressing the next button early.",
      "A heavy that connects can be cancelled into a special or super.",
      "Later hits in a combo do less damage, down to 40 percent.",
      "Meter fills when you hit and when you are hit, and carries over between rounds.",
      `${stats.name}: ${stats.hp} HP${stats.airJumps ? ", one extra jump in the air" : ""}.`,
    ];
    container.replaceChildren();
    const table = el("table", "bw-moves");
    for (const [name, keys, text] of rows) {
      const tr = el("tr");
      tr.append(el("th", "", name), el("td", "bw-keys", keys), el("td", "", text));
      table.append(tr);
    }
    const list = el("ul", "bw-tips");
    for (const tip of tips) list.append(el("li", "", tip));
    container.append(table, list);
  }

  window.BrawlView = { create, moveList, Sfx };
})();
