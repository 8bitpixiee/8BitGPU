// "Super Cool FPS game no HACKING": it is not a game, it is a pickle with the DeltaVDevs logo on its
// back doing the wiggle. The sprite is the pickle's twerk row, with the middle stretched out and
// each half bouncing on its own.
(() => {
  const SHEET = "assets/avatar/animations/pickle.png";
  const LOGO = "assets/media/deltavdevs-logo.png";
  const FRAME = 50;
  const TWERK_ROW = 4;
  const TWERK_MS = 100;
  const W = 640;
  const H = 360;

  function mount(host) {
    host.replaceChildren();
    const canvas = document.createElement("canvas");
    canvas.width = W;
    canvas.height = H;
    canvas.className = "fps-canvas";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "A pickle with the DeltaVDevs logo on its back, wiggling, in front of a pretend first person shooter menu");
    host.append(canvas);
    const ctx = canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;
    const sheet = new Image();
    sheet.src = SHEET;
    const logo = new Image();
    logo.src = LOGO;
    const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
    let raf = 0;

    function room(t) {
      const sky = ctx.createLinearGradient(0, 0, 0, H * 0.55);
      sky.addColorStop(0, "#0c0818");
      sky.addColorStop(1, "#2a1850");
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, W, H);
      // a floor that rushes toward you
      const horizon = H * 0.55;
      ctx.fillStyle = "#162a3a";
      ctx.fillRect(0, horizon, W, H - horizon);
      ctx.strokeStyle = "#2f6f8f";
      ctx.lineWidth = 2;
      for (let i = -12; i <= 12; i++) {
        ctx.beginPath();
        ctx.moveTo(W / 2 + i * 14, horizon);
        ctx.lineTo(W / 2 + i * 90, H);
        ctx.stroke();
      }
      for (let i = 0; i < 9; i++) {
        const p = (i + ((t / 900) % 1)) / 9;
        const y = horizon + (H - horizon) * p * p;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
    }

    function circle(cx, cy, r, color) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // the pickle's own twerk row, with two huge cheeks added that bounce against each other
    function pickle(t, x, top, s) {
      const frame = Math.floor(t / TWERK_MS) % 8;
      const size = FRAME * s;
      ctx.drawImage(sheet, frame * FRAME, TWERK_ROW * FRAME, FRAME, FRAME, x - size / 2, top, size, size);
      const bounce = Math.sin(t / 70);
      const r = 8.6 * s;
      for (const side of [-1, 1]) {
        const cx = x + side * r * 0.82;
        const cy = top + 37 * s + side * bounce * r * 0.3;
        circle(cx, cy, r + 3, "#2f6b24");
        circle(cx, cy, r, "#6dbf4a");
        circle(cx - r * 0.3, cy - r * 0.35, r * 0.3, "#a8e582");
        circle(cx + r * 0.25, cy + r * 0.4, r * 0.18, "#58a83c");
      }
      // the logo is printed across the pickle's chest
      if (logo.complete) ctx.drawImage(logo, x - 6 * s, top + 17 * s, 12 * s, 12 * s);
    }

    function hud(t) {
      ctx.fillStyle = "#fff";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(W / 2 - 14, H / 2);
      ctx.lineTo(W / 2 - 4, H / 2);
      ctx.moveTo(W / 2 + 4, H / 2);
      ctx.lineTo(W / 2 + 14, H / 2);
      ctx.moveTo(W / 2, H / 2 - 14);
      ctx.lineTo(W / 2, H / 2 - 4);
      ctx.moveTo(W / 2, H / 2 + 4);
      ctx.lineTo(W / 2, H / 2 + 14);
      ctx.stroke();
      ctx.font = "bold 22px Tahoma, Arial, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("HP 100", 18, H - 18);
      ctx.textAlign = "right";
      ctx.fillText("AMMO ∞", W - 18, H - 18);
      ctx.textAlign = "center";
      ctx.font = "bold 34px Impact, 'Arial Black', sans-serif";
      ctx.fillStyle = "#ffd34a";
      ctx.shadowColor = "#000";
      ctx.shadowBlur = 8;
      ctx.fillText("SUPER COOL FPS GAME", W / 2, 46);
      const blink = still || Math.floor(t / 450) % 2 === 0;
      ctx.fillStyle = blink ? "#ff4a6a" : "#ffd34a";
      ctx.font = "bold 26px Impact, 'Arial Black', sans-serif";
      ctx.fillText("NO HACKING", W / 2, 78);
      ctx.shadowBlur = 0;
      ctx.font = "12px Tahoma, Arial, sans-serif";
      ctx.fillStyle = "#cfe";
      ctx.textAlign = "right";
      ctx.fillText("anti-cheat: 0 hackers found", W - 12, 20);
      ctx.fillText("DeltaVDevs QA: this is fine", W - 12, 36);
      ctx.textAlign = "left";
      ctx.fillStyle = "#fff9";
      ctx.fillText("kills 0   deaths 0   wiggles ∞", 14, 20);
    }

    function frame(t) {
      room(t);
      if (sheet.complete && sheet.naturalWidth) pickle(still ? 0 : t, W / 2, 96, 4.2);
      hud(t);
      if (!still) raf = requestAnimationFrame(frame);
    }
    const start = () => {
      raf = requestAnimationFrame(frame);
    };
    if (sheet.complete) start();
    else sheet.onload = start;
    logo.onload = () => still && frame(0);

    return {
      destroy() {
        cancelAnimationFrame(raf);
        host.replaceChildren();
      },
    };
  }

  window.CoolFps = { mount };
})();
