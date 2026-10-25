// Runs a brawl in the browser. "cpu" plays the whole fight here. "net" sends your buttons to the
// referee, keeps a prediction of your own fighter running ahead of what it last heard, and redraws
// from the referee's snapshots a few dozen times a second.
(() => {
  const { BIT } = BrawlSim;
  const FRAME = 1000 / 60;
  const KEYS = {
    a: BIT.L, arrowleft: BIT.L, d: BIT.R, arrowright: BIT.R, w: BIT.U, arrowup: BIT.U, " ": BIT.U,
    s: BIT.B, arrowdown: BIT.B, j: BIT.A, z: BIT.A, k: BIT.H, x: BIT.H, l: BIT.S, c: BIT.S,
  };

  function start(host, opts) {
    const { mode } = opts;
    const mySide = mode === "net" ? opts.side : 0;
    const players = opts.players; // in fight order, index is the side
    const races = players.map((player) => player.race);
    let held = 0;
    let tapped = 0;
    let ended = false;
    let raf = 0;
    let state = BrawlSim.create(races);
    const seen = new Set();
    let net = null;

    const view = BrawlView.create(host, {
      players,
      mySide,
      onInput: (bit, down) => press(bit, down),
    });

    function press(bit, down) {
      if (down) {
        if (!(held & bit)) tapped |= bit;
        held |= bit;
      } else held &= ~bit;
      if (net) net.send();
    }

    const typing = (event) => event.target?.closest?.("textarea,input,select");
    const onKey = (down) => (event) => {
      const bit = KEYS[event.key.toLowerCase()];
      if (!bit || typing(event) || event.repeat) return;
      // the room behind the game also walks on these keys, so nobody else gets them
      event.preventDefault();
      event.stopImmediatePropagation();
      press(bit, down);
    };
    const keydown = onKey(true);
    const keyup = onKey(false);
    const release = () => {
      held = 0;
      if (net) net.send();
    };
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("keyup", keyup, true);
    window.addEventListener("blur", release);

    function finish(result) {
      if (ended) return;
      ended = true;
      opts.onEnd?.(result);
    }

    function showEvents(events) {
      const fresh = [];
      for (const e of events) {
        const key = `${e.k}:${e.f}:${e.side}`;
        if (seen.has(key)) continue;
        seen.add(key);
        fresh.push(e);
      }
      if (seen.size > 500) for (const key of [...seen].slice(0, 250)) seen.delete(key);
      view.fx(fresh);
    }

    // ---------------------------------------------------------------- cpu
    if (mode === "cpu") {
      const brain = BrawlAI.create({ side: 1, level: opts.level, seed: (Date.now() & 0xffff) + 1 });
      let acc = 0;
      let last = performance.now();
      const loop = (now) => {
        acc += Math.min(now - last, 100);
        last = now;
        while (acc >= FRAME && !state.over) {
          acc -= FRAME;
          const bits = held | tapped;
          tapped = 0;
          BrawlSim.step(state, bits, brain(state));
          showEvents(state.ev);
        }
        view.render(state);
        if (state.over && !ended && state.phase === "matchend") setTimeout(() => finish({ winner: state.winner, reason: "over" }), 2200);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    }

    // ---------------------------------------------------------------- online
    if (mode === "net") {
      let ws = null;
      let seq = 0;
      let unacked = [];
      let snap = null;
      let snapAt = 0;
      let rtt = 80;
      let pingAt = 0;
      let retries = 0;
      let alive = true;
      const url = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/brawl/ws?match=${encodeURIComponent(opts.matchId)}`;

      net = {
        send() {
          if (!ws || ws.readyState !== 1) return;
          unacked.push({ q: ++seq, p: tapped, at: performance.now() });
          ws.send(JSON.stringify({ t: "in", q: seq, h: held, p: tapped }));
          tapped = 0;
          if (unacked.length > 120) unacked = unacked.slice(-60);
        },
      };

      const connect = () => {
        ws = new WebSocket(url);
        ws.onopen = () => {
          retries = 0;
          view.banner("", 0);
          net.send();
        };
        ws.onmessage = (event) => {
          if (event.data === "pong") {
            rtt = rtt * 0.7 + (performance.now() - pingAt) * 0.3;
            return;
          }
          let msg;
          try {
            msg = JSON.parse(event.data);
          } catch {
            return;
          }
          if (msg.t === "s") {
            snap = msg.s;
            snapAt = performance.now();
            const ack = msg.a[mySide];
            unacked = unacked.filter((entry) => entry.q > ack);
          } else if (msg.t === "end") finish({ winner: msg.winner, reason: msg.reason });
        };
        ws.onclose = () => {
          if (!alive || ended) return;
          if (retries++ >= 6) return finish({ winner: -1, reason: "lost" });
          view.banner("RECONNECTING…", 0);
          setTimeout(connect, 800);
        };
      };
      connect();

      const timers = [
        setInterval(() => {
          if (ws?.readyState === 1) {
            pingAt = performance.now();
            ws.send("ping");
          }
        }, 2000),
        // say what is held every so often so a dropped message can't leave a button stuck
        setInterval(() => net.send(), 250),
      ];

      const loop = (now) => {
        if (snap) {
          let taps = tapped;
          for (const entry of unacked) taps |= entry.p;
          const frames = BrawlPredict.framesAhead(now - snapAt, rtt);
          const age = unacked.length ? (now - unacked[0].at) / FRAME : Infinity;
          const { state: pred, events } = BrawlPredict.predict(snap, mySide, { held, taps, frames, age });
          showEvents(events);
          state = pred;
          view.render(pred);
        }
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);

      net.stop = () => {
        alive = false;
        timers.forEach(clearInterval);
        try {
          ws?.close(1000);
        } catch {}
      };
    }

    return {
      destroy() {
        ended = true;
        cancelAnimationFrame(raf);
        net?.stop?.();
        document.removeEventListener("keydown", keydown, true);
        document.removeEventListener("keyup", keyup, true);
        window.removeEventListener("blur", release);
        view.destroy();
      },
    };
  }

  window.BrawlGame = { start };
})();
