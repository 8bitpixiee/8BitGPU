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

  const SHADES=['#b9a2d6','#a7c7bb','#d3abc4','#a5b8d5','#d6bea3','#9dc9cd','#c4b3d7','#b8c7a5','#c7b1ca','#b3bddb','#d5b4c0','#a7c3b6','#d2c49d','#b6aed1','#c2a9da','#a9cbbf','#b4bdda'];
  function mini(id) {
    const ids=[...Object.keys(SELF),...Object.keys(CREW)],index=ids.indexOf(id);if(index<0)return null;
    const node=document.createElement('span');node.className='badge-mini crystal';node.dataset.badge=id;
    node.title=CREW[id]?.[0]||SELF[id][0];node.setAttribute('role','img');node.setAttribute('aria-label',node.title);
    node.style.setProperty('--crystal',SHADES[index]);node.dataset.cut=index%4;
    const face=document.createElement('span');face.className='crystal-face';face.setAttribute('aria-hidden','true');node.append(face);return node;
  }
  function chip(id) {
    const crystal=mini(id);if(!crystal)return null;
    const node=document.createElement('span');node.className='badge';node.dataset.badge=id;
    const copy=document.createElement('span');copy.className='badge-copy';
    const title=document.createElement('strong');title.textContent=crystal.title;
    const detail=document.createElement('small');detail.textContent=CREW[id]?.[1]||DETAILS[id]?.[0]||'';
    copy.append(title,detail);node.append(crystal,copy);return node;
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

  function refresh(element){
    const badges=element._badgeData,strip=element.querySelector('.badge-strip');if(!badges||!strip)return;
    const selected=element._nameplate?.visibleBadges;
    const all=[...new Set([...(badges.earned||[]),...(badges.picks||[])])];
    const ids=element._nameplate?all.filter(id=>selected==null||selected.includes(id)):[...(badges.earned||[]),...(badges.picks||[]).slice(0,2)];
    strip.replaceChildren();ids.forEach((id,index)=>{const node=mini(id);if(node){node.style.setProperty('--shard-index',index);strip.append(node);}});
  }
  function mark(element,name){
    if(!name)return;
    if(!element.querySelector('.badge-strip')){const strip=document.createElement('span');strip.className='badge-strip';element.append(strip);}
    lookup(name).then(badges=>{element._badgeData=badges;refresh(element);});
  }
  root.Badges={SELF,CREW,MAX_PICKS,chip,mini,mark,lookup,render,picker,refresh};
})(window);
