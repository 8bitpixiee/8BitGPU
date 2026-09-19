document.getElementById("players")?.addEventListener("click", (event) => {
    const being = event.target.closest(".being");
    if (!being) return;
    event.stopPropagation();
    const name = being.querySelector(".name")?.textContent?.replace(/ \(you\)$/, "");
    if (name) window.parent?.postMessage({ type: "8bitgpu-open-profile", username: name }, location.origin);
});
