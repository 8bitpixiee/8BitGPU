document.getElementById("players")?.addEventListener("click", (event) => {
  const nameButton = event.target.closest(".being-profile-link");
  if (!nameButton) return;
  const being = nameButton.closest(".being");
  event.stopPropagation();
  const name = nameButton.dataset.username;
  if (name)
    window.parent?.postMessage({ type: "8bitgpu-open-profile-card", username: name }, location.origin);
});

document.querySelector('[data-nameplate-studio]')?.addEventListener('click',event=>{if(parent===window)return;event.preventDefault();parent.postMessage({type:'8bitgpu-open-app',app:'nameplate'},location.origin);});
