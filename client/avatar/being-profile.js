// The Lab opens the same small profile card used in the Lounge.
(async()=>{try{const r=await fetch('/api/auth/me',{cache:'no-store'});if(!r.ok)return;const {user}=await r.json();if(!user?.username)return;
 const button=document.getElementById('beingProfileCard');button.hidden=false;
 button.onclick=()=>{if(parent===window)location.href='profile-card.html?u='+encodeURIComponent(user.username)+'&from=avatarLab';else parent.postMessage({type:'8bitgpu-open-profile-card',username:user.username,source:'avatarLab'},location.origin);};
}catch{/* Keep the Lab usable when offline. */}})();
