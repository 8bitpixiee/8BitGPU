(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HellGate = api;
})(typeof self !== "undefined" ? self : this, function (root) {
  // ctrl+shift+6, the sixth key, three times over if you squint
  function isGate(event) {
    return Boolean(event.ctrlKey && event.shiftKey && !event.altKey && !event.metaKey && event.code === "Digit6");
  }

  const api = { isGate };
  if (!root.document) return api;

  root.document.addEventListener("keydown", (event) => {
    if (!isGate(event)) return;
    event.preventDefault();
    const veil = root.document.createElement("div");
    veil.setAttribute("aria-hidden", "true");
    veil.style.cssText = "position:fixed;inset:0;z-index:99999;background:#000;opacity:0;transition:opacity 1.4s ease-in";
    root.document.body.append(veil);
    root.requestAnimationFrame(() => { veil.style.opacity = "1"; });
    root.setTimeout(() => { root.location.href = "hell/"; }, 1500);
  });

  // once you have been down there, the boot screen knows
  try {
    const seen = JSON.parse(root.localStorage.getItem("8bitgpu-hell") || "{}");
    const status = root.document.querySelector("#osBootScreen .boot-status");
    if (status && seen.seen && seen.seen.length >= 4) status.textContent = "Starting your desktop... it is still open.";
    else if (status && seen.visits) status.textContent = "Starting your desktop... welcome back.";
  } catch (e) { /* storage can stay quiet */ }

  return api;
});
