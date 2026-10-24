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
    canvas.style.cursor = "crosshair";
    canvas.setAttribute("role", "img");
    canvas.setAttribute("aria-label", "A joke game. A pickle with the DeltaVDevs logo on it wiggles in front of a pretend first person shooter screen that says you just got pickled");
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

    const PICKLED = "YOU JUST GOT PICKLED";
    // every click on the game gets you pickled again
    const splats = [];
    let pickled = 0;
    canvas.addEventListener("pointerdown", (event) => {
      const box = canvas.getBoundingClientRect();
      splats.push({
        x: ((event.clientX - box.left) / box.width) * W,
        y: ((event.clientY - box.top) / box.height) * H,
        at: performance.now(),
        angle: Math.random() * Math.PI,
      });
      pickled++;
      if (splats.length > 12) splats.shift();
      if (still) frame(0);
    });

    function drawSplats(now) {
      for (const splat of splats) {
        const age = (now - splat.at) / 900;
        if (age > 1) continue;
        ctx.save();
        ctx.globalAlpha = 1 - age;
        ctx.translate(splat.x, splat.y);
        ctx.rotate(splat.angle);
        for (let i = 0; i < 7; i++) {
          const a = (i / 7) * Math.PI * 2;
          const reach = 14 + age * 34 + (i % 2) * 10;
          circle(Math.cos(a) * reach, Math.sin(a) * reach, 7 - age * 4, i % 2 ? "#6dbf4a" : "#a8e582");
        }
        circle(0, 0, 16 + age * 8, "#4f9a38");
        ctx.rotate(-splat.angle);
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#1c4a14";
        ctx.lineWidth = 4;
        ctx.font = "bold 18px Impact, 'Arial Black', sans-serif";
        ctx.textAlign = "center";
        ctx.strokeText(PICKLED, 0, -26 - age * 30);
        ctx.fillText(PICKLED, 0, -26 - age * 30);
        ctx.restore();
      }
    }

    function hud(t) {
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

      // the whole screen is one joke
      const beat = still ? 0 : Math.sin(t / 160);
      ctx.textAlign = "center";
      ctx.shadowColor = "#000";
      ctx.shadowBlur = 10;
      ctx.font = `bold ${40 + beat * 2}px Impact, 'Arial Black', sans-serif`;
      ctx.fillStyle = Math.floor(t / 300) % 2 === 0 || still ? "#b8ff6a" : "#ffd34a";
      ctx.fillText(PICKLED, W / 2, 56 + beat * 2);
      ctx.shadowBlur = 0;
      ctx.font = "bold 14px Tahoma, Arial, sans-serif";
      ctx.fillStyle = "#fff";
      ctx.fillText("SUPER COOL FPS GAME  ·  NO HACKING  ·  (IT IS A JOKE)", W / 2, 80);

      ctx.font = "bold 22px Tahoma, Arial, sans-serif";
      ctx.textAlign = "left";
      ctx.fillText("HP: PICKLED", 18, H - 18);
      ctx.textAlign = "right";
      ctx.fillText("AMMO: PICKLED", W - 18, H - 18);

      ctx.font = "12px Tahoma, Arial, sans-serif";
      ctx.fillStyle = "#cfe";
      ctx.textAlign = "right";
      ctx.fillText("[DeltaVDevs] you got pickled", W - 12, 108);
      ctx.fillText("[DeltaVDevs] you got pickled again", W - 12, 124);
      ctx.fillStyle = "#b8ff6a";
      ctx.fillText(PICKLED.toLowerCase(), W - 12, 140);
      ctx.textAlign = "left";
      ctx.fillStyle = "#fffc";
      ctx.fillText(`times pickled: ${pickled}  (click anything)`, 14, 20);
    }

    function frame(t) {
      room(t);
      if (sheet.complete && sheet.naturalWidth) pickle(still ? 0 : t, W / 2, 96, 4.2);
      hud(t);
      drawSplats(performance.now());
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
