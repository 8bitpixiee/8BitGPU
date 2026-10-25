const el = (id) => document.getElementById(id);
const MAP_BOUNDS = RoomPage.room.bounds;
const EMOTES = ["dance", "twerk", "smoke", "drink", "shroom", "laugh", "spin", "wave", "crashout"];
let x = RoomPage.spawn.x,
  y = RoomPage.spawn.y,
  target = null,
  keys = new Set(),
  joined = false,
  myId = null,
  messages = [],
  lastLog = "",
  timer = null,
  inflight = false,
  delay = 1500,
  muted = false,
  movingFrame = 0,
  lastFrame = 0,
  facing = "down",
  flying = false,
  socket = null,
  socketOpen = false,
  leaving = false,
  giveUp = false,
  pingTimer = null,
  lastMembers = [],
  lastSent = "",
  blocked = new Set();
const beings = new Map();
const skinFilter = (color) => {
  const value = (key, fallback) => (Number.isFinite(Number(color?.[key])) ? Number(color[key]) : fallback);
  return `hue-rotate(${Math.max(-180, Math.min(180, value("hue", 0)))}deg) saturate(${Math.max(0, Math.min(200, value("saturation", 100)))}%) brightness(${Math.max(60, Math.min(140, value("lightness", 100)))}%)`;
};
const whiteBodyFilter = (color) => {
  const value = (key, fallback) => (Number.isFinite(Number(color?.[key])) ? Number(color[key]) : fallback);
  const hue = Math.max(-180, Math.min(180, value("hue", 0))),
    sat = Math.max(0, Math.min(200, value("saturation", 100))),
    light = Math.max(60, Math.min(140, value("lightness", 100)));
  return hue === 0 && sat === 100 && light === 100
    ? "none"
    : `sepia(100%) saturate(${Math.max(100, sat * 4)}%) hue-rotate(${hue - 28}deg) brightness(${light}%)`;
};
const clampPosition = (x, y) => ({
  x: Math.max(MAP_BOUNDS.minX, Math.min(MAP_BOUNDS.maxX, x)),
  y: Math.max(MAP_BOUNDS.minY, Math.min(MAP_BOUNDS.maxY, y)),
});
function status(text) {
  el("roomStatus").textContent = text;
}
async function api(path, body, method) {
  const r = await fetch(RoomPage.apiPath(path), {
    method: method || (body === undefined ? "GET" : "POST"),
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const d = await r.json();
  if (!r.ok) {
    const e = Error(d.error || "Room connection unavailable.");
    e.code = d.code;
    e.status = r.status;
    throw e;
  }
  return d;
}
function positionSelf() {
  const node = beings.get(myId);
  if (node) {
    node.style.left = x + "%";
    node.style.top = y + "%";
    node.style.zIndex = String(Math.round(y));
    node.dataset.facing = facing;
    node.classList.toggle("is-flying", flying);
  }
}
function face(dx, dy) {
  if (Math.abs(dx) >= Math.abs(dy)) facing = dx < 0 ? "left" : "right";
  else facing = dy < 0 ? "up" : "down";
}
function renderMembers(members) {
  const active = new Set(members.map((m) => m.id));
  for (const [id, node] of beings) {
    if (!active.has(id)) {
      node.remove();
      beings.delete(id);
    }
  }
  for (const m of members) {
    let node = beings.get(m.id);
    if (!node) {
      node = document.createElement("div");
      node.className = "being" + (m.id === myId ? " self" : "");
      node.dataset.userId = m.id;
      const art = document.createElement("span");
      art.className = "avatar-art";
      art.setAttribute("aria-hidden", "true");
      const motion = document.createElement("span");
      motion.className = "avatar-motion";
      art.append(motion);
      const bubble = document.createElement("span");
      bubble.className = "bubble";
      const effect = document.createElement("span");
      effect.setAttribute("aria-hidden", "true");
      effect.className = "emote-effect";
      const name = document.createElement("button");
      name.type = "button";
      name.className = "name being-profile-link";
      name.textContent = m.username + (m.id === myId ? " (you)" : "");
      name.title = m.id === myId ? "Your MyPixel page" : "Open " + m.username + "'s MyPixel page";
      Badges.mark(name, m.username);
      node.append(art, bubble, effect, name);
      el("players").append(node);
      beings.set(m.id, node);
    }
    const signature = JSON.stringify(m.avatar) + AvatarLayout.isReady();
    if (node.dataset.avatar !== signature) {
      const motion = node.querySelector(".avatar-motion");
      motion.replaceChildren();
      for (const key of ["extra", "body", "ears", "head", "chest", "eyes", "hair", "fit"]) {
        const source = m.avatar.layers[key];
        if (!source) continue;
        const img = document.createElement("img");
        img.src = source;
        img.alt = "";
        img.onerror = () => img.remove();
        AvatarLayout.apply(img, m.avatar.layers.body, key, source);

        if (m.avatar.adjustments[key]) {
          img.style.transform = AvatarLayout.transform(m.avatar, key);
        }

        AvatarColors.applyLayer(
          img,
          m.avatar,
          key,
          motion.querySelector('[data-avatar-color-layer="body"]')
        ).then(() => {
          window.AvatarAnimations?.attach(node, img, source);
        });
        motion.append(img);
      }
      node.dataset.avatar = signature;
    }
    if (node._lastX !== undefined && m.id !== myId && (node._lastX !== m.x || node._lastY !== m.y))
      window.AvatarAnimations?.moved(node, 1100);
    node._lastX = m.x;
    node._lastY = m.y;
    node._emote = m.emote;
    node._emoteUntil = m.emoteUntil;
    for (const emote of EMOTES)
      node.classList.toggle("emote-" + emote, m.emote === emote && m.emoteUntil > Date.now());
    node.classList.toggle("is-flying", m.id === myId ? flying : Boolean(m.flying));
    node.dataset.facing = m.id === myId ? facing : m.facing || "down";
    node.style.left = (m.id === myId ? x : m.x) + "%";
    node.style.top = (m.id === myId ? y : m.y) + "%";
    node.style.zIndex = String(Math.round(m.id === myId ? y : m.y));
  }
  const self = members.find((m) => m.id === myId);
  const selfEmote = self && self.emoteUntil > Date.now() ? self.emote : "";
  for (const effect of ["smoke", "drink", "shroom"])
    el("mapStage").classList.toggle("screen-" + effect, selfEmote === effect);
  el("roomCount").textContent = members.length + " in the room";
  renderBubbles();
}
function renderBubbles() {
  for (const [id, node] of beings) {
    const latest = [...messages].reverse().find((m) => m.userId === id && Date.now() - m.createdAt < 8000);
    node.querySelector(".bubble").textContent = latest
      ? latest.body.slice(0, 160) + (latest.body.length > 160 ? "…" : "")
      : "";
  }
}
function renderLog(data) {
  messages = data.messages;
  blocked = new Set((data.blocks || []).map((b) => b.id));
  if (!myId) {
    const seed = [...data.user.id].reduce((n, c) => n + c.charCodeAt(0), 0);
    x = 36 + (seed % 19);
    y = 66 + (seed % 9);
  }
  myId = data.user.id;
  muted = data.mutedUntil > Date.now();
  el("identity").textContent = data.user.username + (data.owner ? " · Owner" : " · Member");
  el("roomMessage").disabled = false;
  el("sendMessage").disabled = muted;
  const signature = JSON.stringify(messages);
  if (signature !== lastLog) {
    const log = el("roomMessages"),
      bottom = log.scrollHeight - log.scrollTop - log.clientHeight < 50;
    const rows = messages.map((m) => {
      const p = document.createElement("p"),
        name = document.createElement("strong"),
        text = document.createElement("span");
      name.textContent = m.username;
      Badges.mark(name, m.username);
      text.textContent = m.body;
      p.append(name, text);
      return p;
    });
    log.replaceChildren(...rows);
    if (bottom || !lastLog) log.scrollTop = log.scrollHeight;
    lastLog = signature;
  }
  renderBubbles();
}
const visibleMembers = () => lastMembers.filter((m) => m.id === myId || !blocked.has(m.id));
function sendPos(force) {
  if (!socketOpen) return;
  const frame = JSON.stringify({
    t: "pos",
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    facing,
    flying,
  });
  if (!force && frame === lastSent) return;
  lastSent = frame;
  socket.send(frame);
}
async function refreshMessages() {
  try {
    renderLog(await api("messages"));
  } catch {}
}
function connectSocket() {
  if (socket || giveUp) return;
  const ws = new WebSocket(
    RoomPage.socketUrl(),
  );
  socket = ws;
  ws.onopen = () => {
    socketOpen = true;
    sendPos(true);
    pingTimer = setInterval(() => ws.send("ping"), 25000);
  };
  ws.onmessage = (event) => {
    if (event.data === "pong") return;
    let msg;
    try {
      msg = JSON.parse(event.data);
    } catch {
      return;
    }
    if (msg.t === "members") {
      lastMembers = msg.members;
      renderMembers(visibleMembers());
    } else if (msg.t === "chat") refreshMessages();
  };
  ws.onclose = (event) => {
    clearInterval(pingTimer);
    socket = null;
    socketOpen = false;
    if (leaving) return;
    if (event.code === 4000) {
      giveUp = true;
      status("You entered another room or opened this room in another tab.");
      return;
    }
    delay = event.code === 4003 ? 0 : 3000;
    if (event.code === 4003) sync();
    else if (!document.hidden) timer = setTimeout(sync, delay);
  };
}
setInterval(() => sendPos(false), 120);
async function sync() {
  if (inflight || document.hidden) return;
  inflight = true;
  clearTimeout(timer);
  try {
    const data = await api("messages");
    renderLog(data);
    joined = true;
    loadActivities();
    el("roomGate").hidden = true;
    connectSocket();
    delay = socket ? 0 : 1500;
    status(muted ? "You are temporarily muted. You can still walk around." : "");
  } catch (e) {
    joined = false;
    activitiesLoaded = false;
    keys.clear();
    target = null;
    el("roomMessage").disabled = true;
    el("sendMessage").disabled = true;
    el("roomCount").textContent = "Not connected";
    status(e.message);
    delay = Math.min(delay * 2, 15000);
    if (e.code === "join_required") {
      el("roomGate").hidden = false;
      delay = 0;
    } else if (e.status === 401 || e.status === 403) {
      el("players").replaceChildren();
      beings.clear();
      el("roomMessages").replaceChildren();
      messages = [];
      lastLog = "";
      delay = 0;
    }
  } finally {
    inflight = false;
    if (delay && !document.hidden) timer = setTimeout(sync, delay);
  }
}
AvatarLayout.ready.then(() => renderMembers(visibleMembers()));
el("joinRoom").onclick = async () => {
  try {
    await api("join", { adult: el("adult").checked, rules: el("rules").checked });
    delay = 1500;
    await sync();
  } catch (e) {
    status(e.message);
  }
};
el("roomComposer").onsubmit = async (e) => {
  e.preventDefault();
  el("sendMessage").disabled = true;
  try {
    await api("messages", { message: el("roomMessage").value });
    el("roomMessage").value = "";
    if (!socketOpen) await sync();
  } catch (error) {
    status(error.message);
  } finally {
    el("sendMessage").disabled = !joined || muted;
  }
};
el("roomMessage").addEventListener("keydown", (event) => {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    if (!el("sendMessage").disabled) el("roomComposer").requestSubmit();
  }
});
async function playEmote(emote) {
  if (!joined) {
    status("Enter the room before using an emote.");
    return false;
  }
  if (!socketOpen) {
    status("Still connecting to the room.");
    return false;
  }
  socket.send(JSON.stringify({ t: "emote", emote }));
  return true;
}
document.querySelectorAll("[data-emote]").forEach((button) =>
  button.addEventListener("click", async () => {
    if (button.dataset.emote === "fly") {
      if (!joined) return status("Enter the room before flying.");
      flying = !flying;
      button.setAttribute("aria-pressed", String(flying));
      button.textContent = flying ? "Land" : "Fly";
      positionSelf();
      sendPos(true);
      return;
    }
    button.disabled = true;
    try {
      await playEmote(button.dataset.emote);
    } finally {
      button.disabled = false;
    }
  }),
);
const defaultActivities = {
  grow: "empty",
  fresh: 0,
  dried: 0,
  jarred: 0,
  ground: 0,
  packed: "",
  drinks: [],
  tab: "grow",
  moodlet: "",
};
let activities = (() => {
    try {
      return { ...defaultActivities, ...JSON.parse(localStorage.getItem("8bitgpu-lounge-activities")) };
    } catch {
      return { ...defaultActivities };
    }
  })(),
  activitiesLoaded = false;
const saveActivities = () => {
  const state = JSON.stringify(activities);
  localStorage.setItem("8bitgpu-lounge-activities", state);
  if (joined) api("activities", { state }).catch(() => {});
};
async function loadActivities() {
  if (activitiesLoaded || !joined) return;
  activitiesLoaded = true;
  try {
    const saved = await api("activities");
    if (saved.state) {
      activities = { ...defaultActivities, ...JSON.parse(saved.state) };
      localStorage.setItem("8bitgpu-lounge-activities", JSON.stringify(activities));
      if (!el("loungeActivities").hidden) renderActivities();
    }
  } catch {
    /* Local activity saves remain available offline. */
  }
}
const moodlets = ["hungry", "happy", "sleepy", "paranoid", "euphoric", "relaxed"];
function setMoodlet() {
  activities.moodlet = moodlets[Math.floor(Math.random() * moodlets.length)];
  saveActivities();
  el("moodletStatus").textContent = "Moodlet: " + activities.moodlet.toUpperCase() + " ✦";
}
function activityButton(action, label, disabled = false) {
  return `<button type="button" data-activity-action="${action}"${disabled ? " disabled" : ""}>${label}</button>`;
}
function renderActivities() {
  const content = el("activityContent"),
    tab = activities.tab;
  document
    .querySelectorAll("[data-activity-tab]")
    .forEach((button) => button.classList.toggle("active", button.dataset.activityTab === tab));
  el("moodletStatus").textContent = activities.moodlet
    ? "Moodlet: " + activities.moodlet.toUpperCase() + " ✦"
    : "";
  if (tab === "grow") {
    const labels = {
      empty: "Choose a seed to begin.",
      seeded: "Seed planted. Give it water.",
      watered: "Looking good. Time to prune.",
      pruned: "Ready to harvest.",
      harvested: "Fresh bud ready to dry.",
    };
    const actions = {
      empty: activityButton("plant", "Plant seed"),
      seeded: activityButton("water", "Water it"),
      watered: activityButton("prune", "Prune it"),
      pruned: activityButton("harvest", "Harvest"),
      harvested: activityButton("dry", "Dry bud"),
      dried: activityButton("jar", "Store in jar"),
    };
    content.innerHTML = `<p class="activity-lede">${labels[activities.grow] || "Dried bud is ready to store."}</p><div class="grow-pot grow-${activities.grow}">✦</div><div class="activity-actions">${actions[activities.grow] || ""}</div><p class="inventory-line">Fresh ${activities.fresh} · Dried ${activities.dried} · Jarred ${activities.jarred}</p>`;
  } else if (tab === "roll") {
    content.innerHTML = `<p class="activity-lede">Grind jarred bud, choose a format, then pack and light it.</p><p class="inventory-line">Jarred ${activities.jarred} · Ground ${activities.ground}</p><div class="activity-actions">${activityButton("grind", "Grind bud", activities.jarred < 1)}<select id="rollFormat"><option>Joint</option><option>Blunt</option><option>Wood</option><option>Bowl</option><option>Bong</option></select>${activityButton("pack", "Pack / seal", activities.ground < 1)}${activityButton("light", "Light it", !activities.packed)}</div><p class="activity-lede">${activities.packed ? activities.packed + " packed and ready." : "Choose your format after grinding."}</p>`;
  } else {
    content.innerHTML = `<p class="activity-lede">Build a drink from the bar and sip it for a random moodlet.</p><div class="mix-grid"><label>Liquor<select id="mixLiquor"><option>Dark</option><option>Light</option><option>Yellow</option></select></label><label>Syrup<select id="mixSyrup"><option>None</option><option>Cherry</option><option>Blue raspberry</option><option>Peach</option><option>Lime</option><option>Vanilla</option><option>Berry</option></select></label><label>Garnish<select id="mixGarnish"><option>None</option><option>Cherry</option><option>Lime wheel</option><option>Orange peel</option><option>Mint</option><option>Flower</option><option>Star candy</option></select></label><label>Ice<select id="mixIce"><option>No ice</option><option>Ice</option></select></label><label>Glass<select id="mixGlass"><option>Rocks</option><option>Highball</option><option>Martini</option><option>Coupe</option><option>Shot</option><option>Tumbler</option></select></label></div><div class="activity-actions">${activityButton("mix", "Mix drink")}${activityButton("sip", "Sip latest", !activities.drinks.length)}</div><p class="inventory-line">${activities.drinks.length ? activities.drinks[activities.drinks.length - 1] : "No drinks mixed yet."}</p>`;
  }
}
function useActivity(action) {
  if (action === "plant") activities.grow = "seeded";
  if (action === "water") activities.grow = "watered";
  if (action === "prune") activities.grow = "pruned";
  if (action === "harvest") {
    activities.grow = "harvested";
    activities.fresh++;
  }
  if (action === "dry" && activities.fresh) {
    activities.fresh--;
    activities.dried++;
    activities.grow = "dried";
  }
  if (action === "jar" && activities.dried) {
    activities.dried--;
    activities.jarred++;
    activities.grow = "empty";
  }
  if (action === "grind" && activities.jarred) {
    activities.jarred--;
    activities.ground++;
  }
  if (action === "pack" && activities.ground) {
    activities.ground--;
    activities.packed = el("rollFormat").value;
  }
  if (action === "light" && activities.packed) {
    activities.packed = "";
    setMoodlet();
    playEmote("smoke");
  }
  if (action === "mix") {
    const get = (id) => el(id).value;
    activities.drinks.push(
      `${get("mixLiquor")} liquor · ${get("mixSyrup")} · ${get("mixGarnish")} · ${get("mixIce")} · ${get("mixGlass")}`,
    );
    activities.drinks = activities.drinks.slice(-8);
  }
  if (action === "sip" && activities.drinks.length) {
    activities.drinks.pop();
    setMoodlet();
    playEmote("drink");
  }
  saveActivities();
  renderActivities();
}
el("activitiesToggle").addEventListener("click", () => {
  const panel = el("loungeActivities"),
    open = panel.hidden;
  panel.hidden = !open;
  el("activitiesToggle").setAttribute("aria-expanded", String(open));
  if (open) renderActivities();
});
document.querySelectorAll("[data-activity-tab]").forEach((button) =>
  button.addEventListener("click", () => {
    activities.tab = button.dataset.activityTab;
    saveActivities();
    renderActivities();
  }),
);
el("activityContent").addEventListener("click", (event) => {
  const action = event.target.dataset.activityAction;
  if (action) useActivity(action);
});
async function roomSnapshot() {
  const stage = el("mapStage"),
    size = 1200,
    canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = Math.round(size * RoomPage.room.height / RoomPage.room.width);
  const context = canvas.getContext("2d"),
    load = (source) =>
      new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = source;
      });
  const background = await load(RoomPage.room.image);
  context.drawImage(background, 0, 0, canvas.width, canvas.height);
  const bounds = stage.getBoundingClientRect();
  for (const node of el("players").children) {
    for (const image of node.querySelectorAll("img,canvas")) {
      const box = image.getBoundingClientRect(),
        left = ((box.left - bounds.left) / bounds.width) * size,
        top = ((box.top - bounds.top) / bounds.height) * canvas.height,
        width = (box.width / bounds.width) * size,
        height = (box.height / bounds.height) * canvas.height;
      try {
        await image.decode?.();
        const avatar = JSON.parse(node.dataset.avatar || "{}");
        const key = image.dataset.avatarColorLayer;
        const tinted = key ? await AvatarColors.snapshotLayer(image, avatar, key, node.querySelector('[data-avatar-color-layer="body"]')) : image;
        context.drawImage(tinted, left, top, width, height);
      } catch {
        /* Skip a still-loading layer. */
      }
    }
  }
  return new Promise((resolve) => canvas.toBlob(resolve, "image/webp", 0.76));
}
el("roomCamera").onclick = async () => {
  if (!joined) return status("Enter the room before taking a picture.");
  const button = el("roomCamera");
  button.disabled = true;
  try {
    const blob = await roomSnapshot();
    if (!blob) throw Error("Camera could not create a room picture.");
    const response = await fetch("/api/profile/images/desktop1", {
      method: "PUT",
      headers: { "content-type": "image/webp" },
      body: blob,
    });
    const data = await response.json();
    if (!response.ok) throw Error(data.error || "Picture could not save.");
    status("Room screenshot saved in Desktop Backgrounds.");
  } catch (error) {
    status(error.message);
  } finally {
    button.disabled = false;
  }
};
function animate(time) {
  const dt = Math.min(0.05, (time - lastFrame) / 1000 || 0.016);
  lastFrame = time;
  let dx = 0,
    dy = 0;
  for (const k of keys) {
    if (k === "a" || k === "arrowleft") dx--;
    if (k === "d" || k === "arrowright") dx++;
    if (k === "w" || k === "arrowup") dy--;
    if (k === "s" || k === "arrowdown") dy++;
  }
  if (dx || dy) target = null;
  else if (target) {
    dx = target.x - x;
    dy = target.y - y;
    if (Math.hypot(dx, dy) < 0.5) {
      target = null;
      dx = dy = 0;
      el("walkMarker").hidden = true;
    }
  }
  const length = Math.hypot(dx, dy);
  if (length) {
    face(dx, dy);
    const step = Math.min(length, 23 * dt);
    const next = clampPosition(x + (dx / length) * step, y + (dy / length) * step);
    if (next.x !== x || next.y !== y) window.AvatarAnimations?.moved(beings.get(myId));
    x = next.x;
    y = next.y;
    positionSelf();
  }
  if (joined && (keys.size || target)) movingFrame = requestAnimationFrame(animate);
  else movingFrame = 0;
}
function startMoving() {
  if (!movingFrame) {
    lastFrame = performance.now();
    movingFrame = requestAnimationFrame(animate);
  }
}
el("mapStage").addEventListener("pointerdown", (e) => {
  if (!joined || e.button !== 0 || e.target.closest(".being-profile-link, .room-door")) return;
  const r = e.currentTarget.getBoundingClientRect();
  target = clampPosition(((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100);
  el("walkMarker").style.left = target.x + "%";
  el("walkMarker").style.top = target.y + "%";
  el("walkMarker").hidden = false;
  e.currentTarget.focus();
  startMoving();
});
document.addEventListener("keydown", (e) => {
  if (!joined || e.target.closest("textarea,input,button,a")) return;
  const key = e.key.toLowerCase();
  if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
    e.preventDefault();
    keys.add(key);
    startMoving();
  }
});
document.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => {
  keys.clear();
  target = null;
});
function leave() {
  keys.clear();
  target = null;
  clearTimeout(timer);
  leaving = true;
  socket?.close(1000);
}
document.addEventListener("visibilitychange", () => {
  if (document.hidden) leave();
  else {
    leaving = false;
    delay = 1500;
    sync();
  }
});
window.addEventListener("pagehide", leave);
sync();
