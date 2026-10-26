const id = (x) => document.getElementById(x),
  username = new URLSearchParams(location.search).get("u");
async function load() {
  try {
    const r = await fetch("/api/profile/" + encodeURIComponent(username), { cache: "no-store" }),
      d = await r.json();
    if (!r.ok) throw Error(d.error);
    const p = d.profile;
    id("title").textContent = p.username + " • MyPixel";
    id("name").textContent = p.username;
    const picture = id("profilePicture");
    if (p.images?.profile) {
      picture.src = p.images.profile;
      picture.hidden = false;
      picture.onerror = () => (picture.hidden = true);
    }
    id("about").textContent = p.about || "Nothing here yet.";
    id("mood").textContent = p.mood || "No mood set.";
    window.applyWindowTheme?.(p.style);
    id("visit").onclick = () =>
      parent.postMessage({ type: "8bitgpu-open-profile", username: p.username }, location.origin);
    const friendButton = id("friend");
    const meResponse=await fetch('/api/auth/me',{cache:'no-store'});
    const me=meResponse.ok?await meResponse.json():{};
    const own=me.user?.username?.toLowerCase()===p.username.toLowerCase();
    const source=new URLSearchParams(location.search).get('from');
    if(own){
      friendButton.hidden=true;
      if(['arcade','avatarLab'].includes(source)){
        id('customizeNameplate').hidden=false;
        id('customizeNameplate').onclick=()=>{if(parent===window)location.href='nameplate.html';else parent.postMessage({type:'8bitgpu-open-app',app:'nameplate'},location.origin);};
      }
      return;
    }
    const social = await fetch("/api/friends", { cache: "no-store" });
    if (social.ok) {
      const state = await social.json();
      const accepted = state.friends?.some(
        (friend) => friend.username.toLowerCase() === p.username.toLowerCase(),
      );
      const pending = state.requests?.some(
        (request) => request.username.toLowerCase() === p.username.toLowerCase(),
      );
      if (accepted) {
        friendButton.textContent = "Friends ✓";
        friendButton.disabled = true;
        return;
      }
      if (pending) {
        friendButton.textContent = "Request pending";
        friendButton.disabled = true;
        return;
      }
    }
    friendButton.onclick = async () => {
      const result = await fetch("/api/friends", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: p.username }),
      });
      const data = await result.json();
      friendButton.textContent = result.ok ? "Request sent" : data.error;
      friendButton.disabled = result.ok;
    };
  } catch (e) {
    id("about").textContent = e.message;
  }
}
load();
