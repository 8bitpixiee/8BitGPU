(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (!root.document || !api.isActive(new Date(), root.location.search)) return;

  const host = root.document.getElementById("halloweenDrop");
  if (!host) return;
  const key = "8bitgpu.halloween." + new Date().getFullYear();
  let state;
  try { state = api.readState(root.localStorage.getItem(key)); }
  catch { state = api.readState(); }
  const panel = host.querySelector("[data-halloween-panel]");
  const launcher = host.querySelector("[data-halloween-open]");
  const status = host.querySelector("[data-halloween-status]");
  const count = host.querySelector("[data-halloween-count]");
  const quiet = host.querySelector("[data-halloween-quiet]");
  const ghost = host.querySelector("[data-halloween-ghost]");
  let timer;
  function save() {
    try { root.localStorage.setItem(key, JSON.stringify(state)); }
    catch { /* The bowl still works when browser storage is unavailable. */ }
  }
  function render() {
    count.textContent = state.candy + " / 6 treats";
    quiet.checked = state.quiet;
    host.classList.toggle("is-quiet", state.quiet);
  }
  function stopTrick() {
    root.clearTimeout(timer);
    ghost.hidden = true;
    ghost.classList.remove("is-haunting");
  }
  function close() {
    panel.hidden = true;
    launcher.setAttribute("aria-expanded", "false");
    stopTrick();
    launcher.focus();
  }
  launcher.addEventListener("click", () => {
    if (!panel.hidden) return close();
    panel.hidden = false;
    launcher.setAttribute("aria-expanded", "true");
  });
  host.querySelector("[data-halloween-close]").addEventListener("click", close);
  host.querySelector("[data-halloween-knock]").addEventListener("click", () => {
    stopTrick();
    const result = api.knock(state);
    state = result.state;
    status.textContent = result.message;
    if (result.trick && !state.quiet) {
      ghost.hidden = false;
      ghost.classList.add("is-haunting");
      timer = root.setTimeout(stopTrick, 2400);
    }
    render();
    save();
  });
  quiet.addEventListener("change", () => {
    state.quiet = quiet.checked;
    stopTrick();
    render();
    save();
  });
  root.document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) close();
  });
  root.document.addEventListener("visibilitychange", () => {
    if (root.document.hidden) stopTrick();
  });
  render();
  host.hidden = false;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const TREATS = ["Moon candy", "Pixie fizz", "Pumpkin crunch", "Violet chew", "Ghost mallow", "Midnight chocolate"];
  function isActive(date, search = "") {
    const preview = new URLSearchParams(search).get("halloween");
    if (preview === "1") return true;
    if (preview === "0") return false;
    return date.getMonth() === 9 || (date.getMonth() === 10 && date.getDate() === 1);
  }
  function readState(value) {
    let parsed;
    try { parsed = JSON.parse(value); } catch { /* Start with an empty bowl. */ }
    return {
      knocks: Number.isInteger(parsed?.knocks) ? Math.max(0, Math.min(9, parsed.knocks)) : 0,
      candy: Number.isInteger(parsed?.candy) ? Math.max(0, Math.min(6, parsed.candy)) : 0,
      quiet: parsed?.quiet === true,
    };
  }
  function knock(previous) {
    const state = { ...previous };
    if (state.candy >= TREATS.length)
      return { state, trick: false, message: "Your bowl is full! All 6 treats collected. Happy Halloween, pixie." };
    state.knocks = (state.knocks + 1) % 10;
    const trick = state.knocks % 3 === 0;
    if (trick) return { state, trick, message: "Boo! A little ghost borrowed your desktop. Knock again for a treat." };
    const treat = TREATS[state.candy++];
    return { state, trick, message: state.candy === TREATS.length
      ? treat + "! All 6 treats collected. Happy Halloween, pixie."
      : treat + "! Saved in this browser. Knock again... if you dare." };
  }
  return { isActive, readState, knock };
});
