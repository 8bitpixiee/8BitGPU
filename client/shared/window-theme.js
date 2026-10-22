(() => {
  const contrast = (hex) => {
    const rgb = hex
      .match(/[a-f\d]{2}/gi)
      .map((v) => parseInt(v, 16) / 255)
      .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722 > 0.179 ? "#16101c" : "#ffffff";
  };
  function apply(colors) {
    if (!colors) return;
    for (const key of ["edge", "accent", "panel", "paper", "ink"])
      if (/^#[a-f\d]{6}$/i.test(colors[key]))
        document.documentElement.style.setProperty("--" + key, colors[key]);
    if (/^#[a-f\d]{6}$/i.test(colors.panel)) {
      document.documentElement.style.setProperty("--control-ink", contrast(colors.panel));
      const rgb = colors.panel.match(/[a-f\d]{2}/gi).map((v) => parseInt(v, 16) / 255),
        max = Math.max(...rgb),
        min = Math.min(...rgb),
        d = max - min;
      let h = 0;
      if (d)
        h =
          max === rgb[0]
            ? ((rgb[1] - rgb[2]) / d + 6) % 6
            : max === rgb[1]
              ? (rgb[2] - rgb[0]) / d + 2
              : (rgb[0] - rgb[1]) / d + 4;
      document.documentElement.style.setProperty(
        "--frame-filter",
        `grayscale(1) sepia(1) hue-rotate(${h * 60 - 45}deg) saturate(${d ? 1.4 : 0})`,
      );
    }
    if (/^#[a-f\d]{6}$/i.test(colors.edge))
      document.documentElement.style.setProperty("--title-ink", contrast(colors.edge));
  }
  window.applyWindowTheme = apply;
  window.addEventListener("message", (e) => {
    if (e.origin === location.origin && e.data?.type === "8bitgpu-theme-saved") {
      apply(e.data.colors);
      document
        .querySelectorAll("iframe")
        .forEach((f) => f.contentWindow?.postMessage(e.data, location.origin));
    }
  });
  if (!location.pathname.endsWith("profile.html"))
    fetch("/api/profile/me", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => apply(d?.profile?.style))
      .catch(() => {});
  const pulse = () => {
    if (!document.hidden)
      fetch("/api/social/presence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      }).catch(() => {});
  };
  pulse();
  setInterval(pulse, 30000);
  document.addEventListener("visibilitychange", pulse);
})();

(() => {
  const key = "8bitgpu-font";
 const fonts = {
    windows: "Tahoma, Arial, sans-serif",
    verdana: "Verdana, sans-serif",
    mono: "'Courier New', monospace",
    book: "Georgia, serif",

    pixel: "'Pixelify Sans', sans-serif",
    silkscreen: "'Silkscreen', monospace",
    tiny5: "'Tiny5', monospace",
    micro5: "'Micro 5', monospace",
    pressstart: "'Press Start 2P', monospace",
    vt323: "'VT323', monospace",
    dotgothic: "'DotGothic16', monospace",
    handjet: "'Handjet', monospace",
    sixtyfour: "'Sixtyfour', monospace",

    jersey10: "'Jersey 10', sans-serif",
    jersey15: "'Jersey 15', sans-serif",
    jersey20: "'Jersey 20', sans-serif",
    jersey25: "'Jersey 25', sans-serif",

    jacquard12: "'Jacquard 12', serif",
    jacquard24: "'Jacquard 24', serif",
    bastarda: "'Jacquarda Bastarda 9', serif",
    charted12: "'Jacquard 12 Charted', serif",
    charted24: "'Jacquard 24 Charted', serif",

    wallpoet: "'Wallpoet', monospace",
    iceland: "'Iceland', sans-serif",
    techmono: "'Share Tech Mono', monospace",
    orbitron: "'Orbitron', sans-serif",
    geo: "'Geo', sans-serif",

    delius: "'Delius', cursive",
    cherry: "'Cherry Bomb One', cursive"
};

window.desktopFonts = fonts;

  function readFont() {
    try {
      return localStorage.getItem(key) || "windows";
    } catch {
      return "windows";
    }
  }

 function applyFont(value) {
    const selected = Object.hasOwn(fonts, value) ? value : "windows";
    const stack = fonts[selected];
    const builtIn = ["windows", "verdana", "mono", "book"];

    if (!builtIn.includes(selected)) {
        const family = stack.split(",")[0].replace(/'/g, "");

        let stylesheet = document.getElementById("desktop-font-sheet");

        if (!stylesheet) {
            stylesheet = document.createElement("link");
            stylesheet.id = "desktop-font-sheet";
            stylesheet.rel = "stylesheet";
            document.head.appendChild(stylesheet);
        }

        stylesheet.href =
            "https://fonts.googleapis.com/css2?family=" +
            encodeURIComponent(family) +
            "&display=swap";
    }

    document.documentElement.style.setProperty("--ui-font", stack);
}

  window.setDesktopFont = (value) => {
    if (!Object.hasOwn(fonts, value)) return;
    localStorage.setItem(key, value);
    applyFont(value);

    if (parent !== window) {
      parent.postMessage({ type: "8bitgpu-font-changed" }, location.origin);
    }
  };

  window.getDesktopFont = readFont;

  window.addEventListener("storage", (event) => {
    if (event.key === key || event.key === null) {
      applyFont(readFont());
    }
  });

  window.addEventListener("message", (event) => {
    if (event.origin === location.origin && event.data?.type === "8bitgpu-font-changed") {
      applyFont(readFont());
    }
  });

  applyFont(readFont());
})();
