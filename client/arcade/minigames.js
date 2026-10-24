// The arcade cabinets: a window to pick a game, the brawler's lobby with CPU fights and challenges,
// and the joke FPS. The room page (arcade.js) hands lounge messages to onLounge and offers send / me / others.
(() => {
  const room = () => window.loungeApi;
  const GAMES = [
    { id: "brawl", title: "Pixie Brawl", blurb: "1v1 street brawler. Your own Being fights, and every race brings its own special move.", icon: "assets/ui/minigames/icon-brawl.png" },
    { id: "fps", title: "Super Cool FPS game no HACKING", blurb: "Not a real game. It is a joke. You will get pickled.", icon: "assets/ui/minigames/icon-pickle.png" },
  ];
  const LEVELS = [["easy", "Easy"], ["normal", "Normal"], ["hard", "Hard"]];
  const CONTROLS = "Move A D / ← →   Jump W / ↑   Block S / ↓   Light J   Heavy K   Special L";

  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (text, onClick, className) => {
    const node = el("button", className, text);
    node.type = "button";
    node.addEventListener("click", onClick);
    return node;
  };

  let win = null;
  let body = null;
  let title = null;
  let game = null;
  let fps = null;
  let level = "normal";
  let waiting = null; // who I challenged and am waiting on
  let incoming = new Map(); // challenges from other people, by id
  let notice = "";
  let view = "pick";

  const toast = el("div", "mg-toast");
  toast.hidden = true;
  toast.setAttribute("role", "alert");

  function ensureWindow() {
    if (win) return;
    win = el("section", "mg-window");
    win.setAttribute("role", "dialog");
    win.setAttribute("aria-modal", "true");
    win.setAttribute("aria-labelledby", "mgTitle");
    const bar = el("header", "mg-bar");
    title = el("strong", "", "Arcade.exe");
    title.id = "mgTitle";
    const close = button("×", () => closeWindow(), "mg-close");
    close.setAttribute("aria-label", "Close arcade");
    bar.append(title, close);
    body = el("div", "mg-body");
    win.append(bar, body);
    win.hidden = true;
    document.body.append(win, toast);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !win.hidden && !game) closeWindow();
    });
  }

  function stopGames() {
    game?.destroy();
    game = null;
    fps?.destroy();
    fps = null;
  }

  function closeWindow() {
    stopGames();
    if (waiting) cancelChallenge();
    win.hidden = true;
    document.getElementById("mapStage")?.focus();
  }

  function open() {
    ensureWindow();
    win.hidden = false;
    show("pick");
  }

  function show(next) {
    stopGames();
    view = next;
    body.replaceChildren();
    win.classList.toggle("playing", false);
    if (next === "pick") return pick();
    if (next === "brawl") return brawlMenu();
    if (next === "fps") return fpsView();
  }

  function pick() {
    title.textContent = "Arcade.exe · pick a game";
    const list = el("div", "mg-games");
    for (const info of GAMES) {
      const card = el("button", "mg-card");
      card.type = "button";
      const icon = el("img", "mg-icon");
      icon.src = info.icon;
      icon.alt = "";
      card.append(icon, el("strong", "", info.title), el("small", "", info.blurb));
      card.addEventListener("click", () => show(info.id));
      list.append(card);
    }
    body.append(list);
  }

  // ------------------------------------------------------------------ brawl lobby
  function brawlMenu() {
    title.textContent = "Pixie Brawl";
    const me = room()?.me();
    const race = me?.avatar?.race || "pixie";
    const stats = BrawlRaces.RACES[race] || BrawlRaces.RACES.pixie;
    const special = BrawlRaces.specialOf(race);
    const head = el("div", "mg-head");
    head.append(
      button("← Games", () => show("pick"), "mg-back"),
      el("span", "mg-you", `You fight as a ${stats.name}: ${stats.hp} HP, special: ${special.name}`),
    );
    const cpu = el("section", "mg-panel");
    cpu.append(el("h2", "", "Fight the CPU"));
    const levels = el("div", "mg-levels");
    for (const [id, label] of LEVELS) {
      const choice = button(label, () => {
        level = id;
        for (const other of levels.children) other.setAttribute("aria-pressed", String(other === choice));
      });
      choice.setAttribute("aria-pressed", String(id === level));
      levels.append(choice);
    }
    cpu.append(levels, button("Start fight", () => startCpu(), "mg-go"));

    const versus = el("section", "mg-panel");
    versus.append(el("h2", "", "Challenge someone in this room"));
    versus.append(challengeList());

    const help = el("p", "mg-help", CONTROLS);
    body.append(head, cpu, versus, help);
    if (notice) body.append(el("p", "mg-notice", notice));
  }

  function challengeList() {
    const wrap = el("div", "mg-people");
    const others = room()?.others() || [];
    if (!others.length) {
      wrap.append(el("p", "mg-empty", "Nobody else is in the room right now. Fight the CPU, or wait for a friend."));
      return wrap;
    }
    for (const person of others) {
      const row = el("div", "mg-person");
      const raceName = BrawlRaces.RACES[person.avatar?.race]?.name || "Pixie";
      row.append(el("span", "", `${person.username} · ${raceName}`));
      const asked = waiting?.id === person.id;
      const action = button(asked ? "Waiting…" : "Challenge", () => challenge(person), "mg-ask");
      action.disabled = Boolean(waiting);
      row.append(action);
      wrap.append(row);
    }
    if (waiting) wrap.append(button("Cancel challenge", cancelChallenge, "mg-cancel"));
    return wrap;
  }

  function challenge(person) {
    if (!room()?.send({ t: "challenge", to: person.id })) return setNotice("Still connecting to the room.");
    waiting = { id: person.id, username: person.username };
    setNotice(`Asked ${person.username}. They have 30 seconds.`);
  }

  function cancelChallenge() {
    if (waiting) room()?.send({ t: "challenge-cancel", to: waiting.id });
    waiting = null;
    setNotice("");
  }

  function setNotice(text) {
    notice = text;
    if (view === "brawl" && win && !win.hidden && !game) show("brawl");
  }

  // ------------------------------------------------------------------ playing
  function arena(onClose) {
    body.replaceChildren();
    win.classList.add("playing");
    const host = el("div", "mg-arena");
    const leave = button("Leave", onClose, "mg-leave");
    body.append(host, leave);
    return host;
  }

  function startCpu() {
    const me = room()?.me();
    if (!me) return setNotice("Enter the room first.");
    const race = me.avatar?.race || "pixie";
    const opponent = CpuRoster.pick(race);
    const players = [{ name: me.username, race, avatar: me.avatar }, opponent];
    title.textContent = `${me.username} vs ${opponent.name}`;
    const host = arena(() => show("brawl"));
    game = BrawlGame.start(host, { mode: "cpu", players, level, onEnd: (result) => finished(result, 0, () => startCpu()) });
  }

  function startOnline(match) {
    ensureWindow();
    win.hidden = false;
    const me = room()?.me();
    const mine = { name: me?.username || "You", race: me?.avatar?.race || "pixie", avatar: me?.avatar };
    const theirs = { name: match.opp.username, race: match.opp.race || "pixie", avatar: match.opp.avatar };
    const players = match.side === 0 ? [mine, theirs] : [theirs, mine];
    stopGames();
    waiting = null;
    title.textContent = `${players[0].name} vs ${players[1].name}`;
    const host = arena(() => show("brawl"));
    game = BrawlGame.start(host, {
      mode: "net", matchId: match.id, side: match.side, players,
      onEnd: (result) => finished(result, match.side, null),
    });
  }

  function finished(result, mySide, again) {
    if (!win || win.hidden) return;
    const box = el("div", "mg-result");
    const won = result.winner === mySide;
    const text =
      result.reason === "lost" ? "Lost the connection." :
      result.reason === "noshow" ? "Nobody showed up." :
      result.winner < 0 ? "Draw." : won ? (result.reason === "forfeit" ? "They left. You win!" : "You win!") : "You lost. Rematch?";
    box.append(el("strong", "", text));
    if (again) box.append(button("Fight again", () => { stopGames(); again(); }, "mg-go"));
    box.append(button("Back to the menu", () => show("brawl")));
    body.append(box);
  }

  function fpsView() {
    title.textContent = "Super Cool FPS game no HACKING";
    const host = el("div", "mg-fps");
    body.append(
      host,
      el("p", "mg-joke", "This is a joke. There is no game, only a pickle. Click anything to get pickled."),
      button("← Games", () => show("pick"), "mg-back"),
    );
    fps = CoolFps.mount(host);
  }

  // ------------------------------------------------------------------ messages from the room
  function showToast() {
    toast.replaceChildren();
    toast.hidden = incoming.size === 0;
    for (const [id, name] of incoming) {
      const row = el("div", "mg-toast-row");
      row.append(
        el("span", "", `${name} wants to brawl!`),
        button("Accept", () => reply(id, true), "mg-go"),
        button("Decline", () => reply(id, false)),
      );
      toast.append(row);
    }
  }

  function reply(id, accept) {
    room()?.send({ t: "challenge-reply", to: id, accept });
    incoming.delete(id);
    showToast();
  }

  function onLounge(msg) {
    ensureWindow();
    if (msg.t === "challenged") {
      incoming.set(msg.from.id, msg.from.username);
      showToast();
      setTimeout(() => {
        incoming.delete(msg.from.id);
        showToast();
      }, 30000);
    } else if (msg.t === "challenge-cancelled") {
      incoming.delete(msg.from.id);
      showToast();
    } else if (msg.t === "challenge-declined") {
      waiting = null;
      setNotice(`${msg.by} said no thanks.`);
    } else if (msg.t === "challenge-fail") {
      waiting = null;
      setNotice(msg.reason === "gone" ? "They left the room." : msg.reason === "expired" ? "That challenge ran out." : "Matches are not available right now.");
    } else if (msg.t === "match") {
      incoming.clear();
      showToast();
      startOnline(msg);
    } else return false;
    return true;
  }

  window.Minigames = { open, onLounge };
})();
