// Loaded after desktop/script.js. Both launch buttons reuse the same room window.
(() => {
  const original=window.openApp;
  const configs={arcade:{title:'Arcade Lounge.exe',src:'arcade.html?room=arcade'},pillow:{title:'Pillow Room.exe',src:'arcade.html?room=pillow'}};
  function configure(room){
    Object.assign(desktopApps.arcade,configs[room]);
    const win=openWindows.get('arcade');
    if(win){win.querySelector('.os-window-title').textContent=configs[room].title;const tab=document.querySelector('#osTaskTabs [data-app="arcade"]');if(tab)tab.textContent=configs[room].title;}
    return win;
  }
  window.openApp=(name,...args)=>{
    if(name!=='arcade'&&name!=='pillow')return original(name,...args);
    const room=name,win=configure(room),frame=win?.querySelector('iframe');
    if(frame){let href=frame.src;try{href=frame.contentWindow.location.href;}catch{}const current=new URL(href,location.href).searchParams.get('room')||'arcade';if(current!==room)frame.src=configs[room].src;}
    return original('arcade',...args);
  };
  window.addEventListener('message',event=>{
    if(event.origin!==location.origin||!['8bitgpu-room-changed','8bitgpu-room-travel'].includes(event.data?.type)||!configs[event.data.room])return;
    const win=openWindows.get('arcade');if(event.source!==win?.querySelector('iframe')?.contentWindow)return;
    configure(event.data.room);
    if(event.data.type==='8bitgpu-room-travel')win.querySelector('iframe').src=configs[event.data.room].src+'&from='+(event.data.room==='arcade'?'pillow':'arcade');
  });
})();
