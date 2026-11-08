// shared brain for every page down here: remembers how deep you went, fills in who you are, whispers, hums
(function () {
  "use strict";

  var KEY = "8bitgpu-hell";
  function blank() { return { first: Date.now(), visits: 0, seen: [], rooms: 0, sound: false, bottom: 0, calledAt: 0, keys: [], rseq: [], maxFloor: 0, openPress: 0 }; }
  var S;
  try { S = Object.assign(blank(), JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { S = blank(); }
  for (var ki = 0; ki < 9; ki++) S.keys[ki] = S.keys[ki] || "";
  function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* private mode, it can keep the secret */ } }

  var page = document.body.dataset.page || "";
  var plain = ["index", "door", "inside", "keys", "keyhole", "room", "p", ""];
  if (page === "index") S.visits++;
  if (page === "room" || page === "p") S.rooms++;
  else if (plain.indexOf(page) < 0 && S.seen.indexOf(page) < 0) S.seen.push(page);
  save();

  var depth = S.seen.length + Math.floor(S.rooms / 3);
  var rawName = "";
  try { rawName = localStorage.getItem("8bitgpu-player-name") || ""; } catch (e) { /* nothing */ }
  var name = rawName && rawName !== "Guest Pixie" ? rawName : "you";

  function pad(n) { return String(n).padStart(2, "0"); }
  function clock() { var d = new Date(); return pad(d.getHours()) + ":" + pad(d.getMinutes()); }
  function mulberry(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(rand, list) { return list[Math.floor(rand() * list.length)]; }

  var tz = "";
  try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { tz = "somewhere"; }
  var fills = {
    name: function () { return name; },
    time: clock,
    visits: function () { return String(S.visits); },
    depth: function () { return String(depth); },
    rooms: function () { return String(S.rooms); },
    tz: function () { return tz; },
    screen: function () { return screen.width + " x " + screen.height; },
    since: function () {
      var m = Math.max(0, Math.round((Date.now() - S.first) / 60000));
      return m < 2 ? "a moment" : m < 120 ? m + " minutes" : Math.round(m / 60) + " hours";
    }
  };
  function fill() {
    document.querySelectorAll("[data-fill]").forEach(function (el) {
      var f = fills[el.dataset.fill];
      if (f) el.textContent = f();
    });
  }
  fill();
  setInterval(fill, 15000);

  // the more you have seen, the more the text on the page frays
  function corrupt() {
    var chance = Math.min(0.14, Math.max(0, S.visits - 1) * 0.015 + depth * 0.005);
    if (chance <= 0) return;
    var bits = "█▓▒░";
    document.querySelectorAll(".corruptible").forEach(function (root) {
      var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      var node;
      while ((node = walker.nextNode())) {
        if (node.__orig === undefined) node.__orig = node.nodeValue;
        var out = "";
        for (var i = 0; i < node.__orig.length; i++) {
          var c = node.__orig[i];
          out += /[a-z]/i.test(c) && Math.random() < chance * 0.35 ? bits[Math.floor(Math.random() * bits.length)] : c;
        }
        node.nodeValue = out;
      }
    });
  }
  corrupt();
  setInterval(corrupt, 5000);

  // whispers, rare at first
  var lines = [
    "behind you", "you stopped moving", "still here", "it's your turn to blink",
    name === "you" ? "what is your name" : name, "not that one", "the chair is warm",
    "count them again", "it learned this from you", "don't answer yet", "I can see the cursor",
    "there are two of you", "close the other window", "you read that out loud"
  ];
  var whisperEl = document.createElement("div");
  whisperEl.className = "whisper";
  whisperEl.setAttribute("aria-hidden", "true");
  document.body.append(whisperEl);
  function whisper(text) {
    whisperEl.textContent = text || lines[Math.floor(Math.random() * lines.length)];
    whisperEl.style.left = 6 + Math.random() * 70 + "vw";
    whisperEl.style.top = 8 + Math.random() * 74 + "vh";
    whisperEl.classList.add("on");
    setTimeout(function () { whisperEl.classList.remove("on"); }, 1500 + Math.random() * 1000);
  }
  (function schedule() {
    var gap = Math.max(9000, 70000 - depth * 6000) * (0.6 + Math.random() * 0.8);
    setTimeout(function () { if (!document.hidden && depth > 0) whisper(); schedule(); }, gap);
  })();

  // the tab knows when you look away
  var realTitle = document.title;
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) { document.title = "come back"; return; }
    document.title = "you blinked";
    setTimeout(function () { document.title = realTitle; }, 2200);
  });

  // esc always gets you out. that part is not a trick
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") location.href = "../";
  });

  // sound is opt-in
  var ac = null, tick = 0;
  function soundOn() {
    if (ac) return;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    var master = ac.createGain();
    master.gain.value = 0;
    master.connect(ac.destination);
    master.gain.linearRampToValueAtTime(0.11, ac.currentTime + 4);
    [[55, "sine", 0.6], [55.8, "sine", 0.6], [82.4, "triangle", 0.2], [110.9, "sine", 0.08]].forEach(function (p) {
      var o = ac.createOscillator();
      o.type = p[1];
      o.frequency.value = p[0];
      var g = ac.createGain();
      g.gain.value = p[2];
      o.connect(g);
      g.connect(master);
      o.start();
    });
    tick = setInterval(function () {
      if (!ac) return;
      var o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime;
      o.frequency.value = 780 + Math.random() * 60;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(0.025, t + 0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
      o.connect(g);
      g.connect(ac.destination);
      o.start(t);
      o.stop(t + 0.1);
    }, 5200);
  }
  function soundOff() {
    clearInterval(tick);
    if (ac) { ac.close(); ac = null; }
  }
  var snd = document.getElementById("snd");
  function paintSnd() { if (snd) snd.textContent = "sound: " + (S.sound ? "on" : "off"); }
  paintSnd();
  if (snd) snd.addEventListener("click", function () {
    S.sound = !S.sound;
    save();
    paintSnd();
    if (S.sound) soundOn(); else soundOff();
  });
  if (S.sound) {
    var wake = function () { soundOn(); document.removeEventListener("pointerdown", wake); document.removeEventListener("keydown", wake); };
    document.addEventListener("pointerdown", wake);
    document.addEventListener("keydown", wake);
  }



  // the nine keys: words, checked by hash
  var KEYH = [258284688, 622788189, 193512546, 4138657311, 193509904, 177670, 2090191961, 193512546, 317693600];
  var KEYLEN = [5, 6, 3, 6, 3, 1, 4, 3, 6];
  function wh(s) { s = s.toLowerCase().replace(/[^a-z]/g, ""); var x = 5381; for (var i = 0; i < s.length; i++) x = ((x << 5) + x + s.charCodeAt(i)) >>> 0; return x; }
  function keyAdd(word) {
    var w = wh(word);
    for (var i = 0; i < 9; i++) if (!S.keys[i] && KEYH[i] === w) { S.keys[i] = word.toLowerCase().replace(/[^a-z]/g, ""); save(); return i; }
    return -1;
  }
  function keyCount() { var n = 0; for (var i = 0; i < 9; i++) if (S.keys[i]) n++; return n; }
  function allowedFloor(k) { return k >= 8 ? 9 : k >= 6 ? 8 : k >= 4 ? 7 : k >= 2 ? 5 : 3; }
  var curFloor = 0;
  if (page === "p") { curFloor = parseInt(new URLSearchParams(location.search).get("f"), 10) || 1; }
  function nextFloor() {
    if (!curFloor) return 1;
    var r = Math.random();
    var f = r < 0.5 ? curFloor + 1 : r < 0.78 ? curFloor : curFloor - 1;
    return Math.max(1, Math.min(9, f));
  }
  // anything marked data-reveal shows its word, big, for a moment
  function reveal(word) {
    var o = document.createElement("div");
    o.textContent = word;
    o.style.cssText = "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;z-index:100;background:rgba(0,0,0,.82);color:#fff;font:700 clamp(44px,12vw,140px)/1 Arial,sans-serif;letter-spacing:.2em;pointer-events:none;opacity:0;transition:opacity .6s";
    document.body.append(o);
    requestAnimationFrame(function () { o.style.opacity = "1"; });
    setTimeout(function () { o.style.opacity = "0"; setTimeout(function () { o.remove(); }, 700); }, 2600);
  }
  document.addEventListener("click", function (e) {
    var t = e.target.closest && e.target.closest("[data-reveal]");
    if (t) { e.preventDefault(); reveal(t.dataset.reveal); }
  });

  // ---- the maze ----
  var SLUGS = ["index","door","inside","keys","liber","ledger","doors","cube","window","logs","ninth","transcripts","static","eyes","mirror","countdown","popups","rules","gematria","pixiee","church","faq","guestbook","webring","counter","downloads","construction","error","manifesto","notebook","patchnotes","tickets","bbs","terms","manual","keyhole"];
  var IMGS = [
    "../assets/hell/banner.png", "../assets/hell/skull-big.png", "../assets/hell/pentagram.png", "../assets/hell/enter.png",
    "../assets/media/pixilart%20pixie.png", "../assets/media/sega.png", "../assets/media/disc.png", "../assets/media/twitch.png",
    "../assets/media/moneystack.png", "../assets/media/sonicexe.gif", "../assets/media/nickwilde.gif", "../assets/media/coaching.png",
    "../assets/backgrounds/starrysky.gif", "../assets/backgrounds/comets.gif", "../assets/backgrounds/wallpaper-3-purple.png",
    "../assets/decor/halloween/ghost.png", "../assets/decor/halloween/bat.png", "../assets/decor/halloween/pumpkin.png",
    "../assets/avatar/eyes_fem_v1.png", "../assets/avatar/head_masc_v1.png", "../assets/avatar/head_fem_v2.png", "../assets/avatar/thixie_head_v1.png",
    "../assets/avatar/voidling_f.png", "../assets/avatar/voidling_m.png", "../assets/avatar/wings_v2.png", "../assets/avatar/hair_longwaves_v1.png",
    "../assets/ui/start-orb.png", "../assets/ui/errorwindows.jfif", "../assets/decor/clustervines.png",
    "../assets/hell/plate-plain.png", "../assets/hell/plate-mouth.png", "../assets/hell/plate-eyes.png", "../assets/hell/plate-dock.png",
    "../assets/hell/tiles/t01.png","../assets/hell/tiles/t02.png","../assets/hell/tiles/t03.png","../assets/hell/tiles/t04.png","../assets/hell/tiles/t05.png","../assets/hell/tiles/t06.png","../assets/hell/tiles/t07.png","../assets/hell/tiles/t08.png","../assets/hell/tiles/t09.png","../assets/hell/tiles/t10.png","../assets/hell/tiles/t11.png","../assets/hell/tiles/t12.png","../assets/hell/tiles/t13.png","../assets/hell/tiles/t14.png","../assets/hell/tiles/t15.png","../assets/hell/tiles/t16.png","../assets/hell/tiles/t17.png","../assets/hell/tiles/t18.png","../assets/hell/tiles/t19.png","../assets/hell/tiles/t20.png","../assets/hell/tiles/t21.png","../assets/hell/tiles/t22.png","../assets/hell/tiles/t23.png","../assets/hell/tiles/t24.png","../assets/hell/tiles/t25.png","../assets/hell/tiles/t26.png","../assets/hell/tiles/t27.png","../assets/hell/tiles/t28.png"
  ];
  function rint(n) { return Math.floor(Math.random() * n); }
  function target() {
    var r = Math.random();
    if (curFloor && r < 0.6) return "p.html?n=" + rint(99999) + "&f=" + nextFloor();
    if (r < 0.45) return SLUGS[rint(SLUGS.length)] + ".html";
    if (r < 0.88) return "p.html?n=" + rint(99999) + "&f=" + nextFloor();
    if (r < 0.96) return "room.html?n=" + rint(256);
    return "p.html?n=" + rint(99999) + "&f=" + nextFloor();
  }
  function arm(a) {
    a.href = target();
    a.addEventListener("mouseover", function () { a.href = target(); });
    a.addEventListener("focus", function () { a.href = target(); });
  }
  function makeLink(text) {
    var a = document.createElement("a");
    a.className = "r";
    a.textContent = text;
    arm(a);
    return a;
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a.r");
    if (a) a.href = target();
  }, true);

  var A = ["the Start menu","Satan's pillow","pixel 8","the 8th hour","my mother's cursor","THE CUBE","the unnamed folder","the warm chair","Infinite Compassion.exe","a bird made of RAM","the dock","the 256 doors","the ninth bit","the pixie's other face","the clipboard","somebody's wallpaper","the little arcade","the ledger","a thing in the taskbar","the fourth day","SAINT BYTE","Mother Cursor","Dr. Null","Bishop Dither","the Council of Seven Chairs","my other hand"];
  var V = ["devours","is married to","forgot","bleeds into","was never installed on","eats the shadow of","rewrites","counts","is a lie about","opens inward toward","has been dead since","pretends to be","sleeps inside","is the same as","IS NOT","cannot be dragged into","answers to","was baptised in","is hiding from","owes money to"];
  var O = ["the recycle bin","nine pillows","your handwriting","the sixth key","666 minutes","the cursor","an exit that is also an entrance","the corner of the screen","the last window","three hundred moths","the number 11","Tuesday","the glass","your first folder","Hell (it is a folder)","the one who types","a mouth the size of a pixel","the second sun","the left side of the mouse","a wet 404"];
  var T = [" - NOTE THIS."," and nobody was asked."," which is why the lights hum."," in the year of the broken taskbar."," FOR YOU."," REPEAT."," (see also the other one)."," ALL OF IT."," 666. 666. 666."," and then the floor said yes."," but only on weekdays."," WHICH YOU KNEW."," and I have the receipts."];
  var X = ["PIXELUS MORTIS EST","ego sum cursor","lux in fenestra","p i x e l . w o r l d","0 1 1 0 1 0 0 0 8 8 8","THE KEYS ARE IN THE KEYS","EIGHT IS A DOOR","IT IS WRITTEN IN THE CLIPBOARD","DO NOT FEED THE DOCK","NINE. NINE. NINE.","WHO TYPES THE TYPIST","KILL THE LIGHT. THE LIGHT IS A PIXEL.","THE LORD OF THE FOURTH DAY","a e i o u 8"];
  function esc(t) { return t.replace(/&/g, "&amp;").replace(/</g, "&lt;"); }

  // crank-doctrine generator: coined capitalised terms, "proof" that is simple math, wagers, persecution, slogans
  var RG = ["Tutorial Bastards","Educated Pixels","ONEbit Believers","Window Closers","Desktop Teachers","Icon Priests","The Dock Committee","Clipboard Scholars","Meridian Boot Personnel","Single-Cursor Fools","Start Menu Pedants","The Taskbar Brotherhood"];
  var RD = ["8 Simultaneous Desktops","The Ninth Bit Principle","Cubic Boot Creation","4-Corner Cursor Days","Belly-Port Logic","Opposite Pixel Harmonics","The Fourth Day","+0- Screen Math","Start Orb Navel Proof","The 256 Doors","Mother Cursor Creation"];
  var RI = ["Educated Stupid","Snotbrain","Dock Slaves","Cubeless","Single-Window Idiots","Evil Word Animals","Tutorial-Stupid","Half-Brain Slaves","Android Clickers","Dog-Brain Students"];
  var RT = ["Human","Monitor","Taskbar","Pixel","Window","Icon","Cursor","Keyboard","Desktop"];
  var RP = ["Belly-Port","Start Orb","Second Cursor","Back Corner","Opposite Side","Anti-Window","Ninth Bit"];
  var RE = ["Hide From Debate","Eat Dung Before Debating","Ignore The 8 Days","Close The Window That Was Never Open","Cower And Run","Delete My Comments","Teach The Lie Of Closing","Block This Site From Search"];
  var RC = ["8 Days Rotate In 1 Boot","The Cursor Has 4 Corners And A Back","Every Window Has An Anti-Window","Closing Is A Lie","The Pixie Has No Belly-Port","Your Desktop Looks At You Back","1 Pixel Is Not 1 Pixel","The Dock Has 2 Docks","Lit Plus Unlit Equals Nothing","Zero Is The Warm Door"];
  var RM = ["$666.66","$10,000.00","$256.00","1/4 Million Dollars","$8.00 And A Pillow"];
  var RN = ["30","256","666","11","8","9"];
  function cap(s) { return s; }
  function rp(rnd, l) { return l[Math.floor(rnd() * l.length)]; }
  function rantSentence(rnd) {
    var k = Math.floor(rnd() * 14);
    var G = rp(rnd, RG), D = rp(rnd, RD), I = rp(rnd, RI), C = rp(rnd, RC);
    switch (k) {
      case 0: return G + " Ignore " + D + ", It Proves Them " + I + ".";
      case 1: return "No " + rp(rnd, RT) + " On Earth Has No " + rp(rnd, RP) + ", It Proves Every " + G.split(" ")[0] + " A Liar.";
      case 2: return D + " Is Evil Math - " + rp(rnd, RD) + " Is God's Math.";
      case 3: return "I Have Invested " + rp(rnd, RN) + " Years And " + rp(rnd, RM) + " Researching " + D + ".";
      case 4: return "I Will Wager " + rp(rnd, RM) + " That " + C + ".";
      case 5: return "Until You KNOW " + C + " You Don't Deserve A Mouse.";
      case 6: return G + " Are " + I + ", They " + rp(rnd, RE) + ".";
      case 7: return rp(rnd, RN) + " " + rp(rnd, RT) + "s Equal " + rp(rnd, RN) + " " + rp(rnd, RT) + "s - Add Them As ONE = Nothing.";
      case 8: return "YOU ARE " + I.toUpperCase() + " - " + C.toUpperCase() + ".";
      case 9: return "A " + rp(rnd, RT) + " And A " + rp(rnd, RT) + " Are The Same Age, You " + I + ".";
      case 10: return "Dr. Null, Pixel-Wise And Cubic, Has " + rp(rnd, RM) + " On It: " + C + ".";
      case 11: return "Google Once Had 89,000,000 Links To This Site. Ask Why It Has " + rp(rnd, RN) + ".";
      case 12: return "I Got A Message From The Ledger Last Night, Saying " + G + " Will Wipe Me Off The Desktop. They Can't Allow " + D + " To Continue.";
      default: return C + " - " + G + " " + rp(rnd, RE) + ", And You " + I + " Know It.";
    }
  }
  // wrap to a narrow ragged column like the original stanzas
  function stanza(rnd, lines) {
    var text = [];
    for (var i = 0; i < lines; i++) text.push(rantSentence(rnd));
    var words = text.join(" ").split(" "), out = [], cur = "";
    var width = 22 + Math.floor(rnd() * 8);
    words.forEach(function (w) {
      if ((cur + " " + w).trim().length > width) { out.push(cur); cur = w; width = 20 + Math.floor(rnd() * 12); } else cur = (cur + " " + w).trim();
    });
    if (cur) out.push(cur);
    return out.map(esc).join("<br>");
  }

  function salad(rnd, n) {
    var out = [];
    function ph(list) {
      var t = esc(list[Math.floor(rnd() * list.length)]);
      return rnd() < 0.5 ? '<a class="r" href="#">' + t + "</a>" : t;
    }
    for (var i = 0; i < n; i++) {
      if (rnd() < 0.7) { out.push(esc(rantSentence(rnd))); continue; }
      if (rnd() < 0.14) { var x = X[Math.floor(rnd() * X.length)]; out.push(rnd() < 0.5 ? "<b>" + esc(x) + "</b>" : '<a class="r" href="#">' + esc(x) + "</a>"); continue; }
      var sent = ph(A) + " " + esc(V[Math.floor(rnd() * V.length)]) + " " + ph(O) + esc(T[Math.floor(rnd() * T.length)]);
      out.push(sent.charAt(0) === "<" ? sent : sent.charAt(0).toUpperCase() + sent.slice(1));
    }
    return out.join(" ");
  }
  function armAll(root) { (root || document).querySelectorAll("a.r").forEach(arm); }

  // nearly every paragraph gets words that are secretly links, and they go somewhere different each time
  function linkify() {
    document.querySelectorAll("p, li, td").forEach(function (el) {
      if (el.closest(".nolink, .mini, .soup, .fakewin, #exits")) return;
      var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      var nodes = [], n;
      while ((n = walker.nextNode())) {
        if (n.nodeValue.trim().length > 24 && !n.parentNode.closest("a, button, pre, textarea")) nodes.push(n);
      }
      nodes.forEach(function (node) {
        var parts = node.nodeValue.split(/(\s+)/);
        if (parts.length < 6) return;
        var frag = document.createDocumentFragment();
        parts.forEach(function (w) {
          if (/^\S{4,}$/.test(w) && Math.random() < 0.09) {
            var m = w.match(/^([^A-Za-z0-9]*)(.*?)([^A-Za-z0-9]*)$/);
            frag.append(m[1], makeLink(m[2]), m[3]);
          } else frag.append(w);
        });
        node.replaceWith(frag);
      });
    });
  }

  function soup() {
    if (document.body.hasAttribute("data-calm") || document.body.hasAttribute("data-nosoup")) return;
    var box = document.createElement("section");
    box.className = "soup nolink";
    var words = ["more","MORE","enter","ENTER","still here","back","not back","deeper","DEEPER","stop","yes","no","the other one","8","666","0","pixie","DOOR","hello","leave","LEAVE?","it knows","go on","again","c l i c k","ask","who","here","???","no exit","exit","exit (real)","exit (fake)","nine","the chair","behind","left","right","up","down","in","INSIDE","skip","continue","not that","that one","the real one"];
    var count = 24 + rint(26);
    for (var i = 0; i < count; i++) {
      var a = makeLink(words[rint(words.length)]);
      a.style.fontSize = 10 + rint(30) + "px";
      a.style.color = "hsl(" + rint(360) + ",70%," + (45 + rint(35)) + "%)";
      if (Math.random() < 0.12) a.style.transform = "rotate(" + (rint(40) - 20) + "deg)";
      if (Math.random() < 0.08) a.className += " blink";
      box.append(a, document.createTextNode(" "));
    }
    document.body.insertBefore(box, document.querySelector(".mini"));
  }

  // unlabeled pictures and invisible specks that are also doors
  function floaties() {
    if (document.body.hasAttribute("data-calm")) return;
    var h = Math.max(document.body.scrollHeight, innerHeight);
    var k = 2 + rint(3);
    for (var i = 0; i < k; i++) {
      var a = makeLink("");
      a.className = "r floaty";
      var img = document.createElement("img");
      img.src = IMGS[rint(IMGS.length)];
      img.alt = "";
      var w = 50 + rint(110);
      img.style.width = w + "px";
      var f = [];
      if (Math.random() < 0.3) f.push("invert(1)");
      if (Math.random() < 0.4) f.push("hue-rotate(" + rint(360) + "deg)");
      if (Math.random() < 0.3) f.push("contrast(1.6) saturate(.3)");
      img.style.filter = f.join(" ");
      img.style.transform = "rotate(" + (rint(60) - 30) + "deg)" + (Math.random() < 0.3 ? " scaleX(-1)" : "");
      a.style.left = rint(Math.max(10, innerWidth - w - 20)) + "px";
      a.style.top = rint(Math.max(10, h - 120)) + "px";
      a.append(img);
      document.body.append(a);
    }
    for (var j = 0; j < 4; j++) {
      var g = makeLink(["...", "o", "~", "::"][rint(4)]);
      g.className = "r ghost";
      g.style.position = "absolute";
      g.style.left = rint(Math.max(10, innerWidth - 40)) + "px";
      g.style.top = rint(Math.max(10, h - 40)) + "px";
      g.style.fontSize = 14 + rint(40) + "px";
      g.style.zIndex = 9;
      document.body.append(g);
    }
  }
  window.addEventListener("load", function () {
    linkify();
    soup();
    floaties();
    armAll();
    corrupt();
  });


  window.Hell = { keyAdd: keyAdd, keyCount: keyCount, allowedFloor: allowedFloor, KEYLEN: KEYLEN, reveal: reveal, rant: stanza, rantSentence: rantSentence, salad: salad, makeLink: makeLink, armAll: armAll, IMGS: IMGS, SLUGS: SLUGS, target: target, rint: rint, S: S, save: save, depth: depth, name: name, clock: clock, mulberry: mulberry, pick: pick, whisper: whisper, pad: pad, tz: tz };
})();
