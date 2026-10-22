(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BeingSprite = api;
})(typeof self !== "undefined" ? self : this, function (root) {
  // same row order and timing as the Pillow Room sheets (see client/arcade/avatar-animations.js)
  const STATES = ["idle", "walk", "fly", "dance", "twerk", "smoke", "drink", "shroom", "laugh", "spin", "wave", "crashout"];
  const DURATIONS = [200, 100, 120, 100, 100, 180, 160, 180, 100, 100, 140, 80];
  const FRAMES = 8;
  const LOOPS = 2;

  // which row and frame to draw. An action plays a couple of loops from its first frame, then idle takes over
  function createPlayer() {
    let action = "";
    let started = 0;
    return {
      play(name, now) {
        if (!STATES.includes(name) || name === "idle") return false;
        action = name;
        started = now;
        return true;
      },
      at(now, reduced) {
        if (reduced) return { state: "idle", row: 0, frame: 0 };
        if (action) {
          const row = STATES.indexOf(action);
          const step = Math.floor((now - started) / DURATIONS[row]);
          if (step < FRAMES * LOOPS) return { state: action, row, frame: step % FRAMES };
          action = "";
        }
        return { state: "idle", row: 0, frame: Math.floor(now / DURATIONS[0]) % FRAMES };
      },
    };
  }

  const api = { STATES, DURATIONS, FRAMES, LOOPS, createPlayer };
  if (!root.document) return api;

  const sheetPath = "assets/avatar/animations/";
  const reduced = root.matchMedia("(prefers-reduced-motion: reduce)");
  const catalog = root
    .fetch(sheetPath + "manifest.json")
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}));
  const sheets = new Map();
  const loadSheet = (name) => {
    if (!sheets.has(name))
      sheets.set(
        name,
        new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = sheetPath + encodeURIComponent(name);
        }),
      );
    return sheets.get(name);
  };

  const player = createPlayer();
  const layers = new Map(); // img -> { canvas, context, sheet, info, src, last }

  // each equipped layer gets a canvas that sits where its img sits, so layout and tint code keeps working
  async function bind(img, layer) {
    const src = img.getAttribute("src") || "";
    layer.src = src;
    layer.sheet = null;
    const name = decodeURIComponent(src.split(/[?#]/)[0].split("/").pop());
    const info = (await catalog)[name];
    if (!info || layer.src !== src) return;
    try {
      const sheet = await loadSheet(name);
      if (layer.src !== src) return;
      layer.info = info;
      layer.sheet = sheet;
      layer.canvas.width = info.width;
      layer.canvas.height = info.height;
      layer.last = -1;
    } catch {
      /* the still PNG stays visible */
    }
  }

  function adopt(img) {
    const canvas = document.createElement("canvas");
    canvas.className = "avatar-layer sprite-layer";
    canvas.setAttribute("aria-hidden", "true");
    img.after(canvas);
    const layer = { canvas, context: canvas.getContext("2d"), sheet: null, info: null, src: null, last: -1 };
    layers.set(img, layer);
    return layer;
  }

  function frame(now) {
    const state = player.at(now, reduced.matches);
    const index = state.row * FRAMES + state.frame;
    const dragging = document.documentElement.classList.contains("is-window-dragging");
    document.querySelectorAll("#companion img.avatar-layer").forEach((img) => {
      const layer = layers.get(img) || adopt(img);
      if ((img.getAttribute("src") || "") !== layer.src) bind(img, layer);
      const live = Boolean(layer.sheet) && img.style.display !== "none";
      if (layer.style !== img.style.cssText) {
        layer.style = img.style.cssText;
        layer.canvas.style.cssText = layer.style;
      }
      layer.canvas.style.display = live ? "block" : "none";
      img.classList.toggle("has-sprite", Boolean(layer.sheet));
      if (!live || layer.last === index || dragging) return;
      const { width, height } = layer.info;
      layer.context.clearRect(0, 0, width, height);
      layer.context.drawImage(layer.sheet, state.frame * width, state.row * height, width, height, 0, 0, width, height);
      layer.last = index;
    });
    root.requestAnimationFrame(frame);
  }

  api.play = (name) => player.play(name, performance.now());
  root.requestAnimationFrame(frame);
  return api;
});
