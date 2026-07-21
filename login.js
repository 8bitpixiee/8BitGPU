const displayName = document.getElementById("displayName");
const password = document.getElementById("password");
const loginForm = document.getElementById("loginForm");
const registerButton = document.getElementById("registerButton");
const guestButton = document.getElementById("guestButton");
const statusCard = document.getElementById("statusCard");

function escapeHtml(value) {
    const element = document.createElement("div");
    element.textContent = value;
    return element.innerHTML;
}

function setStatus(message) {
    statusCard.innerHTML = `<span class="status-dot"></span><span>${escapeHtml(message)}</span>`;
}

function enterWorld(name, account = false) {
    localStorage.setItem("8bitgpu-player-name", name);
    localStorage.setItem("8bitgpu-account-active", account ? "true" : "false");
    if (account) localStorage.removeItem("8bitgpu-guest-session");
    else localStorage.setItem("8bitgpu-guest-session", "true");
    setStatus(account ? `Welcome in, ${name}. Your account is connected.` : `Playing locally as ${name}.`);
    setTimeout(() => {
        if (window.parent && window.parent !== window) window.parent.location.reload();
        else if (window.opener && !window.opener.closed) window.opener.location.reload();
        else window.location.href = "index.html";
    }, 750);
}

async function moveMatchingBrowserAvatarToAccount(username) {
    const browserName = localStorage.getItem("8bitgpu-player-name") || "";
    if (browserName.toLowerCase() !== username.toLowerCase()) return;

    try {
        const avatar = JSON.parse(localStorage.getItem("8bitgpu-avatar-outfit"));
        if (!avatar) return;
        await fetch("/api/avatar", {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(avatar)
        });
    } catch {
        // The browser-only outfit remains intact if migration cannot run yet.
    }
}

async function sendAccountRequest(path) {
    const username = displayName.value.trim();
    if (!username || password.value.length < 8) {
        setStatus("Add your creature name and an 8-character passcode.");
        return;
    }

    setStatus("Connecting to the player database...");
    try {
        const response = await fetch(path, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ username, password: password.value })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || data.error || "The account terminal blinked out.");
        if (data.user.avatar) {
            localStorage.setItem("8bitgpu-avatar-outfit", JSON.stringify(data.user.avatar));
        } else {
            await moveMatchingBrowserAvatarToAccount(data.user.username);
        }
        enterWorld(data.user.username, true);
    } catch (error) {
        setStatus(error.message || "Could not reach the player database.");
    }
}

loginForm.addEventListener("submit", (event) => {
    event.preventDefault();
    sendAccountRequest("/api/auth/login");
});

registerButton.addEventListener("click", () => sendAccountRequest("/api/auth/register"));
guestButton.addEventListener("click", () => enterWorld("Guest Pixie"));

async function loadExistingAccount() {
    try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await response.json();
        if (!data.user) {
            setStatus("System ready. Log in or create your player account.");
            return;
        }
        displayName.value = data.user.username;
        if (data.user.avatar) {
            localStorage.setItem("8bitgpu-avatar-outfit", JSON.stringify(data.user.avatar));
        } else {
            await moveMatchingBrowserAvatarToAccount(data.user.username);
        }
        setStatus(`Already connected as ${data.user.username}.`);
    } catch {
        setStatus("Player database is waking up. You can still continue as a guest.");
    }
}

loadExistingAccount();
