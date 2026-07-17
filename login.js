const displayName = document.getElementById("displayName");
const loginForm = document.getElementById("loginForm");
const guestButton = document.getElementById("guestButton");
const statusCard = document.getElementById("statusCard");

const savedPlayer = localStorage.getItem("8bitgpu-player-name");
if (savedPlayer) {
    displayName.value = savedPlayer;
    statusCard.innerHTML = `<span class="status-dot"></span><span>Welcome back, ${escapeHtml(savedPlayer)}.</span>`;
}

function escapeHtml(value) {
    const element = document.createElement("div");
    element.textContent = value;
    return element.innerHTML;
}

function enterWorld(name) {
    localStorage.setItem("8bitgpu-player-name", name);
    statusCard.innerHTML = `<span class="status-dot"></span><span>Player profile ready: ${escapeHtml(name)}</span>`;
    setTimeout(() => window.close(), 750);
}

loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = displayName.value.trim();
    if (name) enterWorld(name);
});

guestButton.addEventListener("click", () => enterWorld("Guest Pixie"));
