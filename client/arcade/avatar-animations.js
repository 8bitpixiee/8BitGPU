// sheets share eight columns and one row per tagged animation
(() => {
  const states = [
    "idle",
    "walk",
    "fly",
    "dance",
    "twerk",
    "smoke",
    "drink",
    "shroom",
    "laugh",
    "spin",
    "wave",
    "crashout",
  ];
  const durations = [200, 100, 120, 100, 100, 180, 160, 180, 100, 100, 140, 80];
  const sheets = new Map();
  const layers = new Set();
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const catalog = fetch("/assets/avatar/animations/manifest.json")
    .then((r) => {
      if (!r.ok) throw Error("Animation catalog unavailable");
      return r.json();
    })
    .catch(() => ({}));

  function loadSheet(name) {
    if (!sheets.has(name))
      sheets.set(
        name,
        new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = "/assets/avatar/animations/" + encodeURIComponent(name);
        }),
      );
    return sheets.get(name);
  }

  window.AvatarAnimations = {
    async attach(node, image, source) {
      // Includes saved outfits using the original root URLs.
      const url = new URL(source, location.href);
      if (url.origin !== location.origin) return;
      const name = decodeURIComponent(url.pathname.split("/").pop());
      const info = (await catalog)[name];
      if (!info) return;
      try {
        const sheet = await loadSheet(name);
        if (!image.isConnected) return;
        const canvas = document.createElement("canvas");
        canvas.width = info.width;
        canvas.height = info.height;
        canvas.style.cssText = image.style.cssText;
        canvas.dataset.avatarColorLayer = image.dataset.avatarColorLayer || "";
        canvas.dataset.avatarSource = source;
        canvas.setAttribute("aria-hidden", "true");
        const context = canvas.getContext("2d");
        context.imageSmoothingEnabled = false;
        context.drawImage(sheet, 0, 0, info.width, info.height, 0, 0, info.width, info.height);
        image.replaceWith(canvas);
        node.classList.add("has-sprite-animation");
        layers.add({ node, canvas, context, sheet, last: -1 });
      } catch {
        /* Keep the original PNG if an animation cannot load. */
      }
    },
    moved(node, duration = 180) {
      if (node) node._walkingUntil = performance.now() + duration;
    },
  };

  function render(time) {
    for (const layer of layers) {
      const { node, canvas, context, sheet } = layer;
      if (!canvas.isConnected) {
        layers.delete(layer);
        continue;
      }
      let state = node._emoteUntil > Date.now() ? node._emote : "";
      if (!state)
        state = node.classList.contains("is-flying") ? "fly" : node._walkingUntil > time ? "walk" : "idle";
      if (reducedMotion.matches) state = "idle";
      let row = states.indexOf(state);
      if (row < 0) row = 0;
      const frame = reducedMotion.matches ? 0 : Math.floor(time / durations[row]) % 8;
      const index = row * 8 + frame;
      if (index === layer.last || document.hidden) continue;
      const { width, height } = canvas;
      context.clearRect(0, 0, width, height);
      context.drawImage(sheet, frame * width, row * height, width, height, 0, 0, width, height);
      layer.last = index;
    }
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);
})();
