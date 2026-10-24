// Draws a brawl. It only reads the fight state and never changes it, so the same view works for the
// CPU fight, the predicted online fight and the end screen.
(() => {
  const { W, FLOOR, BIT } = BrawlSim;
  const H = 540;
  const EMOTE = { light: "wave", heavy: "spin", special: "crashout" };
  const FAR = () => Date.now() + 60000;
  const TOUCH = [
    ["L", "◀", BIT.L], ["R", "▶", BIT.R], ["U", "▲", BIT.U], ["B", "🛡", BIT.B],
    ["A", "A", BIT.A], ["H", "B", BIT.H], ["S", "★", BIT.S],
  ];

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };

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
    const banner = el("div", "bw-banner");
    arena.append(el("div", "bw-bg"), stage, hud, banner);

    const bars = players.map((player, side) => {
      const wrap = el("div", "bw-bar " + (side ? "right" : "left"));
      const name = el("span", "bw-name", player.name + (side === mySide ? " (you)" : ""));
      const race = el("span", "bw-race", BrawlRaces.RACES[player.race]?.name || "Pixie");
      const hp = el("div", "bw-hp");
      const trail = el("i", "bw-trail");
      const fill = el("i", "bw-fill");
      hp.append(trail, fill);
      const meter = el("div", "bw-meter");
      const meterFill = el("i");
      meter.append(meterFill);
      const special = el("span", "bw-special", BrawlRaces.specialOf(player.race).name);
      const pips = el("div", "bw-pips");
      pips.append(el("b"), el("b"));
      wrap.append(name, race, hp, meter, special, pips);
      return { wrap, fill, trail, meterFill, pips, special, hpShown: 1 };
    });
    const clock = el("div", "bw-clock", "60");
    hud.append(bars[0].wrap, clock, bars[1].wrap);

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
    const state = { last: null, shake: 0, phase: "", bannerUntil: 0 };

    // touch buttons, hidden unless the device has a touchscreen
    const pad = el("div", "bw-touch");
    for (const [name, label, bit] of TOUCH) {
      const button = el("button", "bw-btn bw-btn-" + name, label);
      button.type = "button";
      button.setAttribute("aria-label", name);
      const press = (down) => (event) => {
        event.preventDefault();
        onInput?.(bit, down);
        button.classList.toggle("down", down);
      };
      button.addEventListener("pointerdown", press(true));
      for (const type of ["pointerup", "pointercancel", "pointerleave"]) button.addEventListener(type, press(false));
      pad.append(button);
    }
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

    function fx(events) {
      for (const e of events) {
        if (e.k === "hit" || e.k === "armor") {
          spawn(e.big ? "spark big" : "spark", e.x, e.y, "", 320);
          spawn("dmg", e.x, e.y - 20, String(e.d), 700);
          if (e.big) state.shake = 9;
          else state.shake = Math.max(state.shake, 3);
        } else if (e.k === "block") spawn("spark blocked", e.x, e.y, "", 260);
        else if (e.k === "burst") spawn("ring", e.x, e.y, "", 420, { width: e.r * 2 + "px", height: e.r * 0.8 + "px" });
        else if (e.k === "shoot") spawn("puff", e.x, e.y, "", 300);
        else if (e.k === "vanish" || e.k === "appear") spawn("smoke", e.x, e.y, "", 500);
        else if (e.k === "buff") spawn("aura", e.x, e.y, "", 800);
        else if (e.k === "flap") spawn("feather", e.x, e.y, "", 400);
        else if (e.k === "ko") state.shake = 14;
      }
    }

    function showBanner(text, ms) {
      banner.textContent = text;
      banner.classList.toggle("show", Boolean(text));
      state.bannerUntil = ms ? performance.now() + ms : 0;
    }

    function render(s, name) {
      state.last = s;
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
        bar.meterFill.style.width = f.meter + "%";
        bar.wrap.classList.toggle("ready", f.meter >= BrawlSim.SPECIAL_COST);
        bar.pips.children[0].classList.toggle("on", s.wins[side] >= 1);
        bar.pips.children[1].classList.toggle("on", s.wins[side] >= 2);
      });
      clock.textContent = s.phase === "fight" || s.phase === "roundend" ? String(Math.max(0, Math.ceil(s.timer / 60))) : "";
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
        if (s.phase === "intro") showBanner(`ROUND ${s.round}`, 0);
        else if (s.phase === "roundend") showBanner(s.rw < 0 ? "DRAW" : "K.O.", 0);
        else if (s.phase === "matchend") showBanner(`${players[s.winner]?.name || "Nobody"} wins!`, 0);
        else if (s.phase === "fight") showBanner("FIGHT!", 700);
      }
      if (state.bannerUntil && performance.now() > state.bannerUntil) showBanner("", 0);
      if (state.shake > 0.3) {
        arena.style.translate = `${(Math.random() - 0.5) * state.shake}px ${(Math.random() - 0.5) * state.shake}px`;
        state.shake *= 0.82;
      } else arena.style.translate = "";
    }

    return {
      render,
      fx,
      banner: showBanner,
      destroy() {
        observer.disconnect();
        container.replaceChildren();
      },
    };
  }

  window.BrawlView = { create };
})();
