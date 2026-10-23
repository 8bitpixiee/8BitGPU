(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Konami = api;
})(typeof self !== "undefined" ? self : this, function (root) {
  const CODE = [
    "ArrowUp",
    "ArrowUp",
    "ArrowDown",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "ArrowLeft",
    "ArrowRight",
    "b",
    "a",
  ];

  // feed it keys one at a time, it says true when the last ten keys are the code
  function createDetector() {
    let recent = [];
    return (key) => {
      recent.push(key.length === 1 ? key.toLowerCase() : key);
      if (recent.length > CODE.length) recent.shift();
      if (recent.join() !== CODE.join()) return false;
      recent = [];
      return true;
    };
  }

  const api = { CODE, createDetector };
  if (!root.document) return api;

  const SHEET = "assets/media/konami-stickman.png";
  const FRAME = 64;
  const FRAMES = 8;
  const SCALE = 5;
  let active = null;

  // the stickman slides in from the left, dances in the middle for a bit, then walks off
  function show() {
    if (active) return;
    const canvas = document.createElement("canvas");
    canvas.id = "konamiStickman";
    canvas.width = FRAME;
    canvas.height = FRAME;
    canvas.setAttribute("aria-hidden", "true");
    document.body.append(canvas);
    const context = canvas.getContext("2d");
    context.imageSmoothingEnabled = false;
    const sheet = new Image();
    sheet.src = SHEET;
    const reduced = root.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const start = performance.now();
    const size = FRAME * SCALE;
    const middle = (root.innerWidth - size) / 2;
    active = canvas;
    const finish = () => {
      active = null;
      canvas.remove();
    };
    canvas.addEventListener("click", finish);
    const frame = (now) => {
      if (!canvas.isConnected) return;
      const t = now - start;
      // 0-1.4s in, 1.4-9s dancing, 9-10.4s out
      const left =
        t < 1400
          ? -size + (middle + size) * (t / 1400)
          : t < 9000
            ? middle
            : middle + (root.innerWidth - middle) * ((t - 9000) / 1400);
      canvas.style.left = Math.round(left) + "px";
      if (t > 10400) return finish();
      context.clearRect(0, 0, FRAME, FRAME);
      if (sheet.complete && sheet.naturalWidth)
        context.drawImage(sheet, (reduced ? 0 : Math.floor(t / 110) % FRAMES) * FRAME, 0, FRAME, FRAME, 0, 0, FRAME, FRAME);
      root.requestAnimationFrame(frame);
    };
    root.requestAnimationFrame(frame);
  }

  const detect = createDetector();
  root.addEventListener("keydown", (event) => {
    if (event.target.closest?.("input, textarea, select, [contenteditable]")) return;
    if (detect(event.key)) show();
  });
  api.show = show;
  return api;
});
