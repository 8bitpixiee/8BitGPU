document.getElementById("players")?.addEventListener("click", (event) => {
    const nameButton = event.target.closest(".being-profile-link");
    if (!nameButton) return;
    const being = nameButton.closest(".being");
    event.stopPropagation();
    const name = nameButton.textContent?.replace(/ \(you\)$/, "");
    if (name) window.parent?.postMessage({ type: "8bitgpu-open-profile", username: name }, location.origin);
});
