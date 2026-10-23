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

  root.Badges = { SELF, CREW, MAX_PICKS, chip, render, picker };
})(window);
