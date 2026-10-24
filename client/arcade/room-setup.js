// Shared room page: the URL chooses the room; the server validates it again.
(() => {
  const rooms = {
    arcade: {id:'arcade',name:'Arcade Lounge',title:'Arcade Lounge.exe',image:'assets/maps/arcade/arcade-02-wide.png',width:1800,height:1200,spawn:{x:50,y:70},entry:{x:50,y:84},bounds:{minX:6,maxX:94,minY:12,maxY:94},other:'pillow',door:{x:50,y:90}},
    pillow: {id:'pillow',name:'The Pillow Room',title:'Pillow Room.exe',image:'assets/maps/pillow/pillow-room.png',width:300,height:216,spawn:{x:78,y:84},entry:{x:16,y:86},bounds:{minX:6,maxX:94,minY:6,maxY:94},other:'arcade',door:{x:12,y:85}}
  };
  const params=new URLSearchParams(location.search),room=rooms[params.get('room')]||rooms.arcade;
  const other=rooms[room.other];
  const spawn=params.get('from')===room.other?room.entry:room.spawn;
  const apiPath=path=>'/api/chat/'+path+(path.includes('?')?'&':'?')+'room='+room.id;
  const socketUrl=()=>{const url=new URL(apiPath('ws'),location.origin);url.protocol=location.protocol==='https:'?'wss:':'ws:';if(params.get('from')===room.other)url.searchParams.set('from',room.other);return url.href;};
  window.RoomPage={room,spawn,apiPath,socketUrl};
  document.body.classList.add('connected-room');document.body.dataset.room=room.id;
  document.title=room.name+' · 8BitGPU';
  document.querySelector('.arcade-header strong').textContent='✦ '+room.name.toUpperCase();
  document.querySelector('.arcade-header small').textContent='CONNECTED ROOMS · 18+';
  document.querySelector('#roomGate h1').textContent='Come hang out in '+room.name;
  const map=document.getElementById('arcadeMap'),stage=document.getElementById('mapStage');
  map.setAttribute('aria-label',room.name);stage.style.backgroundImage=`url("${room.image}")`;
  const door=document.createElement('a');door.href='arcade.html?room='+other.id+'&from='+room.id;door.className='room-door';
  door.style.left=room.door.x+'%';door.style.top=room.door.y+'%';
  door.setAttribute('aria-label','Enter '+other.name);door.title='Enter '+other.name;
  const frame=document.createElement('span');frame.className='room-door-icon';frame.setAttribute('aria-hidden','true');frame.textContent='↔';
  const label=document.createElement('span');label.className='room-door-label';label.textContent=other.name;
  door.append(frame,label);stage.append(door);
  function travel(event){
    event.preventDefault();event.stopPropagation();
    if(parent!==window)parent.postMessage({type:'8bitgpu-room-travel',room:other.id,from:room.id},location.origin);
    else location.assign(door.href);
  }
  door.addEventListener('click',travel);
  const ratio=room.width/room.height;
  function fit(){const width=map.clientWidth,height=map.clientHeight;if(!width||!height)return;const w=Math.min(width,height*ratio);stage.style.setProperty('--room-stage-width',w+'px');stage.style.setProperty('--room-stage-height',(w/ratio)+'px');}
  new ResizeObserver(fit).observe(map);fit();
  const toggle=document.createElement('button');toggle.type='button';toggle.id='roomMapView';
  const chat=document.querySelector('.room-chat');chat.id='connectedRoomChat';toggle.setAttribute('aria-controls',chat.id);
  document.querySelector('.arcade-header').insertBefore(toggle,document.getElementById('roomCamera'));
  let expanded=false;
  function mapView(value){expanded=value;document.body.classList.toggle('room-map-view',value);toggle.textContent=value?'Show chat':'Map view';toggle.setAttribute('aria-pressed',String(value));try{localStorage.setItem('8bitgpu-room-map-view',String(value));}catch{}requestAnimationFrame(fit);}
  toggle.onclick=()=>mapView(!expanded);
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&expanded)mapView(false);});
  try{expanded=localStorage.getItem('8bitgpu-room-map-view')==='true';}catch{}
  mapView(expanded);
  // Keep the desktop window title in sync when a doorway changes the room.
  if(parent!==window)parent.postMessage({type:'8bitgpu-room-changed',room:room.id},location.origin);
})();
