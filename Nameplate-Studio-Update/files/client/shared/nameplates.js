/* Shared rendering only. All colors are scoped to the plate itself. */
window.Nameplates = (() => {
  const defaults = {palette:'lilac', frame:'scallop', charm:'sparkle', title:''};
  const charms = {
    sparkle:{label:'Stardust',symbol:'✦'}, heart:{label:'Sweetheart',symbol:'♡'}, moon:{label:'Moonbeam',symbol:'☾'},
    flower:{label:'Lilac bloom',file:'flower'}, wings:{label:'Angel wings',file:'wings'},
    music:{label:'Music lover',file:'music'}, disc:{label:'Mixtape',file:'disc'}, cash:{label:'Money magic',file:'cash'},
    kiss:{label:'Purple kiss',file:'kiss'}, 'violet-user':{label:'Violet buddy',file:'violet-user'},
    'sunset-user':{label:'Sunset buddy',file:'sunset-user'}, eyes:{label:'All eyes',file:'eyes'}, none:{label:'No charm',symbol:''}
  };
  function charmNode(key) {
    const charm = charms[key] || charms.sparkle;
    const node = document.createElement('span'); node.className='plate-charm'; node.setAttribute('aria-hidden','true');
    if(charm.file) { const img=document.createElement('img');img.src='assets/ui/nameplates/'+charm.file+'-transparent.png';img.alt='';node.append(img); }
    else node.textContent=charm.symbol;
    return node;
  }
  function render(node, username, settings, self=false) {
    const plate={...defaults,...settings};
    const signature=JSON.stringify([username,plate,self]);if(node.dataset.plateSignature===signature)return;node.dataset.plateSignature=signature;
    node.classList.add('cute-nameplate'); node.dataset.palette=plate.palette;node.dataset.frame=plate.frame;
    const text=document.createElement('span');text.className='plate-copy';
    const name=document.createElement('strong');name.textContent=username;
    text.append(name);
    if(plate.title){const title=document.createElement('small');title.textContent=plate.title;text.append(title);}
    const detail=document.createElement('span');detail.className='plate-detail';detail.textContent=self?'you':'✧';detail.setAttribute('aria-hidden','true');
    const badges=node.querySelector('.badge-strip');node.replaceChildren(charmNode(plate.charm),text,detail);if(badges)node.append(badges);node.dataset.username=username;
    if(node.tagName==='BUTTON') {node.title=(self?'Your MyPixel page':'Open '+username+'’s MyPixel page')+(plate.title?' · '+plate.title:'');node.setAttribute('aria-label',node.title);}
  }
  return { defaults, charms, charmNode, render };
})();
