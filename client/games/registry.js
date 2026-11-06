// Game registry + shared helpers every arcade game uses. Load this before any client/games/*.js file.
//
//   ArcadeGames.register({
//     id: "kart", title: "Pixie Kart", blurb: "one line for the picker", icon: "assets/ui/minigames/icon-kart.png",
//     mount(host, ctx) { ...build into host...; return { destroy() {} }; },
//   });
//
// ctx given to mount():
//   ctx.me()            -> { id, username, avatar } or null      ctx.others() -> people in the lounge
//   ctx.close()         -> back to the game picker                ctx.setTitle(text) -> window title
//   ctx.leaderboard     -> Leaderboard (below)                    ctx.net(game, code, handlers) -> GameNet.connect
(() => {
  const games = new Map();
  window.ArcadeGames = {
    register(info) {
      if (!info?.id || typeof info.mount !== "function") throw new Error("a game needs an id and a mount()");
      games.set(info.id, info);
    },
    list: () => [...games.values()],
    get: (id) => games.get(id),
  };

  // ---------------------------------------------------------------- leaderboard
  const ORDER = { kart: "low" };
  const fmtTime = (ms) => {
    const m = Math.floor(ms / 60000);
    const s = Math.floor(ms / 1000) % 60;
    return `${m}:${String(s).padStart(2, "0")}.${String(Math.floor(ms % 1000)).padStart(3, "0")}`;
  };
  const fmtScore = (game, score) => (ORDER[game] === "low" ? fmtTime(score) : Math.round(score).toLocaleString());

  async function fetchBoard(game) {
    const res = await fetch(`/api/leaderboard/${game}`, { credentials: "same-origin" });
    if (!res.ok) throw new Error("no board");
    return res.json();
  }

  // keeps only your best on the server. resolves { best, improved } or null when signed out / offline
  async function submit(game, score, meta) {
    try {
      const res = await fetch(`/api/leaderboard/${game}`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ score, meta }),
      });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  }

  // draws the top 10 for a game on a canvas in the arcade look. returns { refresh(), destroy() }
  function mountCanvas(host, game, opts = {}) {
    const canvas = document.createElement("canvas");
    const W = (canvas.width = opts.width || 420);
    const H = (canvas.height = opts.height || 360);
    canvas.className = "lb-canvas";
    canvas.setAttribute("role", "img");
    host.append(canvas);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    let data = null;
    let failed = false;
    let raf = 0;
    let t0 = performance.now();
    const medal = ["#ffd54a", "#cfd8e3", "#d98c4a"];

    function draw(now) {
      const t = (now - t0) / 1000;
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#14082e");
      bg.addColorStop(1, "#2b1260");
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);
      for (let y = 0; y < H; y += 4) {
        ctx.fillStyle = "rgba(0,0,0,.18)";
        ctx.fillRect(0, y, W, 1);
      }
      ctx.textBaseline = "middle";
      ctx.font = "bold 18px monospace";
      ctx.fillStyle = `hsl(${(t * 60) % 360} 90% 70%)`;
      ctx.textAlign = "center";
      ctx.fillText(`★ ${opts.title || game.toUpperCase()} · HIGH SCORES ★`, W / 2, 24);
      ctx.textAlign = "left";
      ctx.font = "14px monospace";
      if (failed || !data) {
        ctx.fillStyle = "#b9a9e8";
        ctx.textAlign = "center";
        ctx.fillText(failed ? "Scores are offline right now." : "Loading...", W / 2, H / 2);
      } else if (!data.top.length) {
        ctx.fillStyle = "#b9a9e8";
        ctx.textAlign = "center";
        ctx.fillText("No scores yet. Be the first!", W / 2, H / 2);
      } else {
        const row = Math.min(28, (H - 70) / 10);
        data.top.slice(0, 10).forEach((entry, i) => {
          const y = 56 + i * row;
          const mine = opts.me && entry.username === opts.me;
          if (mine) {
            ctx.fillStyle = "rgba(255,255,255,.12)";
            ctx.fillRect(10, y - row / 2, W - 20, row - 2);
          }
          ctx.fillStyle = medal[i] || "#9d8ad8";
          ctx.textAlign = "left";
          ctx.fillText(String(entry.rank).padStart(2, " "), 20, y);
          ctx.fillStyle = mine ? "#fff" : "#e6dcff";
          ctx.fillText(entry.username.slice(0, 18), 56, y);
          ctx.textAlign = "right";
          ctx.fillStyle = medal[i] || "#cbbcf5";
          ctx.fillText(fmtScore(game, entry.score), W - 20, y);
        });
        if (data.me && data.me.rank > 10) {
          ctx.textAlign = "center";
          ctx.fillStyle = "#fff";
          ctx.fillText(`You: #${data.me.rank} · ${fmtScore(game, data.me.score)}`, W / 2, H - 14);
        }
      }
      raf = requestAnimationFrame(draw);
    }

    async function refresh() {
      try {
        data = await fetchBoard(game);
        failed = false;
      } catch {
        failed = true;
      }
    }
    refresh();
    raf = requestAnimationFrame(draw);
    return { refresh, destroy: () => cancelAnimationFrame(raf) };
  }

  window.Leaderboard = { submit, fetchBoard, mountCanvas, fmtTime, fmtScore };

  // ---------------------------------------------------------------- multiplayer relay (server/games/room.js)
  //   const net = GameNet.connect("kart", "ABCD", { onHello(h), onJoin(p, host), onLeave(id, host), onMsg(from, data), onClose() })
  //   net.send(data, toId?)   net.id   net.host() -> id of the host   net.players() -> [{id,username}]   net.close()
  // The host is the oldest person in the room, so whoever is host should run the game's authority logic.
  function connect(game, code, handlers = {}) {
    const url = new URL("/api/games/ws", location.href);
    url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("game", game);
    url.searchParams.set("room", code);
    const ws = new WebSocket(url);
    let hostId = null;
    let selfId = null;
    let roster = [];
    let beat = 0;
    const api = {
      get id() { return selfId; },
      host: () => hostId,
      isHost: () => selfId !== null && hostId === selfId,
      players: () => roster.slice(),
      send: (data, to) => ws.readyState === 1 && ws.send(JSON.stringify({ t: "msg", data, to })),
      close: () => { clearInterval(beat); ws.close(); },
    };
    ws.addEventListener("open", () => { beat = setInterval(() => ws.readyState === 1 && ws.send("ping"), 25000); });
    ws.addEventListener("message", (event) => {
      if (event.data === "pong") return;
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.t === "hello") {
        selfId = msg.id; hostId = msg.host; roster = msg.players;
        handlers.onHello?.(msg);
      } else if (msg.t === "join") {
        hostId = msg.host;
        if (!roster.some((p) => p.id === msg.player.id)) roster.push(msg.player);
        handlers.onJoin?.(msg.player, hostId);
      } else if (msg.t === "leave") {
        hostId = msg.host;
        roster = roster.filter((p) => p.id !== msg.id);
        handlers.onLeave?.(msg.id, hostId);
      } else if (msg.t === "msg") handlers.onMsg?.(msg.from, msg.data);
    });
    ws.addEventListener("close", () => { clearInterval(beat); handlers.onClose?.(); });
    return api;
  }
  window.GameNet = { connect };
})();
