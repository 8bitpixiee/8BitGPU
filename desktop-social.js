(() => {
 const hud=document.getElementById('beingHud');if(!hud)return;
 const button=document.createElement('button');button.id='socialLauncher';button.type='button';button.textContent='Social';button.onclick=()=>openApp('social');hud.append(button);
 let busy=false;
 async function refresh(){if(document.hidden||busy)return;busy=true;try{const r=await fetch('/api/social/events',{cache:'no-store'});if(!r.ok){button.textContent='Social';return;}const d=await r.json();button.textContent=d.unread?'Social · '+d.unread:'Social';button.setAttribute('aria-label',d.unread?'Social, '+d.unread+' unread notifications':'Open Social');}catch{}finally{busy=false;}}
 refresh();setInterval(refresh,6000);document.addEventListener('visibilitychange',refresh);
})();
