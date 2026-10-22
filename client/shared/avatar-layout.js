(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.AvatarLayout = api;
})(typeof self !== "undefined" ? self : this, function (root) {
  let data = null;
  const fileOf = (src) => {
    try {
      return decodeURIComponent(
        String(src || "")
          .split(/[?#]/)[0]
          .split("/")
          .pop(),
      );
    } catch {
      return "";
    }
  };
  const clamp = (value, low, high, fallback) => {
    const number = Number(value);
    return value == null || !Number.isFinite(number) ? fallback : Math.max(low, Math.min(high, number));
  };

  function rigFor(bodySrc) {
    const file = fileOf(bodySrc);
    if (!data || !file) return {};
    let best = "";
    for (const key of Object.keys(data.rigs))
      if (file.startsWith(key) && key.length > best.length) best = key;
    return best ? data.rigs[best] : {};
  }

  // everything lives on one square stage so a part lands where the body expects it
  function place(bodySrc, category, src) {
    const file = fileOf(src);
    if (!data || !file) return null;
    const canvas = data.canvas[data.wide.includes(file) ? "wide" : "standard"];
    const anchor = rigFor(bodySrc)[category] || {};
    const scale = anchor.scale || 1;
    const width = canvas.w * scale,
      height = canvas.h * scale;
    const left = canvas.x + (anchor.x || 0) - (width - canvas.w) / 2,
      top = canvas.y + (anchor.y || 0) - (height - canvas.h) / 2;
    const pct = (value) => (value / data.stage) * 100;
    return { left: pct(left), top: pct(top), width: pct(width), height: pct(height) };
  }

  function apply(element, bodySrc, category, src) {
    const box = place(bodySrc, category, src);
    if (!element || !box) return false;
    const style = element.style;
    style.position = "absolute";
    style.right = style.bottom = "auto";
    style.left = box.left + "%";
    style.top = box.top + "%";
    style.width = box.width + "%";
    style.height = box.height + "%";
    style.objectFit = "fill";
    return true;
  }

  // saved nudges from before the layout rework were fighting the old misalignment, so they are ignored
  function adjustment(avatar, category) {
    const saved = avatar && avatar.layout >= 2 ? avatar.adjustments && avatar.adjustments[category] : null;
    return {
      x: clamp(saved && saved.x, -20, 20, 0),
      y: clamp(saved && saved.y, -20, 20, 0),
      scale: clamp(saved && saved.scale ? saved.scale : null, 0.7, 1.3, 1),
    };
  }
  function transform(avatar, category) {
    const { x, y, scale } = adjustment(avatar, category);
    return `translate(${x}%, ${y}%) scale(${scale})`;
  }

  const ready =
    root && typeof root.fetch === "function"
      ? root
          .fetch("/assets/avatar/anchors.json")
          .then((response) => (response.ok ? response.json() : null))
          .then((json) => {
            data = json;
            return json;
          })
          .catch(() => null)
      : Promise.resolve(null);

  return {
    ready,
    place,
    apply,
    adjustment,
    transform,
    rigFor,
    fileOf,
    setData: (json) => (data = json),
    isReady: () => Boolean(data),
    LAYOUT_VERSION: 2,
  };
});
