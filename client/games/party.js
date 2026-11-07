// Pixel Party: a Mario-Party-ish round of short minigames for up to 8 people (or you + bots).
// The top half of this file is pure (no DOM) so node tests can run it; the browser half starts at "browser".
// Every minigame is scored on its own with the same seed for everybody, so the only thing that crosses
// the wire is "round X starts", "my score was Y" and "here are the standings". The host runs those three.
(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.PixelParty = api;
})(typeof self !== "undefined" ? self : this, function (root) {
  // ------------------------------------------------------------------ pure core
  const ROUNDS = 8;
  const INTRO_MS = 3000; // the 3-2-1 before every game
  const BETWEEN_MS = 5000; // standings screen
  const GRACE_MS = 4000; // how long the host waits for a slow client after the game should be over
  const POINTS = [10, 8, 6, 5, 4, 3, 2, 1]; // by place
  const BOT_NAMES = ["Bleep", "Bloop", "Zorp", "Pixel Pete", "Glitch", "Turbo", "Moss"];

  // range is what a bot's score lands in (low = bad day, high = great day), also used to size progress bars
  const GAMES = [
    { id: "reaction", title: "Quick Draw", hint: "Tap the moment it turns green. Too early scores zero.", secs: 25, range: [1800, 4300] },
    { id: "memory", title: "Simon Says", hint: "Repeat the flashing pads. Keys 1-4 or click.", secs: 40, range: [200, 900] },
    { id: "dodge", title: "Block Dodge", hint: "Slide left and right. Don't get squashed.", secs: 30, range: [900, 3000] },
    { id: "mash", title: "Button Masher", hint: "Mash anything as fast as you can!", secs: 14, range: [35, 85] },
    { id: "colors", title: "Ink Match", hint: "Pick the INK colour, not the word. Keys 1-4.", secs: 22, range: [100, 260] },
    { id: "tug", title: "Tug of War", hint: "Alternate LEFT and RIGHT. Same side twice does nothing.", secs: 14, range: [30, 70] },
    { id: "bomb", title: "Bomb Relay", hint: "Pass the bomb to the lit seat (keys 1-6) before it blows.", secs: 30, range: [500, 1800] },
    { id: "sumo", title: "Sumo Bumpers", hint: "Stay on the shrinking ring. Dodge the bumpers.", secs: 30, range: [800, 3000] },
    { id: "coins", title: "Coin Rush", hint: "Grab coins. Arrows/WASD or hold the pointer.", secs: 20, range: [100, 230] },
    { id: "timing", title: "Dead Center", hint: "Stop the slider in the middle. Six tries.", secs: 25, range: [300, 560] },
  ];
  const byId = (id) => GAMES.find((g) => g.id === id);

  // small fast seeded rng, the same one on every client
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

  // shuffled without repeats; with 10 games and 8 rounds nothing shows up twice
  function planRounds(seed, count = ROUNDS) {
    const rng = mulberry32(seed);
    const pool = GAMES.map((g) => g.id);
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const order = [];
    while (order.length < count) order.push(...pool.slice(0, count - order.length));
    return order;
  }

  // {id: score} (higher wins) -> {id: points}. ties share the better place's points
  function pointsFor(scores) {
    const ids = Object.keys(scores).sort((a, b) => scores[b] - scores[a]);
    const out = {};
    let place = 0;
    ids.forEach((id, i) => {
      if (i > 0 && scores[id] !== scores[ids[i - 1]]) place = i;
      out[id] = POINTS[Math.min(place, POINTS.length - 1)];
    });
    return out;
  }

  // skill 0..1 picks where in the game's range a bot lands, with some noise
  function botScore(gameId, rng, skill) {
    const [lo, hi] = byId(gameId).range;
    const roll = Math.min(1, Math.max(0, skill * 0.7 + rng() * 0.45));
    return Math.round(lo + (hi - lo) * roll);
  }

  function ranking(players, totals) {
    const rows = players.map((p) => ({ id: p.id, name: p.name, bot: !!p.bot, left: !!p.left, total: totals[p.id] || 0 }));
    rows.sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));
    let place = 0;
    rows.forEach((r, i) => {
      if (i > 0 && r.total !== rows[i - 1].total) place = i;
      r.place = place + 1;
    });
    return rows;
  }

  const defaultClock = () => ({ setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (t) => clearTimeout(t) });

  // One party as seen from one client. Wire it to GameNet like:
  //   const s = createSession({ hooks }); const net = GameNet.connect("party", code, s.handlers); s.attach(net);
  // hooks (all optional): lobby(), partyStart(snap), startRound(info), progress(id, v), roundEnd(info), final(info), busy(), reset(), closed()
  function createSession({ clock = defaultClock(), hooks = {}, rounds = ROUNDS, between = BETWEEN_MS, grace = GRACE_MS, rand = Math.random } = {}) {
    let net = null;
    let wasHost = false;
    let deadline = null;
    let advanceTimer = null;
    let myAvatar = null;
    const st = { phase: "lobby", seed: 0, order: [], round: -1, done: -1, players: [], totals: {}, scores: {}, mine: {}, avatars: {} };
    const call = (name, ...args) => hooks[name]?.(...args);
    const amHost = () => !!net && net.isHost();
    const later = (fn, ms) => clock.setTimeout(fn, ms);
    const clearAll = () => {
      clock.clearTimeout(deadline);
      clock.clearTimeout(advanceTimer);
    };
    const snap = () => ({ phase: st.phase, players: st.players, order: st.order, round: st.round, totals: st.totals, avatars: st.avatars });
    const cast = (data) => {
      net.send(data);
      handle(net.id, data, true); // the relay never echoes, so the sender applies its own broadcast
    };

    function advance() {
      if (!amHost()) return;
      const next = st.round + 1;
      if (next >= st.order.length) cast({ k: "final" });
      else cast({ k: "round", i: next, game: st.order[next] });
    }

    function armDeadline() {
      clock.clearTimeout(deadline);
      deadline = later(finishRound, INTRO_MS + byId(st.order[st.round]).secs * 1000 + grace);
    }

    const expected = () => st.players.filter((p) => !p.bot && !p.left);
    function checkDone() {
      if (st.phase === "round" && expected().every((p) => st.scores[p.id] != null)) finishRound();
    }

    function finishRound() {
      if (!amHost() || st.phase !== "round") return;
      clock.clearTimeout(deadline);
      const i = st.round;
      const game = st.order[i];
      const scores = {};
      let botNo = 0;
      for (const p of st.players) {
        if (p.left) continue;
        if (p.bot) {
          scores[p.id] = botScore(game, mulberry32(st.seed * 31 + i * 977 + botNo), 0.25 + 0.12 * botNo);
          botNo++;
        } else scores[p.id] = st.scores[p.id] ?? 0;
      }
      cast({ k: "standings", i, scores, gained: pointsFor(scores) });
      advanceTimer = later(advance, between);
    }

    function handle(from, d, local) {
      if (!d || typeof d.k !== "string") return;
      // only the current host may steer the party
      const fromHost = local || from === net?.host();
      switch (d.k) {
        case "me":
          st.avatars[from] = d.avatar;
          call("lobby");
          break;
        case "start":
          if (!fromHost) break;
          clearAll();
          st.seed = d.seed >>> 0;
          st.order = planRounds(st.seed, rounds);
          st.players = d.players.map((p) => ({ ...p }));
          st.totals = Object.fromEntries(st.players.map((p) => [p.id, 0]));
          st.round = -1;
          st.done = -1;
          st.mine = {};
          st.scores = {};
          st.phase = "between";
          call("partyStart", snap());
          break;
        case "round":
          if (!fromHost || st.phase === "lobby" || st.phase === "final" || d.i <= st.round) break;
          st.round = d.i;
          st.phase = "round";
          st.scores = {};
          call("startRound", { i: d.i, total: st.order.length, game: byId(d.game), seed: (st.seed + d.i * 7919) >>> 0, players: st.players, avatars: st.avatars });
          if (amHost()) armDeadline();
          break;
        case "res":
          if (!amHost() || d.i !== st.round || st.phase !== "round") break;
          if (st.players.some((p) => p.id === from && !p.bot) && typeof d.score === "number") st.scores[from] = Math.max(0, d.score);
          checkDone();
          break;
        case "prog":
          if (d.i === st.round) call("progress", from, d.v);
          break;
        case "standings":
          if (!fromHost || d.i <= st.done) break;
          st.done = d.i;
          st.phase = "between";
          for (const id of Object.keys(d.gained)) st.totals[id] = (st.totals[id] || 0) + d.gained[id];
          call("roundEnd", { i: d.i, total: st.order.length, game: byId(st.order[d.i]), scores: d.scores, gained: d.gained, totals: st.totals, players: st.players, avatars: st.avatars, last: d.i >= st.order.length - 1 });
          break;
        case "final":
          if (!fromHost || st.phase === "final" || st.phase === "lobby") break;
          st.phase = "final";
          call("final", { ranking: ranking(st.players, st.totals), totals: st.totals, rounds: st.order.length, avatars: st.avatars });
          break;
        case "lobby":
          if (!fromHost) break;
          clearAll();
          st.phase = "lobby";
          st.round = -1;
          call("reset");
          call("lobby");
          break;
        case "resend": {
          // a new host lost whatever the old one had collected, so say it again
          const score = st.mine[d.i];
          if (fromHost && d.i === st.round && score != null && !amHost()) net.send({ k: "res", i: d.i, score }, net.host());
          break;
        }
        case "busy":
          call("busy");
          break;
      }
    }

    // oldest member is host. When that changes mid-party the new host picks up wherever things stand
    function syncHost() {
      const now = amHost();
      if (now && !wasHost && st.phase !== "lobby" && st.phase !== "final") {
        if (st.phase === "round") {
          st.scores = {};
          if (st.mine[st.round] != null) st.scores[net.id] = st.mine[st.round];
          net.send({ k: "resend", i: st.round });
          armDeadline();
          checkDone();
        } else {
          clock.clearTimeout(advanceTimer);
          advanceTimer = later(advance, between);
        }
      }
      wasHost = now;
    }

    const handlers = {
      onHello() {
        wasHost = amHost();
        if (myAvatar) net.send({ k: "me", avatar: myAvatar });
        call("lobby");
      },
      onJoin(player) {
        if (myAvatar) net.send({ k: "me", avatar: myAvatar }, player.id);
        if (amHost() && st.phase !== "lobby") net.send({ k: "busy" }, player.id);
        syncHost();
        call("lobby");
      },
      onLeave(id) {
        const p = st.players.find((x) => x.id === id);
        if (p) p.left = true;
        syncHost();
        if (amHost()) checkDone();
        call("lobby");
      },
      onMsg: (from, data) => handle(from, data, false),
      onClose: () => call("closed"),
    };

    return {
      handlers,
      state: st,
      get net() {
        return net;
      },
      attach(n) {
        net = n;
      },
      setAvatar(avatar) {
        myAvatar = avatar || null;
        if (net && net.id != null && myAvatar) {
          net.send({ k: "me", avatar: myAvatar });
          st.avatars[net.id] = myAvatar;
        }
      },
      // host only, from the lobby
      startParty(botCount = 0) {
        if (!amHost() || st.phase !== "lobby") return false;
        const players = net.players().map((p) => ({ id: p.id, name: p.username }));
        for (let b = 0; b < botCount && players.length < 8; b++) players.push({ id: "bot:" + b, name: BOT_NAMES[b % BOT_NAMES.length], bot: true });
        cast({ k: "start", seed: Math.floor(rand() * 4294967296), players });
        advanceTimer = later(advance, 1500);
        return true;
      },
      // the game finished with this score
      report(score) {
        const i = st.round;
        if (st.phase !== "round" || st.mine[i] != null) return;
        st.mine[i] = Math.max(0, Math.round(score));
        if (amHost()) {
          st.scores[net.id] = st.mine[i];
          checkDone();
        } else net.send({ k: "res", i, score: st.mine[i] }, net.host());
      },
      progress(v) {
        if (st.phase === "round") net.send({ k: "prog", i: st.round, v });
      },
      // host only, after the podium
      backToLobby() {
        if (amHost() && st.phase === "final") cast({ k: "lobby" });
      },
      destroy() {
        clearAll();
      },
    };
  }

  // a room of one, so solo practice runs through the exact same code as an online party
  function loopNet(handlers, me, clock = defaultClock()) {
    const net = {
      id: me.id,
      host: () => me.id,
      isHost: () => true,
      players: () => [{ id: me.id, username: me.username }],
      send: () => {},
      close: () => {},
    };
    clock.setTimeout(() => handlers.onHello?.({ id: me.id, host: me.id, players: net.players() }), 0);
    return net;
  }

  const core = { ROUNDS, INTRO_MS, BETWEEN_MS, GRACE_MS, POINTS, GAMES, byId, mulberry32, planRounds, pointsFor, botScore, ranking, createSession, loopNet };
  if (!root.document || !root.ArcadeGames) return core;

  // ------------------------------------------------------------------ browser
  const W = 480;
  const H = 300;
  const ICON = (() => {
    // 12x12 die in party pink, drawn as svg rects so there is no extra file to load
    const map = ["............", ".PPPPPPPPPP.", ".PWWWWWWWWP.", ".PWKWWWWKWP.", ".PWWWWWWWWP.", ".PWWWKKWWWP.", ".PWWWKKWWWP.", ".PWWWWWWWWP.", ".PWKWWWWKWP.", ".PWWWWWWWWP.", ".PPPPPPPPPP.", "............"];
    const col = { P: "#ff5fb0", W: "#fff4c2", K: "#3b1a6e" };
    let rects = "";
    map.forEach((row, y) => [...row].forEach((c, x) => { if (col[c]) rects += `<rect x='${x}' y='${y}' width='1' height='1' fill='${col[c]}'/>`; }));
    return "data:image/svg+xml;utf8," + encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='48' height='48' viewBox='0 0 12 12' shape-rendering='crispEdges'>${rects}</svg>`);
  })();

  // ---- avatars: stack the equipped layer pngs into one small canvas per player, blob while loading
  const LAYERS = ["extra", "body", "ears", "head", "chest", "eyes", "hair", "fit"];
  const sprites = new Map();
  function hueOf(text) {
    let h = 0;
    for (const c of String(text)) h = (h * 31 + c.charCodeAt(0)) % 360;
    return h;
  }
  function spriteFor(id, avatar) {
    const key = id + "|" + (avatar?.layers?.body || "");
    if (sprites.has(key)) return sprites.get(key);
    const entry = { canvas: null };
    sprites.set(key, entry);
    const sources = LAYERS.map((l) => avatar?.layers?.[l]).filter(Boolean);
    if (!sources.length) return entry;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 64;
    const g = canvas.getContext("2d");
    g.imageSmoothingEnabled = false;
    Promise.all(sources.map((src) => new Promise((ok) => { const img = new Image(); img.onload = () => ok(img); img.onerror = () => ok(null); img.src = src; }))).then((imgs) => {
      let any = false;
      for (const img of imgs) {
        if (!img) continue;
        const k = Math.min(64 / img.width, 64 / img.height);
        g.drawImage(img, (64 - img.width * k) / 2, 64 - img.height * k, img.width * k, img.height * k);
        any = true;
      }
      if (any) entry.canvas = canvas;
    });
    return entry;
  }

  // x,y is where the feet are
  function drawAvatar(g, who, x, y, size, flip) {
    const entry = spriteFor(who.id, who.avatar);
    if (entry.canvas) {
      g.save();
      g.translate(x, y);
      if (flip) g.scale(-1, 1);
      g.imageSmoothingEnabled = false;
      g.drawImage(entry.canvas, -size / 2, -size, size, size);
      g.restore();
    } else {
      g.fillStyle = `hsl(${hueOf(who.name)} 70% 60%)`;
      g.fillRect(x - size / 3, y - size * 0.7, size * 0.66, size * 0.7);
      g.fillStyle = "#1a0b3a";
      g.fillRect(x - size / 6, y - size * 0.5, size / 12 + 1, size / 8 + 1);
      g.fillRect(x + size / 12, y - size * 0.5, size / 12 + 1, size / 8 + 1);
    }
  }

  function text(g, str, x, y, size = 14, color = "#fff", align = "center") {
    g.font = `bold ${size}px monospace`;
    g.textAlign = align;
    g.textBaseline = "middle";
    g.fillStyle = color;
    g.fillText(str, x, y);
  }

  // ---- the minigames. PLAY[id](env) -> { update(dt), draw(g), score() }, call env.finish(score) when done.
  // update runs at a fixed 60/s from a seeded rng so the challenge is identical for everybody
  const PADS = ["#e8454b", "#4b8cf0", "#46c46a", "#f2c63b"];
  const DIGITS = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6"];
  const inRect = (e, r) => e.x >= r.x && e.x <= r.x + r.w && e.y >= r.y && e.y <= r.y + r.h;
  const PLAY = {
    reaction(env) {
      let trial = 0, total = 0, phase = "wait", t = 0, msg = "";
      const delay = () => 1.2 + env.rng() * 2.2;
      let wait = delay();
      const result = (pts, label) => { total += pts; trial++; msg = label; phase = "show"; t = 0; };
      return {
        score: () => total,
        update(dt) {
          t += dt;
          const tap = env.input.tap();
          if (phase === "wait") {
            if (tap) result(0, "Too early!");
            else if (t >= wait) { phase = "go"; t = 0; }
          } else if (phase === "go") {
            if (tap) result(Math.max(0, Math.round(1000 - t * 1000)), Math.round(t * 1000) + " ms");
            else if (t > 1) result(0, "Too slow");
          } else if (t >= 1) {
            if (trial >= 5) env.finish(total);
            else { phase = "wait"; t = 0; wait = delay(); }
          }
        },
        draw(g) {
          g.fillStyle = phase === "go" ? "#2fbf5f" : phase === "show" ? "#3b2a78" : "#b8323c";
          g.fillRect(40, 60, W - 80, 150);
          text(g, phase === "go" ? "TAP!" : phase === "show" ? msg : "wait for it...", W / 2, 135, 32);
          text(g, `try ${Math.min(trial + 1, 5)}/5   points ${total}`, W / 2, 235, 14, "#d9ccff");
        },
      };
    },

    memory(env) {
      const seq = [];
      let phase = "show", t = 0, pos = 0, lit = -1, done = 0;
      const next = () => { seq.push(Math.floor(env.rng() * 4)); phase = "show"; t = -0.6; pos = 0; };
      next();
      const rect = (p) => ({ x: 120 + (p % 2) * 125, y: 40 + Math.floor(p / 2) * 105, w: 115, h: 95 });
      return {
        score: () => done * 100,
        update(dt) {
          t += dt;
          if (phase === "show") {
            lit = t > 0 && t % 0.7 < 0.45 ? seq[Math.floor(t / 0.7)] : -1;
            if (t / 0.7 >= seq.length) { phase = "input"; lit = -1; }
            return;
          }
          if (phase === "dead") { if (t > 0.8) env.finish(done * 100); return; }
          if (lit >= 0 && t > 0.25) lit = -1;
          const e = env.input.pressed(...DIGITS.slice(0, 4), "Pointer");
          if (!e) return;
          let pad = DIGITS.indexOf(e.code);
          if (e.code === "Pointer") pad = [0, 1, 2, 3].find((p) => inRect(e, rect(p))) ?? -1;
          if (pad < 0 || pad > 3) return;
          lit = pad;
          t = 0;
          if (pad !== seq[pos]) { phase = "dead"; return; }
          if (++pos === seq.length) { done++; next(); }
        },
        draw(g) {
          for (let p = 0; p < 4; p++) {
            const r = rect(p);
            g.globalAlpha = lit === p ? 1 : 0.35;
            g.fillStyle = PADS[p];
            g.fillRect(r.x, r.y, r.w, r.h);
            g.globalAlpha = 1;
            text(g, String(p + 1), r.x + r.w / 2, r.y + r.h / 2, 22, "#fff");
          }
          text(g, phase === "show" ? "watch..." : phase === "dead" ? "oops!" : "your turn", W / 2, 265, 16, "#d9ccff");
        },
      };
    },

    dodge(env) {
      const me = { x: W / 2, y: 262 };
      const blocks = [];
      let t = 0, spawn = 0.4, dead = false;
      return {
        score: () => Math.floor(t * 100),
        update(dt) {
          if (dead) return;
          t += dt;
          const steer = env.input.steer(me.x, me.y);
          me.x = Math.min(W - 14, Math.max(14, me.x + steer.x * 220 * dt));
          if ((spawn -= dt) <= 0) {
            spawn = Math.max(0.2, 0.55 - t * 0.01);
            blocks.push({ x: env.rng() * (W - 50), y: -30, w: 22 + env.rng() * 30, h: 22 + env.rng() * 14, v: 130 + t * 5 + env.rng() * 70 });
          }
          for (const b of blocks) {
            b.y += b.v * dt;
            if (b.y + b.h > me.y - 28 && b.y < me.y && b.x + b.w > me.x - 10 && b.x < me.x + 10) dead = true;
          }
          while (blocks.length && blocks[0].y > H + 40) blocks.shift();
          if (dead) env.finish(Math.floor(t * 100));
        },
        draw(g) {
          g.fillStyle = "#6a4ab8";
          g.fillRect(0, me.y, W, 6);
          g.fillStyle = "#ff8a3d";
          for (const b of blocks) g.fillRect(b.x, b.y, b.w, b.h);
          env.avatar(g, "me", me.x, me.y, 40, dead);
          text(g, t.toFixed(1) + "s", 40, 24, 16, "#fff");
        },
      };
    },

    mash(env) {
      let t = 0, taps = 0;
      return {
        score: () => taps,
        update(dt) {
          t += dt;
          taps += Math.min(env.input.edges.length, 2); // capped so held-key tricks don't win
          if (t >= 12) env.finish(taps);
        },
        draw(g) {
          const bounce = taps % 2 ? 6 : 0;
          env.avatar(g, "me", W / 2, 190 - bounce, 100);
          text(g, String(taps), W / 2, 60, 44, "#ffd54a");
          text(g, `${Math.max(0, 12 - t).toFixed(1)}s`, W / 2, 230, 14, "#d9ccff");
        },
      };
    },

    colors(env) {
      const names = ["RED", "BLUE", "GREEN", "YELLOW"];
      let t = 0, right = 0, wrong = 0, flash = 0, word = 0, ink = 0;
      const roll = () => { word = Math.floor(env.rng() * 4); ink = env.rng() < 0.7 ? Math.floor(env.rng() * 4) : word; };
      roll();
      const btn = (i) => ({ x: 30 + i * 112, y: 220, w: 100, h: 50 });
      const score = () => Math.max(0, right * 10 - wrong * 10);
      return {
        score,
        update(dt) {
          t += dt;
          flash = Math.max(0, flash - dt);
          const e = env.input.pressed(...DIGITS.slice(0, 4), "Pointer");
          if (e) {
            let pick = DIGITS.indexOf(e.code);
            if (e.code === "Pointer") pick = [0, 1, 2, 3].find((i) => inRect(e, btn(i))) ?? -1;
            if (pick >= 0 && pick < 4) {
              if (pick === ink) right++;
              else { wrong++; flash = 0.25; }
              roll();
            }
          }
          if (t >= 20) env.finish(score());
        },
        draw(g) {
          if (flash > 0) { g.fillStyle = "rgba(255,0,0,.25)"; g.fillRect(0, 0, W, H); }
          text(g, names[word], W / 2, 120, 54, PADS[ink]);
          for (let i = 0; i < 4; i++) {
            const b = btn(i);
            g.fillStyle = PADS[i];
            g.fillRect(b.x, b.y, b.w, b.h);
            text(g, `${i + 1} ${names[i]}`, b.x + b.w / 2, b.y + b.h / 2, 13, "#1a0b3a");
          }
          text(g, `${right} right  ${wrong} wrong`, W / 2, 40, 14, "#d9ccff");
        },
      };
    },

    tug(env) {
      let t = 0, pulls = 0, last = "";
      const side = (e) => (e.code === "ArrowLeft" || e.code === "KeyA" ? "L" : e.code === "ArrowRight" || e.code === "KeyD" ? "R" : e.code === "Pointer" ? (e.x < W / 2 ? "L" : "R") : "");
      return {
        score: () => pulls,
        update(dt) {
          t += dt;
          for (const e of env.input.edges) {
            const s = side(e);
            if (s && s !== last) { pulls++; last = s; }
          }
          if (t >= 12) env.finish(pulls);
        },
        draw(g) {
          const rope = 0.5 + Math.max(-0.4, Math.min(0.4, (pulls - env.avgOthers()) / 100));
          const x = 40 + rope * (W - 80);
          g.fillStyle = "#c9a36a";
          g.fillRect(40, 148, W - 80, 8);
          g.fillStyle = "#ff3d6e";
          g.fillRect(W / 2 - 2, 130, 4, 44);
          g.fillStyle = "#fff";
          g.fillRect(x - 6, 140, 12, 24);
          env.avatar(g, "me", x - 40, 160, 56);
          text(g, `${pulls} pulls   ${Math.max(0, 12 - t).toFixed(0)}s`, W / 2, 50, 18, "#ffd54a");
          text(g, last === "L" ? "now RIGHT" : "now LEFT", W / 2, 240, 16, "#d9ccff");
        },
      };
    },

    bomb(env) {
      let passes = 0, holder = 0, target = 1, left = 1.6, full = 1.6, boom = 0;
      const seat = (i) => ({ x: W / 2 + Math.sin((i / 6) * Math.PI * 2 + Math.PI) * 130, y: 150 - Math.cos((i / 6) * Math.PI * 2 + Math.PI) * 85 });
      const pickTarget = () => {
        do target = Math.floor(env.rng() * 6); while (target === holder);
        full = left = Math.max(0.5, 1.7 - passes * 0.09);
      };
      pickTarget();
      return {
        score: () => passes * 100,
        update(dt) {
          if (boom) { if ((boom += dt) > 2.8) env.finish(passes * 100); return; }
          left -= dt;
          const e = env.input.pressed(...DIGITS, "Pointer");
          if (e) {
            let pick = DIGITS.indexOf(e.code);
            if (e.code === "Pointer") pick = [0, 1, 2, 3, 4, 5].find((i) => Math.hypot(seat(i).x - e.x, seat(i).y - e.y) < 32) ?? -1;
            if (pick === target) { passes++; holder = target; pickTarget(); }
            else if (pick >= 0) boom = 1;
          }
          if (left <= 0) boom = 1;
        },
        draw(g) {
          for (let i = 0; i < 6; i++) {
            const s = seat(i);
            g.fillStyle = i === target && !boom ? "#ffd54a" : "#3b2a78";
            g.beginPath(); g.arc(s.x, s.y, 26, 0, 7); g.fill();
            env.avatar(g, i === 0 ? "me" : "npc" + i, s.x, s.y + 16, 36);
            text(g, String(i + 1), s.x, s.y + 38, 12, "#fff");
          }
          const h = seat(holder);
          g.fillStyle = boom ? "#ff3d3d" : "#111";
          g.beginPath(); g.arc(h.x, h.y - 30, boom ? 30 : 11, 0, 7); g.fill();
          if (!boom) {
            g.fillStyle = "#46c46a";
            g.fillRect(40, 20, (W - 80) * Math.max(0, left / full), 8);
          }
          text(g, boom ? "BOOM" : `${passes} passes`, W / 2, 285, 16, "#ffd54a");
        },
      };
    },

    sumo(env) {
      const C = { x: W / 2, y: 150 };
      const me = { x: C.x, y: C.y, vx: 0, vy: 0 };
      const bumpers = [0, 1, 2].map(() => {
        const a = env.rng() * 6.28, s = 70 + env.rng() * 50;
        return { x: C.x + Math.cos(a) * 70, y: C.y + Math.sin(a) * 50, vx: Math.cos(a + 2) * s, vy: Math.sin(a + 2) * s };
      });
      let t = 0, dead = false;
      const ring = () => Math.max(55, 128 - t * 2.4);
      return {
        score: () => Math.floor(t * 100),
        update(dt) {
          if (dead) return;
          t += dt;
          const s = env.input.steer(me.x, me.y);
          const drag = Math.pow(0.9, (dt * 60) / 4);
          me.vx = (me.vx + s.x * 520 * dt) * drag;
          me.vy = (me.vy + s.y * 520 * dt) * drag;
          me.x += me.vx * dt;
          me.y += me.vy * dt;
          for (const b of bumpers) {
            b.x += b.vx * dt;
            b.y += b.vy * dt;
            const bx = b.x - C.x, by = b.y - C.y, d = Math.hypot(bx, by);
            if (d > 135) { // bounce off the invisible wall
              const nx = bx / d, ny = by / d, dot = b.vx * nx + b.vy * ny;
              b.vx -= 2 * dot * nx; b.vy -= 2 * dot * ny;
              b.x = C.x + nx * 135; b.y = C.y + ny * 135;
            }
            const dx = me.x - b.x, dy = me.y - b.y, dist = Math.hypot(dx, dy) || 1;
            if (dist < 26) {
              me.vx += (dx / dist) * 260; me.vy += (dy / dist) * 260;
              b.vx = -b.vx; b.vy = -b.vy;
              b.x -= (dx / dist) * 4; b.y -= (dy / dist) * 4;
            }
          }
          if (Math.hypot(me.x - C.x, me.y - C.y) > ring() + 6) { dead = true; env.finish(Math.floor(t * 100)); }
        },
        draw(g) {
          g.fillStyle = "#4a2f93";
          g.beginPath(); g.arc(C.x, C.y, ring(), 0, 7); g.fill();
          g.strokeStyle = "#ffd54a"; g.lineWidth = 3; g.stroke();
          for (const b of bumpers) { g.fillStyle = "#ff3d6e"; g.beginPath(); g.arc(b.x, b.y, 13, 0, 7); g.fill(); }
          env.avatar(g, "me", me.x, me.y + 18, 40, me.vx < 0);
          text(g, t.toFixed(1) + "s", 40, 24, 16, "#fff");
        },
      };
    },

    coins(env) {
      const spots = [];
      for (let i = 0; i < 300; i++) spots.push({ x: 30 + env.rng() * (W - 60), y: 60 + env.rng() * (H - 100) });
      const live = [0, 1, 2];
      let nextIdx = 3, got = 0, t = 0;
      const me = { x: W / 2, y: H / 2 };
      return {
        score: () => got * 10,
        update(dt) {
          t += dt;
          const s = env.input.steer(me.x, me.y);
          me.x = Math.min(W - 10, Math.max(10, me.x + s.x * 160 * dt));
          me.y = Math.min(H - 10, Math.max(40, me.y + s.y * 160 * dt));
          live.forEach((k, slot) => {
            if (Math.hypot(spots[k].x - me.x, spots[k].y - (me.y - 14)) < 24) { got++; live[slot] = nextIdx++; }
          });
          if (t >= 20) env.finish(got * 10);
        },
        draw(g) {
          g.fillStyle = "#ffd54a";
          for (const k of live) { g.beginPath(); g.arc(spots[k].x, spots[k].y, 8 + Math.sin(t * 8 + k) * 1.5, 0, 7); g.fill(); }
          env.avatar(g, "me", me.x, me.y, 40);
          text(g, `${got} coins   ${Math.max(0, 20 - t).toFixed(0)}s`, W / 2, 20, 16, "#fff");
        },
      };
    },

    timing(env) {
      let t = env.rng() * 6.28, tries = 0, total = 0, phase = "run", hold = 0, shown = 0, speed = 2.6;
      const pos = () => 0.5 + 0.5 * Math.sin(t);
      return {
        score: () => total,
        update(dt) {
          if (phase === "run") {
            t += dt * speed;
            if (env.input.tap()) {
              shown = Math.max(0, Math.round(100 - Math.abs(pos() - 0.5) * 400));
              total += shown; tries++; phase = "hold"; hold = 0.8; speed += 0.5 + env.rng() * 0.4;
            }
          } else if ((hold -= dt) <= 0) {
            if (tries >= 6) env.finish(total); else phase = "run";
          }
        },
        draw(g) {
          g.fillStyle = "#3b2a78"; g.fillRect(40, 140, W - 80, 24);
          g.fillStyle = "#46c46a"; g.fillRect(W / 2 - 10, 134, 20, 36);
          g.fillStyle = "#fff"; g.fillRect(40 + pos() * (W - 80) - 4, 126, 8, 52);
          text(g, phase === "hold" ? `+${shown}` : "tap to stop", W / 2, 100, 22, "#ffd54a");
          text(g, `try ${Math.min(tries + 1, 6)}/6   ${total}`, W / 2, 220, 16, "#d9ccff");
        },
      };
    },
  };

  // ---- input shared by every minigame
  function makeInput(canvas) {
    const held = new Set();
    const input = { edges: [], pointer: { x: W / 2, y: H / 2, down: false } };
    const at = (e) => {
      const r = canvas.getBoundingClientRect();
      return { x: ((e.clientX - r.left) * W) / r.width, y: ((e.clientY - r.top) * H) / r.height };
    };
    const onKey = (down) => (e) => {
      if (!document.body.contains(canvas) || /INPUT|TEXTAREA/.test(e.target.tagName)) return;
      if (/^(Arrow|Space|Digit|Key[A-Z]$)/.test(e.code)) e.preventDefault();
      if (!down) held.delete(e.code);
      else if (!e.repeat) { held.add(e.code); input.edges.push({ code: e.code }); }
    };
    const kd = onKey(true), ku = onKey(false);
    const pd = (e) => { const p = at(e); Object.assign(input.pointer, p, { down: true }); input.edges.push({ code: "Pointer", ...p }); };
    const pm = (e) => Object.assign(input.pointer, at(e));
    const pu = () => { input.pointer.down = false; };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    window.addEventListener("pointerup", pu);
    canvas.addEventListener("pointerdown", pd);
    canvas.addEventListener("pointermove", pm);
    input.pressed = (...codes) => input.edges.find((e) => codes.includes(e.code)) || null;
    input.tap = () => !!input.pressed("Space", "Enter", "Pointer");
    // direction from arrows/WASD, or toward the pointer while it is held
    input.steer = (px, py) => {
      let x = (held.has("ArrowRight") || held.has("KeyD") ? 1 : 0) - (held.has("ArrowLeft") || held.has("KeyA") ? 1 : 0);
      let y = (held.has("ArrowDown") || held.has("KeyS") ? 1 : 0) - (held.has("ArrowUp") || held.has("KeyW") ? 1 : 0);
      if (!x && !y && input.pointer.down) {
        const dx = input.pointer.x - px, dy = input.pointer.y - py, d = Math.hypot(dx, dy);
        if (d > 8) { x = dx / d; y = dy / d; }
      }
      return { x, y };
    };
    input.destroy = () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
      window.removeEventListener("pointerup", pu);
    };
    return input;
  }

  // ---- the arcade window
  core.PLAY = PLAY; // exposed so a headless smoke test can run every minigame
  root.ArcadeGames.register({
    id: "party",
    title: "Pixel Party",
    blurb: "8 rounds of minigames. Up to 8 players, or practice against bots.",
    icon: ICON,
    mount(host, ctx) {
      host.classList.add("party");
      const el = (tag, cls, txt) => { const n = document.createElement(tag); if (cls) n.className = cls; if (txt !== undefined) n.textContent = txt; return n; };
      const button = (label, fn) => { const b = el("button", "party-btn", label); b.type = "button"; b.addEventListener("click", fn); return b; };

      const menu = el("div", "party-panel");
      const lobby = el("div", "party-panel");
      const stage = el("div", "party-stage");
      const canvas = el("canvas", "party-canvas");
      canvas.width = W;
      canvas.height = H;
      const g = canvas.getContext("2d");
      g.imageSmoothingEnabled = false;
      const after = el("div", "party-after");
      stage.append(canvas, after);
      host.append(menu, lobby, stage);
      const show = (which) => { menu.hidden = which !== menu; lobby.hidden = which !== lobby; stage.hidden = which !== stage; };

      const input = makeInput(canvas);
      let session = null, net = null, board = null, raf = 0, last = 0, acc = 0;
      let screen = "menu"; // menu | play | between | final
      let round = null, between = null, final = null;
      let solo = false, botCount = 3, lobbyCode = "";
      const progress = {};
      const who = (id) => {
        const p = session?.state.players.find((x) => x.id === id) || net?.players().map((q) => ({ id: q.id, name: q.username })).find((x) => x.id === id);
        return { id, name: p?.name || "?", avatar: session?.state.avatars[id] };
      };

      // ---------------- menu + lobby
      function drawMenu() {
        menu.replaceChildren(el("h2", "", "Pixel Party"), el("p", "", "Eight quick minigames. Win rounds, earn points, top the podium."));
        menu.append(button("Solo practice (vs bots)", () => begin(true)));
        const code = el("input", "party-code");
        code.maxLength = 4;
        code.placeholder = "CODE";
        const row = el("div", "party-row");
        row.append(code, button("Join room", () => code.value.trim().length === 4 && begin(false, code.value.trim().toUpperCase())));
        const letters = "ABCDEFGHJKLMNPQRSTUVWXYZ";
        menu.append(row, button("Create room", () => begin(false, Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join(""))));
        if (!ctx.me()) menu.append(el("p", "party-note", "Sign in to play online. Solo practice works as a guest."));
        show(menu);
      }

      function begin(isSolo, code) {
        if (!isSolo && !ctx.me()) return;
        teardownSession();
        solo = isSolo;
        const me = ctx.me() || { id: "guest", username: "You" };
        session = createSession({ hooks });
        net = isSolo ? loopNet(session.handlers, me) : ctx.net("party", code, session.handlers);
        session.attach(net);
        session.setAvatar(ctx.me()?.avatar);
        lobbyCode = code || "";
        show(lobby);
        drawLobby();
      }

      function drawLobby() {
        if (!net || !session || session.state.phase !== "lobby") return;
        lobby.replaceChildren(el("h2", "", solo ? "Solo practice" : `Room ${lobbyCode}`));
        if (!solo) lobby.append(el("p", "", "Share the code. Anyone with it can join (8 max)."));
        const list = el("ul", "party-list");
        for (const p of net.players()) list.append(el("li", "", p.username + (p.id === net.host() ? "  (host)" : "")));
        lobby.append(list);
        if (net.isHost()) {
          const row = el("label", "party-row", "Bots: ");
          const num = el("input", "party-code");
          num.type = "number"; num.min = solo ? 1 : 0; num.max = 7;
          num.value = solo ? Math.max(botCount, 1) : botCount;
          num.addEventListener("change", () => { botCount = Math.max(+num.min, Math.min(7, +num.value || 0)); });
          row.append(num);
          lobby.append(row, button("Start party", () => session.startParty(solo ? Math.max(botCount, 1) : botCount)));
        } else lobby.append(el("p", "party-note", "Waiting for the host to start..."));
        lobby.append(button("Leave", leave));
        show(lobby);
      }

      function leave() {
        teardownSession();
        drawMenu();
      }
      function teardownSession() {
        session?.destroy();
        net?.close();
        session = net = null;
        round = between = final = null;
        board?.destroy();
        board = null;
        screen = "menu";
        after.replaceChildren();
      }

      // ---------------- session hooks
      const hooks = {
        lobby: drawLobby,
        reset() { screen = "menu"; round = between = final = null; after.replaceChildren(); board?.destroy(); board = null; ctx.setTitle("Pixel Party"); },
        busy() { lobby.replaceChildren(el("h2", "", "Party in progress"), el("p", "", "This room is mid-game. You can join the next one."), button("Leave", leave)); show(lobby); },
        closed() { if (session) { teardownSession(); drawMenu(); menu.prepend(el("p", "party-note", "Disconnected from the room (it may be full or closed).")); } },
        partyStart() { screen = "between"; between = null; show(stage); },
        progress(id, v) { progress[id] = v; },
        startRound(info) { startRound(info); },
        roundEnd(info) { screen = "between"; between = { ...info, t0: performance.now() }; round = null; },
        final(info) { screen = "final"; final = info; round = null; finishParty(info); },
      };

      // ---------------- a round
      function startRound(info) {
        for (const k of Object.keys(progress)) delete progress[k];
        show(stage);
        screen = "play";
        const mine = who(net.id);
        const env = {
          rng: mulberry32(info.seed),
          input,
          avatar: (gg, key, x, y, size, flip) => drawAvatar(gg, key === "me" ? mine : { id: key, name: key, avatar: null }, x, y, size, flip),
          avgOthers: () => {
            const v = Object.entries(progress).filter(([id]) => id !== net.id).map(([, x]) => x * info.game.range[1]);
            return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
          },
          finish: (score) => {
            if (round && !round.finished) { round.finished = true; round.final = Math.round(score); session.report(score); }
          },
        };
        round = { info, env, t: 0, game: null, finished: false, final: 0, sent: 0 };
        ctx.setTitle(`Pixel Party · round ${info.i + 1}/${info.total}`);
        input.edges.length = 0;
      }

      // ---------------- loop
      const STEP = 1 / 60;
      function frame(now) {
        raf = requestAnimationFrame(frame);
        const dt = Math.min(0.1, (now - (last || now)) / 1000);
        last = now;
        if (screen === "play" && round) {
          round.t += dt;
          if (round.t >= INTRO_MS / 1000 && !round.game) { round.game = PLAY[round.info.game.id](round.env); input.edges.length = 0; acc = 0; }
          if (round.game && !round.finished) {
            acc += dt;
            while (acc >= STEP && !round.finished) { round.game.update(STEP); input.edges.length = 0; acc -= STEP; }
            if (round.t - INTRO_MS / 1000 >= round.info.game.secs) round.env.finish(round.game.score());
            if (now - round.sent > 250) {
              round.sent = now;
              const v = Math.min(1, round.game.score() / round.info.game.range[1]);
              progress[net.id] = v;
              session.progress(v);
            }
          } else input.edges.length = 0;
        }
        draw();
      }

      function drawStrip(players) {
        // everyone's face with a progress bar under it
        players.filter((p) => !p.left).forEach((p, i) => {
          const x = 24 + i * 56;
          drawAvatar(g, who(p.id), x, H - 12, 26);
          g.fillStyle = "rgba(255,255,255,.2)";
          g.fillRect(x - 18, H - 8, 36, 4);
          g.fillStyle = p.id === net.id ? "#ffd54a" : "#8d7be0";
          g.fillRect(x - 18, H - 8, 36 * (progress[p.id] || 0), 4);
        });
      }

      function draw() {
        if (screen === "menu" || !net) return;
        const grad = g.createLinearGradient(0, 0, 0, H);
        grad.addColorStop(0, "#1a0b3a");
        grad.addColorStop(1, "#37186f");
        g.fillStyle = grad;
        g.fillRect(0, 0, W, H);
        if (screen === "play" && round) {
          const { info } = round;
          text(g, info.game.title, W / 2, 14, 14, "#ffd54a");
          if (!round.game) {
            text(g, String(Math.ceil(INTRO_MS / 1000 - round.t)), W / 2, 120, 72, "#fff");
            wrap(info.game.hint, W / 2, 190);
          } else {
            const left = Math.max(0, info.game.secs - (round.t - INTRO_MS / 1000));
            g.fillStyle = "#ffd54a";
            g.fillRect(0, 0, W * (left / info.game.secs), 3);
            round.game.draw(g);
            if (round.finished) {
              g.fillStyle = "rgba(10,4,30,.75)";
              g.fillRect(0, 0, W, H);
              text(g, `Score ${round.final}`, W / 2, 125, 30, "#ffd54a");
              text(g, "waiting for the others...", W / 2, 170, 14, "#d9ccff");
            }
          }
          drawStrip(info.players);
        } else if (screen === "between" && between) drawStandings();
        else if (screen === "final" && final) drawPodium();
        else text(g, "get ready...", W / 2, H / 2, 20, "#d9ccff");
      }

      function wrap(str, x, y) {
        let line = "", row = 0;
        for (const w of str.split(" ")) {
          if ((line + " " + w).length > 38) { text(g, line, x, y + row++ * 20, 14, "#d9ccff"); line = w; }
          else line = line ? line + " " + w : w;
        }
        text(g, line, x, y + row * 20, 14, "#d9ccff");
      }

      function drawStandings() {
        const b = between;
        const k = Math.min(1, (performance.now() - b.t0) / 1200);
        text(g, `${b.game.title}  -  round ${b.i + 1}/${b.total}`, W / 2, 16, 14, "#ffd54a");
        const rows = ranking(b.players.filter((p) => !p.left), b.totals);
        const most = Math.max(10, ...rows.map((r) => r.total));
        const rh = Math.min(30, 240 / rows.length);
        rows.forEach((r, i) => {
          const y = 40 + i * rh + rh / 2;
          const shown = r.total - (b.gained[r.id] || 0) * (1 - k);
          drawAvatar(g, who(r.id), 30, y + 12, 28);
          text(g, r.name.slice(0, 12), 50, y, 12, r.id === net.id ? "#ffd54a" : "#fff", "left");
          g.fillStyle = "#6a4ab8";
          g.fillRect(150, y - 7, 200 * (shown / most), 14);
          text(g, `+${b.gained[r.id] || 0}`, 360, y, 12, "#46c46a", "left");
          text(g, String(Math.round(shown)), W - 14, y, 14, "#fff", "right");
        });
        text(g, b.last ? "final results next..." : "next game soon...", W / 2, H - 12, 12, "#d9ccff");
      }

      function drawPodium() {
        text(g, "FINAL STANDINGS", W / 2, 16, 16, "#ffd54a");
        const top = final.ranking;
        // [index in ranking, centre x, top of the step, colour]
        for (const [idx, cx, y, col] of [[1, 140, 150, "#cfd8e3"], [0, 240, 120, "#ffd54a"], [2, 340, 175, "#d98c4a"]]) {
          const r = top[idx];
          if (!r) continue;
          g.fillStyle = col;
          g.fillRect(cx - 40, y, 80, H - y - 60);
          drawAvatar(g, who(r.id), cx, y, 52);
          text(g, r.name.slice(0, 10), cx, y - 58, 12, "#fff");
          text(g, String(r.total), cx, y + 16, 16, "#1a0b3a");
        }
        top.slice(3).forEach((r, i) => text(g, `${r.place}. ${r.name.slice(0, 14)}  ${r.total}`, W / 2, 252 + i * 12, 11, "#d9ccff"));
      }

      async function finishParty(info) {
        after.replaceChildren();
        const mine = info.ranking.find((r) => r.id === net.id);
        const total = mine?.total || 0;
        const note = el("p", "party-note", `You scored ${total} points${mine ? ` (place ${mine.place})` : ""}.`);
        after.append(note);
        const res = await ctx.leaderboard.submit("party", total, { rounds: info.rounds });
        if (!session) return;
        if (res && !res.improved && res.best != null) note.textContent += ` Your best is ${res.best}.`;
        board = ctx.leaderboard.mountCanvas(after, "party", { title: "PIXEL PARTY", me: ctx.me()?.username, width: 420, height: 300 });
        const row = el("div", "party-row");
        if (net.isHost()) row.append(button("Play again", () => session.backToLobby()));
        else row.append(el("span", "party-note", "Host can start another."));
        row.append(button("Leave", leave));
        after.append(row);
      }

      raf = requestAnimationFrame(frame);
      drawMenu();
      return {
        destroy() {
          cancelAnimationFrame(raf);
          input.destroy();
          teardownSession();
        },
      };
    },
  });
  return core;
});
