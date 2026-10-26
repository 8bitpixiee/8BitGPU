
const el=id=>document.getElementById(id),copy=value=>structuredClone(value);
let draft=copy(Nameplates.defaults),username='Your Being',badges={earned:[],picks:[]},ready=false;
function preview(){
 Nameplates.render(el('platePreview'),username,draft);const node=el('platePreview');
 if(!node.querySelector('.badge-strip')){const strip=document.createElement('span');strip.className='badge-strip';node.append(strip);}
 node._badgeData=badges;Badges.refresh(node);el('titleCount').textContent=draft.title.length+' / 28';
}
function sliders(){const c=draft.colors[el('colorTarget').value];for(const k of ['h','s','l']){el(k).value=c[k];el(k+'Value').textContent=c[k]+(k==='h'?'°':'%');}}
function choices(){
 const container=el('badgeChoices');container.replaceChildren();
 const ids=[...new Set([...badges.earned,...badges.picks])];
 if(!ids.length){container.textContent='No badges yet. Choose your badges on MyPixel.';return;}
 for(const id of ids){const shard=Badges.mini(id);if(!shard)continue;
  const label=document.createElement('label');label.className='crystal-choice';
  const box=document.createElement('input');box.type='checkbox';box.value=id;box.checked=draft.visibleBadges===null||draft.visibleBadges.includes(id);
  box.onchange=()=>{draft.visibleBadges=[...container.querySelectorAll('input:checked')].map(n=>n.value);preview();el('studioStatus').textContent='Unsaved changes';};
  label.append(box,shard,document.createTextNode(shard.title));container.append(label);
 }
}
el('colorTarget').onchange=sliders;
for(const k of ['h','s','l'])el(k).oninput=()=>{draft.colors[el('colorTarget').value][k]=Number(el(k).value);sliders();preview();el('studioStatus').textContent='Unsaved changes';};
el('plateTitle').oninput=()=>{draft.title=el('plateTitle').value;preview();el('studioStatus').textContent='Unsaved changes';};
el('resetPlate').onclick=()=>{draft={...copy(Nameplates.defaults),title:draft.title,visibleBadges:draft.visibleBadges};sliders();preview();el('studioStatus').textContent='Default colors previewed. Save to keep them.';};
async function request(url,options){const r=await fetch(url,{cache:'no-store',...options});const data=await r.json();if(!r.ok)throw Error(data.error||'Could not load your nameplate.');return data;}
el('nameplateForm').onsubmit=async event=>{event.preventDefault();if(!ready)return;el('savePlate').disabled=true;
 try{const data=await request('/api/nameplate/me',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({nameplate:draft})});draft=copy(data.nameplate);el('plateTitle').value=draft.title;preview();sliders();choices();parent.postMessage({type:'8bitgpu-nameplate-saved'},location.origin);el('studioStatus').textContent='Saved ♡';}
 catch(error){el('studioStatus').textContent=error.message;}finally{el('savePlate').disabled=false;}
};
(async()=>{try{
 const [data,p]=await Promise.all([request('/api/nameplate/me'),request('/api/profile/me')]);
 draft={...copy(Nameplates.defaults),...data.nameplate,colors:{...copy(Nameplates.defaults.colors),...data.nameplate.colors}};username=data.username;badges=p.profile.badges||badges;
 ready=true;for(const id of ['plateTitle','colorControls','badgeControls','resetPlate','savePlate'])el(id).disabled=false;
 el('plateTitle').value=draft.title;preview();sliders();choices();el('studioStatus').textContent='';
 }catch(error){el('studioStatus').textContent=error.message;}})();preview();sliders();
