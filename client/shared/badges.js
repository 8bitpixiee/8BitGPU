(function (root) {
  // keep this list in step with SELF_BADGES in server/badges.js
  const SELF = {
    "night-owl": ["Night Owl", 265],
    "early-bird": ["Early Bird", 45],
    gamer: ["Gamer", 150],
    artist: ["Artist", 330],
    musician: ["Musician", 200],
    streamer: ["Streamer", 280],
    builder: ["Builder", 25],
    dancer: ["Dancer", 305],
    collector: ["Collector", 85],
    cozy: ["Cozy", 15],
    chaotic: ["Chaotic", 0],
    "plant-parent": ["Plant Parent", 120],
    "tea-person": ["Tea Person", 70],
    "cat-person": ["Cat Person", 230],
  };
  const CREW = {
    "pixiee-pal": ["Pixiee's Pal", "Friends with 8Bit_Pixiee.dev"],
    "pickle-pal": ["Pickle's Pal", "Friends with pickle"],
    crew: ["Crew", "Makes 8BitGPU"],
  };
  const DETAILS = {"night-owl":["Moonlit chats and late-night adventures.","☾"],"early-bird":["A bright start to the day.","☀"],"gamer":["Always ready for another round.","✧"],"artist":["Making a little magic with color.","flower"],"musician":["A soundtrack for every mood.","music"],"streamer":["Sharing the fun, one stream at a time.","disc"],"builder":["Dreaming it up and making it real.","✦"],"dancer":["Moving to their own rhythm.","wings"],"collector":["A home for tiny treasures.","cash"],"cozy":["Soft vibes and a comfy corner.","♡"],"chaotic":["A little mischief in the mix.","eyes"],"plant-parent":["Growing a greener little world.","flower"],"tea-person":["A warm cup and good company.","☕"],"cat-person":["A soft spot for whiskers and paws.","♡"]};
  const MAX_PICKS = 5;

  function chip(id) {
    const node = document.createElement("span");
    node.className = "badge";
    node.dataset.badge = id;
    if (CREW[id]) {
      node.classList.add("is-crew");
      node.title = CREW[id][1];
      const icon = document.createElement("img");
      icon.src = `assets/ui/badges/${id}.png`;
      icon.alt = "";
      node.append(icon, CREW[id][0]);
    } else if (SELF[id]) {
      node.style.setProperty("--hue", SELF[id][1]);
      const gem = document.createElement("i");
      gem.setAttribute("aria-hidden", "true");
      node.append(gem, SELF[id][0]);
    } else return null;
    const label=CREW[id]?.[0]||SELF[id]?.[0];
    const description=CREW[id]?.[1]||DETAILS[id]?.[0]||'';
    if(SELF[id]&&DETAILS[id]) {
      const art=DETAILS[id][1];
      let icon;
      if(art.length>2){icon=document.createElement('img');icon.src='assets/ui/nameplates/'+art+'-transparent.png';icon.alt='';}
      else {icon=document.createElement('span');icon.className='badge-symbol';icon.setAttribute('aria-hidden','true');icon.textContent=art;}
      node.replaceChildren(icon);
    } else node.removeChild(node.lastChild);
    const copy=document.createElement('span');copy.className='badge-copy';
    const title=document.createElement('strong');title.textContent=label;
    const detail=document.createElement('small');detail.textContent=description;
    copy.append(title,detail);node.append(copy);node.title=description;node.setAttribute('aria-label',label+'. '+description+(CREW[id]?'. Earned badge.':'. Self-selected badge.'));
    return node;
  }

  // earned ones lead, they are the ones somebody else gave you
  function render(container, badges, emptyText) {
    container.replaceChildren();
    const ids = [...(badges?.earned || []), ...(badges?.picks || [])];
    for (const id of ids) {
      const node = chip(id);
      if (node) container.append(node);
    }
    if (!container.children.length && emptyText) {
      const note = document.createElement("small");
      note.textContent = emptyText;
      container.append(note);
    }
  }

  function picker(container, picked, onChange) {
    const chosen = new Set(picked);
    container.replaceChildren();
    for (const id of Object.keys(SELF)) {
      const label = document.createElement("label");
      label.className = "badge-choice";
      const box = document.createElement("input");
      box.type = "checkbox";
      box.value = id;
      box.checked = chosen.has(id);
      box.onchange = () => {
        if (box.checked) chosen.add(id);
        else chosen.delete(id);
        if (chosen.size > MAX_PICKS) {
          chosen.delete(id);
          box.checked = false;
        }
        container.dataset.count = chosen.size;
        onChange?.([...chosen]);
      };
      label.append(box, chip(id));
      container.append(label);
    }
    container.dataset.count = chosen.size;
    return () => [...chosen];
  }

  // small icon-only version that sits next to a name in chats and rooms
  function mini(id) {
    const node = document.createElement("span");
    node.className = "badge-mini";
    node.dataset.badge = id;
    if (CREW[id]) {
      node.title = CREW[id][0];
      const icon = document.createElement("img");
      icon.src = `assets/ui/badges/${id}.png`;
      icon.alt = "";
      node.append(icon);
    } else if (SELF[id]) {
      node.title = SELF[id][0]+" · "+DETAILS[id][0];
      node.style.setProperty("--hue", SELF[id][1]);
      node.classList.add("is-self");
    } else return null;
    return node;
  }

  // names are looked up in batches and remembered for a minute
  const cache = new Map();
  const waiting = new Map();
  let timer = 0;
  function lookup(name) {
    const key = name.toLowerCase();
    const hit = cache.get(key);
    if (hit && hit.until > Date.now()) return Promise.resolve(hit.badges);
    if (!waiting.has(key)) {
      let resolve;
      waiting.set(key, { name, promise: new Promise((r) => (resolve = r)), resolve });
    }
    if (!timer)
      timer = setTimeout(async () => {
        timer = 0;
        const batch = [...waiting.values()];
        waiting.clear();
        let found = {};
        try {
          const response = await fetch("/api/badges?users=" + encodeURIComponent(batch.map((b) => b.name).join(",")));
          if (response.ok) found = (await response.json()).badges || {};
        } catch {
          /* names just show without badges */
        }
        const byLower = Object.fromEntries(Object.entries(found).map(([n, v]) => [n.toLowerCase(), v]));
        for (const item of batch) {
          const badges = byLower[item.name.toLowerCase()] || { picks: [], earned: [] };
          cache.set(item.name.toLowerCase(), { badges, until: Date.now() + 60000 });
          item.resolve(badges);
        }
      }, 30);
    return waiting.get(key).promise;
  }

  // appends a strip to the element and fills it once the badges arrive: earned first, then up to two picks
  function mark(element, name) {
    if (!name) return;
    const strip = document.createElement("span");
    strip.className = "badge-strip";
    element.append(strip);
    lookup(name).then((badges) => {
      for (const id of [...badges.earned, ...badges.picks.slice(0, 2)]) {
        const node = mini(id);
        if (node) strip.append(node);
      }
    });
  }

  root.Badges = { SELF, CREW, MAX_PICKS, chip, mini, mark, lookup, render, picker };
})(window);
