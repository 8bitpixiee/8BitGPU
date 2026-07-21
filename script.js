function loadSavedOutfit() {
    let savedOutfit;

    try {
        savedOutfit = JSON.parse(localStorage.getItem("8bitgpu-avatar-outfit"));
    } catch {
        return;
    }

    if (!savedOutfit) {
        return;
    }

    const companion = document.getElementById("companion");
    if (companion) companion.style.display = "block";
    const emptyState = document.getElementById("beingEmptyState");
    if (emptyState) emptyState.hidden = true;

    const avatarPath = "avatar/";
    const setLayer = (id, source) => {
        const layer = document.getElementById(id);
        layer.onerror = () => { layer.style.display = "none"; };
        layer.src = source;
        layer.style.display = source ? "block" : "none";
    };

    const hairOptions = ["", "volume_hair_fem_idle_front_v1.png", `${avatarPath}hair_fem_v1.png`, `${avatarPath}hair_fem_deerbra_v1.png`, `${avatarPath}hair_fem_deerbra_v2.png`, `${avatarPath}hair_fem_deerbra_v3.png`, `${avatarPath}hair_fem_deerbra_v4.png`, `${avatarPath}hair_lemon_v1.png`, `${avatarPath}hair_lemon_v2.png`, `${avatarPath}hair_lemon_v3.png`, `${avatarPath}hair_locs_v1.png`, `${avatarPath}hair_locs_v2.png`, `${avatarPath}hair_locs_v3.png`, `${avatarPath}hair_longwaves_v1.png`, `${avatarPath}hair_longwaves_v2.png`, `${avatarPath}hair_longwaves_v3.png`, `${avatarPath}sideswept_hair_v1.png`, `${avatarPath}sideswept_hair_v2.png`, `${avatarPath}sideswept_hair_v3.png`];
    const earsOptions = [`${avatarPath}ears_fem_v1.png`, `${avatarPath}ears_fem_v2.png`, `${avatarPath}ears_fem_v3.png`, `${avatarPath}kittie_ears_v1.png`, `${avatarPath}kittie_ears_v2.png`, `${avatarPath}kittie_ears_v3.png`, `${avatarPath}ears_fem_deerbra_v1.png`, `${avatarPath}ears_fem_deerbra_v3.png`, `${avatarPath}ears_fem_bovidil_v1.png`, `${avatarPath}ears_fem_bovidil_v2.png`, `${avatarPath}ears_fem_bovidil_v3.png`];
    const eyesOptions = ["", `${avatarPath}eyes_fem_v1.png`, `${avatarPath}eyes_fem_v2.png`, `${avatarPath}eyes_mac_v1.png`, `${avatarPath}eyes_mac_v2.png`, `${avatarPath}eyes_mac_v3.png`, `${avatarPath}eyes_lemon.png`];
    const fitOptions = ["", `${avatarPath}fit_fem_v1.png`, `${avatarPath}fit_fem_v2.png`, `${avatarPath}fit_fem_v3.png`, `${avatarPath}fit_kittie_v1.png`, `${avatarPath}fit_kittie_v2.png`, `${avatarPath}fit_kittie_v3.png`, `${avatarPath}drawls_fem_idle_front_v1.png`, `${avatarPath}drawls_fem_idle_front_v2.png`, `${avatarPath}drawls_fem_idle_front_v3.png`];
    const thixieFitOptions = ["", `${avatarPath}thixie_fit_v1.png`, `${avatarPath}thixie_fit_v2.png`, `${avatarPath}thixie_fit_v3.png`];
    const extraOptions = ["", `${avatarPath}wings_v1.png`, `${avatarPath}wings_v2.png`, `${avatarPath}wings_v3.png`, `${avatarPath}kittie_tail_v1.png`, `${avatarPath}kittie_tail_v2.png`, `${avatarPath}kittie_tail_v3.png`];

    const isThixie = savedOutfit.bodyPreset === "thixie" || savedOutfit.species === "Thixies";
    const isDeerbra = savedOutfit.species === "Deerbras";
    if (isThixie) {
        const bodyVersion = { Nutmeg: "v1", Creme: "v2", Peachy: "v4" }[savedOutfit.skinTone] || "v1";
        const headVersion = { Nutmeg: "v1", Creme: "v2", Peachy: "v3" }[savedOutfit.skinTone] || "v1";
        setLayer("bodyLayer", `${avatarPath}thixie_body_${bodyVersion}.png`);
        setLayer("headLayer", `${avatarPath}thixie_head_${headVersion}.png`);
    } else if (isDeerbra) {
        const version = savedOutfit.skinTone === "Creme" ? "v2" : "v1";
        setLayer("bodyLayer", `${avatarPath}body_fem_deerbra_${version}.png`);
        setLayer("headLayer", `${avatarPath}head_fem_deerbra_${version}.png`);
    } else {
        const version = { Nutmeg: "v1", Peachy: "v2", Creme: "v3" }[savedOutfit.skinTone] || "v1";
        setLayer("bodyLayer", `${avatarPath}body_fem_${version}.png`);
        setLayer("headLayer", `${avatarPath}head_fem_${version}.png`);
    }
    setLayer("earsLayer", earsOptions[savedOutfit.ears] || earsOptions[0]);
    setLayer("hairLayer", hairOptions[savedOutfit.hair] || "");
    setLayer("eyesLayer", eyesOptions[savedOutfit.eyes] || "");
    setLayer("fitLayer", (isThixie ? thixieFitOptions : fitOptions)[savedOutfit.fit] || "");
    setLayer("extraLayer", extraOptions[savedOutfit.extra] || "");

}

loadSavedOutfit();
window.refreshDesktopAvatar = loadSavedOutfit;
window.addEventListener("storage", (event) => {
    if (event.key === "8bitgpu-avatar-outfit") loadSavedOutfit();
});
window.addEventListener("message", (event) => {
    if (event.origin === window.location.origin && event.data?.type === "8bitgpu-avatar-saved") {
        loadSavedOutfit();
    }
});

function renderPlayerBadge() {
    const playerName = document.getElementById("playerName");
    const startMenuName = document.getElementById("startMenuName");
    const name = localStorage.getItem("8bitgpu-player-name") || "Guest Pixie";

    if (playerName) playerName.textContent = name;
    if (startMenuName) startMenuName.textContent = name;
}

function getGameState() {
    try {
        return JSON.parse(localStorage.getItem("8bitgpu-game-state")) || { xp: 120, mana: 80, inventory: [] };
    } catch {
        return { xp: 120, mana: 80, inventory: [] };
    }
}

function renderGameHud() {
    const state = getGameState();
    const xp = Math.max(0, state.xp || 0);
    const mana = Math.max(0, Math.min(100, state.mana ?? 80));
    const level = Math.floor(xp / 300) + 1;
    const currentXp = xp % 300;
    const levelElement = document.getElementById("beingLevel");
    const xpElement = document.getElementById("beingXp");
    const manaElement = document.getElementById("manaValue");
    const fill = document.getElementById("xpFill");
    if (levelElement) levelElement.textContent = String(level).padStart(2, "0");
    if (xpElement) xpElement.textContent = `${currentXp} / 300`;
    if (manaElement) manaElement.textContent = `${mana} / 100`;
    if (fill) fill.style.width = `${(currentXp / 300) * 100}%`;
}

renderPlayerBadge();
renderGameHud();
window.addEventListener("storage", (event) => {
    if (event.key === "8bitgpu-game-state") renderGameHud();
});
window.addEventListener("message", (event) => {
    if (event.origin === window.location.origin && event.data?.type === "8bitgpu-game-updated") renderGameHud();
});

async function restoreOnlinePlayer() {
    try {
        const response = await fetch("/api/auth/me", { cache: "no-store" });
        const data = await response.json();
        if (!data.user) return false;

        localStorage.setItem("8bitgpu-player-name", data.user.username);
        localStorage.setItem("8bitgpu-account-active", "true");
        if (data.user.avatar) {
            localStorage.setItem("8bitgpu-avatar-outfit", JSON.stringify(data.user.avatar));
            loadSavedOutfit();
        }
        renderPlayerBadge();
        return true;
    } catch {
        // The desktop still works as a guest if the player server is unavailable.
        return false;
    }
}

restoreOnlinePlayer().then((isLoggedIn) => {
    if (!isLoggedIn && localStorage.getItem("8bitgpu-guest-session") !== "true") openApp("login");
});

const desktopApps = {
    welcome: {
        title: "WELCOME.exe",
        width: 470,
        height: 335,
        left: 210,
        top: 105,
        content: `<section class="os-welcome"><h2>Welcome to 8BitGPU</h2><p>A little enchanted computer world for games, glow-ups, streams, store drops, and pixie behavior.</p><button type="button" onclick="openApp('avatarLab')">Open Avatar Lab</button></section>`
    },
    avatarLab: { title: "Avatar Lab.exe", src: "avatar-studio.html", width: 780, height: 590, left: 145, top: 65 },
    storefront: { title: "STORE.exe", src: "storefront.html", width: 690, height: 520, left: 215, top: 88 },
    login: { title: "Login.exe", src: "login.html", width: 510, height: 650, left: 280, top: 80 },
    coaching: { title: "1:1 Coaching.exe", external: "https://forms.gle/18ea3aWxwWu9c1rj9", description: "Book a one-on-one coaching session with 8Bit Pixiee.", width: 430, height: 290, left: 210, top: 145 },
    mealPlanning: { title: "Meal Planning.exe", external: "https://forms.gle/uD31jM6uUzGe3tUa7", description: "Open the meal-planning sign-up portal.", width: 430, height: 290, left: 245, top: 170 },
    twitch: { title: "8Bit Media Player.exe", src: "media-player.html", width: 920, height: 570, left: 185, top: 75 },
    arcade: { title: "Arcade 01.exe", src: "arcade.html", width: 900, height: 650, left: 125, top: 50 },
    inventory: { title: "INVENTORY.exe", width: 440, height: 400, left: 435, top: 140, content: () => {
        const inventory = getGameState().inventory || [];
        const items = inventory.length ? inventory.map((item) => `<li>✦ ${item}</li>`).join("") : "<li>Nothing collected yet. Visit Arcade 01!</li>";
        return `<section class="os-welcome os-inventory"><p class="os-profile-label">PIXIE POCKET</p><h2>Inventory</h2><ul>${items}</ul><button type="button" onclick="openApp('arcade')">Go to Arcade 01</button></section>`;
    } },
    discord: { title: "Community.exe", external: "https://discord.gg/RbqP4BAmH", description: "Join the 8BitGPU Discord community and show us your creature build.", width: 440, height: 305, left: 315, top: 150 },
    important: { title: "IMPORTANT.exe", src: "nick.html", width: 550, height: 450, left: 330, top: 105 },
    sonic: { title: "Sonic.exe", src: "sonic.html", width: 550, height: 450, left: 365, top: 130 },
    profile: { title: "PROFILE.exe", width: 410, height: 310, left: 510, top: 155, content: () => `<section class="os-welcome os-profile"><p class="os-profile-label">CURRENT CREATURE</p><h2>${escapePlayerName()}</h2><p>Your saved avatar is waiting on the desktop. Online outfits, inventory, and friends will live here once the game account system wakes up.</p><button type="button" onclick="openApp('avatarLab')">Open Avatar Lab</button></section>` }
};

function toggleStartMenu() {
    const menu = document.getElementById("osStartMenu");
    if (!menu) return;
    const isOpen = menu.classList.toggle("is-open");
    menu.setAttribute("aria-hidden", String(!isOpen));
}

function closeStartMenu() {
    const menu = document.getElementById("osStartMenu");
    if (!menu) return;
    menu.classList.remove("is-open");
    menu.setAttribute("aria-hidden", "true");
}

function playBeingAction(action) {
    const companion = document.getElementById("companion");
    if (!companion || companion.style.display === "none") return;
    companion.classList.remove("is-wave", "is-dance", "is-spin");
    void companion.offsetWidth;
    companion.classList.add(`is-${action}`);
}

window.toggleStartMenu = toggleStartMenu;
window.playBeingAction = playBeingAction;

const openWindows = new Map();
let highestWindowZ = 11000;

function focusWindow(windowElement) {
    highestWindowZ += 1;
    windowElement.style.zIndex = highestWindowZ;
    document.querySelectorAll(".os-task-tab").forEach((tab) => tab.classList.toggle("is-active", tab.dataset.app === windowElement.dataset.app));
}

function syncTaskTab(appName) {
    const tabs = document.getElementById("osTaskTabs");
    const windowElement = openWindows.get(appName);
    let tab = tabs.querySelector(`[data-app="${appName}"]`);

    if (!tab) {
        tab = document.createElement("button");
        tab.type = "button";
        tab.className = "os-task-tab";
        tab.dataset.app = appName;
        tab.textContent = desktopApps[appName].title;
        tab.addEventListener("click", () => {
            if (windowElement.classList.contains("is-minimized")) windowElement.classList.remove("is-minimized");
            else if (tab.classList.contains("is-active")) windowElement.classList.add("is-minimized");
            focusWindow(windowElement);
        });
        tabs.appendChild(tab);
    }
}

function addDrag(windowElement, handle) {
    let startX = 0;
    let startY = 0;
    let initialLeft = 0;
    let initialTop = 0;

    handle.addEventListener("pointerdown", (event) => {
        if (event.target.closest("button")) return;
        focusWindow(windowElement);
        startX = event.clientX;
        startY = event.clientY;
        initialLeft = windowElement.offsetLeft;
        initialTop = windowElement.offsetTop;
        handle.setPointerCapture(event.pointerId);
    });

    handle.addEventListener("pointermove", (event) => {
        if (!handle.hasPointerCapture(event.pointerId)) return;
        const maxLeft = Math.max(0, window.innerWidth - 180);
        const maxTop = Math.max(0, window.innerHeight - 100);
        windowElement.style.left = `${Math.min(maxLeft, Math.max(-windowElement.offsetWidth + 180, initialLeft + event.clientX - startX))}px`;
        windowElement.style.top = `${Math.min(maxTop, Math.max(0, initialTop + event.clientY - startY))}px`;
    });
}

function openApp(appName) {
    closeStartMenu();
    const app = desktopApps[appName];
    if (!app) return;

    let windowElement = openWindows.get(appName);
    if (windowElement) {
        windowElement.classList.remove("is-minimized");
        focusWindow(windowElement);
        return;
    }

    windowElement = document.createElement("section");
    windowElement.className = "os-window";
    windowElement.dataset.app = appName;
    windowElement.style.width = `${Math.min(app.width, window.innerWidth - 24)}px`;
    windowElement.style.height = `${Math.min(app.height, window.innerHeight - 75)}px`;
    windowElement.style.left = `${Math.max(12, Math.min(app.left, window.innerWidth - 220))}px`;
    windowElement.style.top = `${Math.max(12, Math.min(app.top, window.innerHeight - 160))}px`;
    windowElement.innerHTML = `<header class="os-window-bar"><span class="os-window-title">${app.title}</span><span class="os-window-actions"><button type="button" aria-label="Minimize">-</button><button type="button" aria-label="Close">x</button></span></header>`;

    const header = windowElement.querySelector(".os-window-bar");
    const actions = windowElement.querySelectorAll(".os-window-actions button");
    actions[0].addEventListener("click", () => windowElement.classList.add("is-minimized"));
    actions[1].addEventListener("click", () => {
        document.querySelector(`#osTaskTabs [data-app="${appName}"]`)?.remove();
        windowElement.remove();
        openWindows.delete(appName);
    });

    if (app.src) {
        const frame = document.createElement("iframe");
        frame.src = app.src;
        frame.title = app.title;
        frame.scrolling = "auto";
        windowElement.appendChild(frame);
    } else if (app.external) {
        const content = document.createElement("div");
        content.innerHTML = `<section class="os-welcome os-link-window"><p class="os-profile-label">DESKTOP SHORTCUT</p><h2>${app.title.replace(".exe", "")}</h2><p>${app.description}</p><button type="button" data-external-link>Launch</button></section>`;
        content.querySelector("[data-external-link]").addEventListener("click", () => window.open(app.external, "_blank", "noopener"));
        windowElement.appendChild(content);
    } else {
        const content = document.createElement("div");
        content.innerHTML = typeof app.content === "function" ? app.content() : app.content;
        windowElement.appendChild(content);
    }

    document.getElementById("osWindowLayer").appendChild(windowElement);
    openWindows.set(appName, windowElement);
    syncTaskTab(appName);
    addDrag(windowElement, header);
    windowElement.addEventListener("pointerdown", () => focusWindow(windowElement));
    focusWindow(windowElement);
}

window.openApp = openApp;

function escapePlayerName() {
    const value = localStorage.getItem("8bitgpu-player-name") || "Guest Pixie";
    const element = document.createElement("div");
    element.textContent = value;
    return element.innerHTML;
}

const angelTimeMessages = [
    "111 - New beginnings | Isaiah 43:19",
    "222 - You are held | Romans 8:28",
    "333 - Grace surrounds you | Psalm 34:7",
    "444 - Protected and planted | Psalm 91:11",
    "555 - Beautiful change is coming | Ecclesiastes 3:1",
    "777 - Walk by faith | 2 Corinthians 5:7",
    "888 - Overflow and renewal | John 10:10"
];
let angelTimeIndex = 0;

function updateAngelTime() {
    const tray = document.getElementById("osTray");
    const clock = document.getElementById("osClock");
    if (!tray || !clock) return;
    const time = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(new Date());
    clock.textContent = time;
    tray.textContent = angelTimeMessages[angelTimeIndex];
}

function cycleAngelTime() {
    angelTimeIndex = (angelTimeIndex + 1) % angelTimeMessages.length;
    updateAngelTime();
}

window.cycleAngelTime = cycleAngelTime;
updateAngelTime();
setInterval(updateAngelTime, 30000);
