(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.WelcomeBack = api;
})(typeof self !== "undefined" ? self : this, function (root) {
  const AWAY = 8000; // tab hidden this long counts as leaving
  const IDLE = 120000; // no mouse or keys this long counts as afk

  // feed it what the page sees, it says true when the Being should wave hello
  function createWatcher({ away = AWAY, idle = IDLE } = {}) {
    let hiddenAt = null;
    let lastActive = 0;
    return {
      hidden(now) {
        hiddenAt = now;
      },
      visible(now) {
        const left = hiddenAt !== null && now - hiddenAt >= away;
        hiddenAt = null;
        lastActive = now;
        return left;
      },
      active(now) {
        const wasIdle = lastActive > 0 && now - lastActive >= idle;
        lastActive = now;
        return wasIdle;
      },
    };
  }

  const api = { AWAY, IDLE, createWatcher };
  if (!root.document) return api;

  const watcher = createWatcher();
  const wave = () => root.BeingSprite?.play("wave");
  watcher.active(performance.now());

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) watcher.hidden(performance.now());
    else if (watcher.visible(performance.now())) wave();
  });
  // mouse moves fire constantly, so only look at them every so often
  let looked = 0;
  ["pointermove", "pointerdown", "keydown"].forEach((type) =>
    root.addEventListener(
      type,
      () => {
        const now = performance.now();
        if (now - looked < 500) return;
        looked = now;
        if (watcher.active(now)) wave();
      },
      { passive: true },
    ),
  );
  return api;
});
