document.getElementById("players")?.addEventListener("click", (event) => {
  const nameButton = event.target.closest(".being-profile-link");
  if (!nameButton) return;
  const being = nameButton.closest(".being");
  event.stopPropagation();
  const name = nameButton.dataset.username;
  if (name)
    window.parent?.postMessage({ type: "8bitgpu-open-profile-card", username: name, source: new URLSearchParams(location.search).get("room") === "pillow" ? undefined : "arcade" }, location.origin);
});

