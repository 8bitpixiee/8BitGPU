(() => {
 let loaded=false;
 async function renderConnections(){if(!profile||loaded)return;loaded=true;const panel=document.getElementById('connections');panel.querySelector('h2').textContent='My Top 8';const placeholder=panel.querySelector('p');placeholder.textContent='Loading friends…';
 try{const d=await getJson('/api/social/top?u='+encodeURIComponent(profile.username));placeholder.remove();const grid=document.createElement('div');grid.className='top-eight';for(const [i,f] of d.friends.entries()){const a=document.createElement('a');a.href='profile.html?u='+encodeURIComponent(f.username);a.textContent=(i+1)+'. '+f.username;grid.append(a);}if(!d.friends.length)grid.textContent='No Top 8 chosen yet.';panel.append(grid);
 const b=document.createElement('button');b.type='button';b.textContent=isOwnProfile?'Edit Top 8 / Friends':'Send friend request';b.onclick=async()=>{if(isOwnProfile){if(parent!==window)parent.postMessage({type:'8bitgpu-open-app',app:'social'},location.origin);else location.href='social.html';return;}try{await getJson('/api/friends',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:profile.username})});setStatus('Friend request sent.');}catch(e){setStatus(e.message);}};panel.append(b);
 }catch(e){placeholder.textContent=e.message;}}
 new MutationObserver(renderConnections).observe(document.getElementById('profile'),{attributes:true,attributeFilter:['hidden']});renderConnections();
})();
