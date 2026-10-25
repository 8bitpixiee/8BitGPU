function skinFilter(color) { const value=(key,fallback)=>Number.isFinite(Number(color?.[key]))?Number(color[key]):fallback; return `hue-rotate(${Math.max(-180,Math.min(180,value('hue',0)))}deg) saturate(${Math.max(0,Math.min(200,value('saturation',100)))}%) brightness(${Math.max(60,Math.min(140,value('lightness',100)))}%)`; }
function whiteSpriteFilter(color) { const value=(key,fallback)=>Number.isFinite(Number(color?.[key]))?Number(color[key]):fallback; const hue=Math.max(-180,Math.min(180,value('hue',0))), saturation=Math.max(0,Math.min(200,value('saturation',100))), lightness=Math.max(60,Math.min(140,value('lightness',100))); return (hue === 0 && saturation === 100 && lightness === 100) ? "none" : `sepia(100%) saturate(${Math.max(100,saturation*4)}%) hue-rotate(${hue-28}deg) brightness(${lightness}%)`; }
function baseLayers(avatar) {
  if (avatar?.bodyAsset) return { body: `assets/avatar/${avatar.bodyAsset}`, head: "" };
  const tone = avatar?.skinTone;
  const species = avatar?.species;
  const build = avatar?.build;
  if (species === "Pixie") {
    const number = { Nutmeg: 1, Peachy: 2, Creme: 3 }[tone] || 1;
    const type = build === "Masc" ? "masc" : build === "Chunky Masc" ? "chunky_masc" : "fem";
    return {
      body: `assets/avatar/body_${type}_v${number}.png`,
      head: `assets/avatar/head_${type}_v${number}.png`,
    };
  }
  if (species === "Deerbra") {
    const number = { Wood: 1, Copper: 2, Pedal: 3 }[tone] || 1;
    return {
      body: `assets/avatar/body_fem_deerbra_v${number}.png`,
      head: `assets/avatar/head_fem_deerbra_v${number}.png`,
    };
  }
  if (species === "Bovadill") {
    const toneNumber = { Cocoa: 1, Peachy: 2, Milky: 3 }[tone] || 1;
    const breedNumber = { Highland: 1, Holstein: 2, Dexter: 3 }[build] || 1;
    return {
      body: `assets/avatar/bovidil_body_fem_v${toneNumber}.${breedNumber}.png`,
      head: "assets/avatar/bovidil_head_fem_v1.png",
    };
  }
  if (species === "Thixie") {
    const number = { Nutmeg: 1, Creme: 2, Peachy: 3 }[tone] || 1;
    return {
      body: `assets/avatar/thixie_body_v${number}.png`,
      head: `assets/avatar/thixie_head_v${number}.png`,
    };
  }
  return { body: "assets/avatar/body_fem_v1.png", head: "assets/avatar/head_fem_v1.png" };
}
const studio = window.Nameplates;
const studioEl = id => document.getElementById(id);
const descriptions = {
  sparkle:'A tiny sparkle for your little corner of the room.',heart:'A little love, wherever your Being wanders.',moon:'For late-night chats and daydreams.',
  flower:'A glossy lilac bloom with a little fairy energy.',wings:'Pixel wings for an angelic entrance.',music:'A purple note for the soundtrack of your day.',disc:'A tiny mixtape full of favorite memories.',cash:'Pixel pocket money. Purely decorative!',kiss:'A purple leopard-print kiss, sealed with attitude.',
  'violet-user':'A glossy violet buddy with an old-internet soul.','sunset-user':'A warm little buddy in candy sunset colors.',eyes:'For curious Beings who see everything.',none:'Let your name and your tiny title do the talking.'
};
let draft={...studio.defaults},saved={...studio.defaults},studioUsername='Your Being',ready=false;
function updatePreview(){
  studio.render(studioEl('platePreview'),studioUsername,draft);
  studioEl('titleCount').textContent=draft.title.length+' / 28';
  for(const button of document.querySelectorAll('[data-option]'))button.setAttribute('aria-pressed',String(draft[button.dataset.option]===button.dataset.value));
  studioEl('charmPreview').replaceChildren(studio.charmNode(draft.charm));
  studioEl('charmName').textContent=studio.charms[draft.charm].label;
  studioEl('charmDescription').textContent=descriptions[draft.charm];
}
function addChoice(container,option,value,label){
  const button=document.createElement('button');button.type='button';button.className='choice';button.dataset.option=option;button.dataset.value=value;button.setAttribute('aria-label',label);button.textContent=label;
  button.onclick=()=>{draft[option]=value;updatePreview();studioEl('studioStatus').textContent='Unsaved changes';};container.append(button);return button;
}
for(const [value,label,color] of [['lilac','Lilac','#d9b9ed'],['rose','Rose','#f4b8d3'],['mint','Mint','#b3e3d2'],['peach','Peach','#ffd1ad'],['midnight','Midnight','#3b3057']]){
  const button=addChoice(studioEl('paletteChoices'),'palette',value,label);button.classList.add('palette-choice');const swatch=document.createElement('span');swatch.className='swatch';swatch.style.setProperty('--swatch',color);button.prepend(swatch);
}
for(const [value,label] of [['scallop','Petal corners'],['pill','Soft pill'],['ticket','Tiny ticket']])addChoice(studioEl('frameChoices'),'frame',value,label);
for(const [key,charm] of Object.entries(studio.charms)){const button=addChoice(studioEl('charmChoices'),'charm',key,charm.label);button.prepend(studio.charmNode(key));}
studioEl('plateTitle').oninput=event=>{draft.title=event.target.value;updatePreview();studioEl('studioStatus').textContent='Unsaved changes';};
studioEl('resetPlate').onclick=()=>{draft={...studio.defaults};studioEl('plateTitle').value='';updatePreview();studioEl('studioStatus').textContent='Default style previewed. Save to keep it.';};
async function studioRequest(path,options){const response=await fetch(path,{cache:'no-store',...options});const data=await response.json();if(!response.ok)throw Error(data.error||'Your nameplate could not save.');return data;}
studioEl('nameplateForm').onsubmit=async event=>{
  event.preventDefault();if(!ready)return;studioEl('savePlate').disabled=true;studioEl('studioStatus').textContent='Saving…';
  try{const data=await studioRequest('/api/nameplate/me',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({nameplate:draft})});saved={...data.nameplate};draft={...saved};studioEl('plateTitle').value=draft.title;updatePreview();if(parent!==window)parent.postMessage({type:'8bitgpu-nameplate-saved'},location.origin);studioEl('studioStatus').textContent='Your nameplate is saved. See you in the Lounge!';}
  catch(error){studioEl('studioStatus').textContent=error.message;}finally{studioEl('savePlate').disabled=false;}
};
async function loadStudio(){
  try{
    const data=await studioRequest('/api/nameplate/me');studioUsername=data.username;saved={...data.nameplate};draft={...saved};studioEl('plateTitle').value=draft.title;ready=true;studioEl('savePlate').disabled=false;updatePreview();studioEl('studioStatus').textContent='';
    const {profile}=await studioRequest('/api/profile/me');
    const avatar=profile.avatar;
    await AvatarLayout.ready;if(avatar){avatar.layers={...avatar.layers,...baseLayers(avatar)};for(const key of ['extra','body','ears','head','chest','eyes','hair','fit']){const source=avatar.layers[key];if(!source)continue;const image=document.createElement('img');image.src=source;image.alt='';image.onerror=()=>image.remove();AvatarLayout.apply(image,avatar.layers.body,key,source);image.style.transform=AvatarLayout.transform(avatar,key);AvatarColors.applyLayer(image,avatar,key,studioEl('studioBeing').querySelector('[data-avatar-color-layer=body]')); studioEl('studioBeing').append(image);}}
    if(!studioEl('studioBeing').children.length){const image=document.createElement('img');image.src='assets/avatar/Maxie_F.png';image.alt='';studioEl('studioBeing').append(image);}
  }catch(error){studioEl('studioStatus').textContent=error.message;}
}
updatePreview();loadStudio();

document.querySelector('.studio-title a').addEventListener('click',event=>{if(parent===window)return;event.preventDefault();parent.postMessage({type:'8bitgpu-open-app',app:'arcade'},location.origin);});
