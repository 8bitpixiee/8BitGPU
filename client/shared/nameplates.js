/* Plate colors never read or write the global window theme. */
window.Nameplates=(()=>{
 const defaults={"palette":"lilac","frame":"ticket","charm":"none","title":"","colors":{"background":{"h":270,"s":22,"l":24},"border":{"h":270,"s":26,"l":65},"name":{"h":275,"s":30,"l":92},"title":{"h":270,"s":22,"l":78}},"visibleBadges":null};
 function render(node,username,settings,self=false){
  const plate={...defaults,...settings,colors:{...defaults.colors,...settings?.colors}};
  node._nameplate=plate;
  const signature=JSON.stringify([username,plate,self]);
  if(node.dataset.plateSignature===signature)return;
  node.dataset.plateSignature=signature;node.classList.add('cute-nameplate');
  for(const [key,c] of Object.entries(plate.colors)){
   if(c&&['h','s','l'].every(k=>Number.isFinite(c[k])))node.style.setProperty('--plate-'+key,'hsl('+c.h+' '+c.s+'% '+c.l+'%)');
  }
  const text=document.createElement('span');text.className='plate-copy';
  const name=document.createElement('strong');name.textContent=username;text.append(name);
  if(plate.title){const title=document.createElement('small');title.textContent=plate.title;text.append(title);}
  const strip=node.querySelector('.badge-strip');node.replaceChildren(text);if(strip)node.append(strip);
  node.dataset.username=username;
  if(node.tagName==='BUTTON'){node.title=self?'Your profile card':username+'’s profile card';node.setAttribute('aria-label',node.title);}
  window.Badges?.refresh(node);
 }
 return {defaults,render};
})();
