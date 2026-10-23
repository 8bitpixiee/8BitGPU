// Edit the same saved palette used by MyPixel and the shared window theme.
(() => {
 const defaults={panel:'#e4d5ee',edge:'#724a91',accent:'#b95fd4',paper:'#fffdf8',ink:'#321c48'};
 const names={panel:'Taskbar & button faces',edge:'Active windows & selections',accent:'Accent color',paper:'Inset panels & clock tray',ink:'Text on inset panels'};
 const valid=value=>/^#[0-9a-f]{6}$/i.test(value||'');
 const panel=document.createElement('details');panel.id='globalAppearanceColors';panel.open=true;
 const summary=document.createElement('summary');summary.textContent='Desktop colors · taskbar, menus & windows';panel.append(summary);
 const controls=new Map(),dirty=new Set();let baseline={...defaults},palette={...defaults},saving=false;
 function notify(preview=true){window.applyWindowTheme?.(palette);if(parent!==window)parent.postMessage({type:'8bitgpu-theme-saved',colors:palette,preview},location.origin);}
 function toHsl(hex){const [r,g,b]=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255),max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min,l=(max+min)/2;let h=0;if(d)h=max===r?((g-b)/d+6)%6:max===g?(b-r)/d+2:(r-g)/d+4;return {h:Math.round(h*60),s:Math.round(d?d/(1-Math.abs(2*l-1))*100:0),l:Math.round(l*100)};}
 function toHex(h,s,l){s/=100;l/=100;const c=(1-Math.abs(2*l-1))*s,x=c*(1-Math.abs(h/60%2-1)),m=l-c/2,rgb=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];return '#'+rgb.map(v=>Math.round((v+m)*255).toString(16).padStart(2,'0')).join('');}
 const status=document.createElement('p');status.id='globalAppearanceStatus';status.setAttribute('role','status');
 for(const [key,name] of Object.entries(names)){
  const item=document.createElement('details');item.className='global-color-item';const title=document.createElement('summary'),swatch=document.createElement('span');swatch.className='global-swatch';swatch.setAttribute('aria-hidden','true');title.append(swatch,name);item.append(title);
  const body=document.createElement('div');body.className='global-color-body';const heading=document.createElement('div');heading.className='global-color-heading';const well=document.createElement('input');well.type='color';well.setAttribute('aria-label',name+' color');const hex=document.createElement('input');hex.type='text';hex.maxLength=7;hex.setAttribute('aria-label',name+' hex');heading.append(well,hex);body.append(heading);const sliders={};
  function edit(value,hsl){if(!valid(value))return;palette[key]=value.toLowerCase();dirty.add(key);update(hsl);notify();status.textContent='Previewing changes. Save colors to keep them.';}
  for(const [part,label,max] of [['h','Hue',360],['s','Saturation',100],['l','Lightness',100]]){const row=document.createElement('label'),output=document.createElement('output'),range=document.createElement('input');row.textContent=label;row.append(output);range.type='range';range.min=0;range.max=max;range.step=1;range.setAttribute('aria-label',name+' '+label);range.oninput=()=>{const hsl={h:+sliders.h.range.value,s:+sliders.s.range.value,l:+sliders.l.range.value};edit(toHex(hsl.h,hsl.s,hsl.l),hsl);};body.append(row,range);sliders[part]={range,output};}
  function update(hsl=toHsl(palette[key])){well.value=hex.value=palette[key];swatch.style.background=palette[key];for(const [part,{range,output}] of Object.entries(sliders)){range.value=hsl[part];output.textContent=hsl[part]+(part==='h'?'°':'%');}}
  well.oninput=()=>edit(well.value);hex.oninput=()=>{hex.setCustomValidity(hex.value&&!valid(hex.value)?'Use a hex color such as #b998dd.':'');if(valid(hex.value))edit(hex.value);};hex.onchange=()=>{if(!valid(hex.value))update();};controls.set(key,update);item.append(body);panel.append(item);
 }
 const actions=document.createElement('div');actions.className='global-color-actions';const save=document.createElement('button'),revert=document.createElement('button');save.type=revert.type='button';save.textContent='Save colors';revert.textContent='Revert preview';actions.append(save,revert);panel.append(actions,status);
 document.querySelector('label[for="fontChoice"]')?.before(panel);
 if(!panel.isConnected)document.querySelector('h1').after(panel);
 async function getProfile(){const response=await fetch('/api/profile/me',{cache:'no-store'});if(!response.ok)throw Error('Sign in to save your desktop colors.');return (await response.json()).profile;}
 function adopt(style){for(const key of Object.keys(defaults))if(valid(style?.[key]))palette[key]=style[key];baseline={...palette};controls.forEach(update=>update());}
 getProfile().then(profile=>{if(!dirty.size)adopt(profile.style);status.textContent='These are the same saved colors used by MyPixel.';}).catch(error=>{adopt({});status.textContent=error.message;});
 revert.onclick=()=>{palette={...baseline};dirty.clear();controls.forEach(update=>update());notify();status.textContent='Preview reverted.';};
 save.onclick=async()=>{
  if(saving||!dirty.size)return;saving=true;save.disabled=true;
  const edits=Object.fromEntries([...dirty].map(key=>[key,palette[key]]));
  try{const fresh=await getProfile();const response=await fetch('/api/profile/me/style',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({style:{...fresh.style,...edits}})});const data=await response.json();if(!response.ok)throw Error(data.error||'Could not save colors.');adopt(data.profile.style);dirty.clear();notify(false);status.textContent='Saved to your account. Taskbar, windows and MyPixel share this palette.';}
  catch(error){status.textContent=error.message;}finally{saving=false;save.disabled=false;}
 };
 window.addEventListener('pagehide',()=>{if(dirty.size){palette={...baseline};notify();}});
 window.addEventListener('message',event=>{if(event.origin===location.origin&&event.data?.type==='8bitgpu-theme-saved'&&!event.data.preview&&!dirty.size)adopt(event.data.colors);});
 controls.forEach(update=>update());
})();
