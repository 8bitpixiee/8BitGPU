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
        layer.src = source || "";
        layer.style.display = source ? "block" : "none";
        document.querySelectorAll(`[data-avatar-layer="${id}"]`).forEach((previewLayer) => {
            previewLayer.src = source || "";
            previewLayer.style.display = source ? "block" : "none";
        });
    };

    // Avatar Lab v2 saves stable asset paths, not the old numeric option
    // indexes. Render those paths directly so every studio button maps to the
    // same PNG on the desktop after Save.
    if (savedOutfit.version === 2) {
        const tone = savedOutfit.skinTone;
        let body = "body_fem_v1.png";
        let head = "head_fem_v1.png";

        if (savedOutfit.species === "Pixie") {
            const version = { Nutmeg: 1, Peachy: 2, Creme: 3 }[tone] || 1;
            const buildPrefix = savedOutfit.build === "Masc" ? "masc" : savedOutfit.build === "Chunky Masc" ? "chunky_masc" : "fem";
            body = `body_${buildPrefix}_v${version}.png`;
            head = `head_${buildPrefix}_v${version}.png`;
        } else if (savedOutfit.species === "Deerbra") {
            const version = { Wood: 1, Copper: 2, Pedal: 3 }[tone] || 1;
            body = `body_fem_deerbra_v${version}.png`;
            head = `head_fem_deerbra_v${version}.png`;
        } else if (savedOutfit.species === "Bovadill") {
            const toneNumber = { Cocoa: 1, Peachy: 2, Milky: 3 }[tone] || 1;
            const breedNumber = { Highland: 1, Holstein: 2, Dexter: 3 }[savedOutfit.build] || 1;
            body = `bovidil_body_fem_v${toneNumber}.${breedNumber}.png`;
            head = "bovidil_head_fem_v1.png";
        } else if (savedOutfit.species === "Thixie") {
            const bodyVersion = { Nutmeg: 1, Creme: 2, Peachy: 3 }[tone] || 1;
            const headVersion = { Nutmeg: 1, Creme: 2, Peachy: 3 }[tone] || 1;
            body = `thixie_body_v${bodyVersion}.png`;
            head = `thixie_head_v${headVersion}.png`;
        }

        setLayer("bodyLayer", avatarPath + body);
        setLayer("headLayer", avatarPath + head);
        const layers = savedOutfit.layers || {};
        setLayer("earsLayer", layers.ears);
        setLayer("hairLayer", layers.hair);
        setLayer("eyesLayer", layers.eyes);
        setLayer("fitLayer", layers.fit);
        setLayer("extraLayer", layers.extra);
        const adjustments = savedOutfit.adjustments || {};
        ["ears", "hair", "eyes", "fit", "extra"].forEach((category) => {
            const layer = document.getElementById(category + "Layer");
            if (!layer) return;
            const value = adjustments[category] || { x: 0, y: 0, scale: 1 };
            const x = Math.max(-20, Math.min(20, Number(value.x) || 0));
            const y = Math.max(-20, Math.min(20, Number(value.y) || 0));
            const scale = Math.max(.7, Math.min(1.3, Number(value.scale) || 1));
            layer.style.transform = `translate(${x}%, ${y}%) scale(${scale})`;
            document.querySelectorAll(`[data-avatar-layer="${category}Layer"]`).forEach((previewLayer) => {
                previewLayer.style.transform = `translate(${x}%, ${y}%) scale(${scale})`;
            });
        });
        return;
    }

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
    const startAccountStatus = document.getElementById("startAccountStatus");
    const name = localStorage.getItem("8bitgpu-player-name") || "Guest Pixie";

    if (playerName) playerName.textContent = name;
    if (startMenuName) startMenuName.textContent = name;
    if (startAccountStatus) startAccountStatus.textContent = localStorage.getItem("8bitgpu-account-active") === "true" ? "SIGNED IN" : "GUEST DESKTOP";
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
    profile: { title: "MY BEING.exe", width: 410, height: 310, left: 510, top: 155, content: () => `<section class="os-welcome os-profile"><p class="os-profile-label">CURRENT BEING</p><h2>${escapePlayerName()}</h2><p>This is your little desktop companion. Style them in Avatar Lab, collect items, and take them along as the world grows.</p><button type="button" onclick="openApp('avatarLab')">Style My Being</button></section>` }
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

function isPocketMode() {
    return window.matchMedia("(max-width: 700px)").matches;
}

function closePocketApps() {
    if (!isPocketMode()) return;
    openWindows.forEach((windowElement) => windowElement.remove());
    openWindows.clear();
    document.getElementById("osTaskTabs").replaceChildren();
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
window.closePocketApps = closePocketApps;

const openWindows = new Map();
let highestWindowZ = 11000;

function focusWindow(windowElement) {
    highestWindowZ += 1;
    windowElement.style.zIndex = highestWindowZ;
    document.querySelectorAll(".os-window").forEach((openWindow) => openWindow.classList.toggle("is-active-window", openWindow === windowElement));
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
    if (isPocketMode()) {
        windowElement.classList.add("is-pocket-window");
        windowElement.style.width = "100vw";
        windowElement.style.height = "calc(100vh - 58px)";
        windowElement.style.left = "0";
        windowElement.style.top = "0";
    } else {
        windowElement.style.width = `${Math.min(app.width, window.innerWidth - 24)}px`;
        windowElement.style.height = `${Math.min(app.height, window.innerHeight - 75)}px`;
        windowElement.style.left = `${Math.max(12, Math.min(app.left, window.innerWidth - 220))}px`;
        windowElement.style.top = `${Math.max(12, Math.min(app.top, window.innerHeight - 160))}px`;
    }
    windowElement.innerHTML = `<header class="os-window-bar"><span class="os-window-title">${app.title}</span><span class="os-window-actions"><button type="button" aria-label="Minimize">-</button><button type="button" aria-label="Maximize">□</button><button type="button" aria-label="Close">x</button></span></header>`;

    const header = windowElement.querySelector(".os-window-bar");
    const actions = windowElement.querySelectorAll(".os-window-actions button");
    actions[0].addEventListener("click", () => windowElement.classList.add("is-minimized"));
    actions[1].addEventListener("click", () => {
        const maximized = windowElement.classList.toggle("is-maximized");
        if (maximized) {
            windowElement.dataset.restoreLeft = windowElement.style.left;
            windowElement.dataset.restoreTop = windowElement.style.top;
            windowElement.dataset.restoreWidth = windowElement.style.width;
            windowElement.dataset.restoreHeight = windowElement.style.height;
            windowElement.style.left = "8px";
            windowElement.style.top = "8px";
            windowElement.style.width = `${window.innerWidth - 16}px`;
            windowElement.style.height = `${window.innerHeight - 48}px`;
        } else {
            windowElement.style.left = windowElement.dataset.restoreLeft;
            windowElement.style.top = windowElement.dataset.restoreTop;
            windowElement.style.width = windowElement.dataset.restoreWidth;
            windowElement.style.height = windowElement.dataset.restoreHeight;
        }
    });
    actions[2].addEventListener("click", () => {
        document.querySelector(`#osTaskTabs [data-app="${appName}"]`)?.remove();
        windowElement.remove();
        openWindows.delete(appName);
    });

    if (isPocketMode()) {
        actions[0].style.display = "none";
        actions[1].style.display = "none";
    }

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

function finishDesktopBoot() {
    const bootScreen = document.getElementById("osBootScreen");
    if (!bootScreen) return;
    bootScreen.classList.add("is-finished");
    window.setTimeout(() => bootScreen.remove(), 700);
}

if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    finishDesktopBoot();
} else if (document.readyState === "complete") {
    window.setTimeout(finishDesktopBoot, 1150);
} else {
    window.addEventListener("load", () => window.setTimeout(finishDesktopBoot, 1150), { once: true });
}

const desktopWallpapers = ["wallpaper-1-purple.png", "wallpaper-2-purple.png", "wallpaper-3-purple.png", "wallpaper-4-purple.png"];
const wallpaperFrames = Array.from(document.querySelectorAll(".wallpaper-frame"));
let activeWallpaperFrame = 0;
let currentWallpaperIndex = Number.parseInt(localStorage.getItem("8bitgpu-wallpaper-index") || "1", 10);
let wallpaperShuffleEnabled = localStorage.getItem("8bitgpu-wallpaper-shuffle") === "true";
let wallpaperShuffleTimer = 0;
if (!Number.isInteger(currentWallpaperIndex) || !desktopWallpapers[currentWallpaperIndex]) currentWallpaperIndex = 1;
let pendingWallpaperIndex = currentWallpaperIndex;

function showWallpaper(index, immediate = false, persist = true) {
    if (!wallpaperFrames.length || !desktopWallpapers[index]) return;
    const image = new Image();
    image.onload = () => {
        const nextFrameIndex = immediate ? activeWallpaperFrame : 1 - activeWallpaperFrame;
        const nextFrame = wallpaperFrames[nextFrameIndex];
        nextFrame.style.backgroundImage = `url("${desktopWallpapers[index]}")`;
        if (immediate) nextFrame.style.transition = "none";
        requestAnimationFrame(() => {
            wallpaperFrames.forEach((frame, frameIndex) => frame.classList.toggle("is-visible", frameIndex === nextFrameIndex));
            if (immediate) requestAnimationFrame(() => { nextFrame.style.transition = ""; });
        });
        activeWallpaperFrame = nextFrameIndex;
        if (persist) {
            currentWallpaperIndex = index;
            localStorage.setItem("8bitgpu-wallpaper-index", String(index));
        }
    };
    image.src = desktopWallpapers[index];
}

function shuffleDesktopWallpaper() {
    let nextIndex = currentWallpaperIndex;
    while (nextIndex === currentWallpaperIndex) nextIndex = Math.floor(Math.random() * desktopWallpapers.length);
    showWallpaper(nextIndex);
}

function scheduleWallpaperShuffle() {
    window.clearTimeout(wallpaperShuffleTimer);
    if (!wallpaperShuffleEnabled) return;
    wallpaperShuffleTimer = window.setTimeout(() => {
        shuffleDesktopWallpaper();
        scheduleWallpaperShuffle();
    }, 10 * 60 * 1000);
}

function updateWallpaperMenuLabels() {
    const toggleButton = document.querySelector('[data-context-action="toggle-shuffle"]');
    if (toggleButton) toggleButton.textContent = wallpaperShuffleEnabled ? "Stop 10-minute shuffle" : "Start 10-minute shuffle";
}

function setWallpaperShuffle(enabled) {
    wallpaperShuffleEnabled = Boolean(enabled);
    localStorage.setItem("8bitgpu-wallpaper-shuffle", String(wallpaperShuffleEnabled));
    document.getElementById("wallpaperShuffleToggle").checked = wallpaperShuffleEnabled;
    updateWallpaperMenuLabels();
    scheduleWallpaperShuffle();
}

const desktopContextMenu = document.getElementById("desktopContextMenu");
const wallpaperPicker = document.getElementById("wallpaperPicker");

function closeDesktopContextMenu() { desktopContextMenu.hidden = true; }
function renderWallpaperSelection() {
    document.querySelectorAll("[data-wallpaper-index]").forEach((button) => button.classList.toggle("is-selected", Number(button.dataset.wallpaperIndex) === pendingWallpaperIndex));
}
function openWallpaperPicker() {
    pendingWallpaperIndex = currentWallpaperIndex;
    document.getElementById("wallpaperShuffleToggle").checked = wallpaperShuffleEnabled;
    renderWallpaperSelection();
    wallpaperPicker.hidden = false;
    wallpaperPicker.querySelector("[data-wallpaper-index].is-selected")?.focus();
}
window.openWallpaperPicker = openWallpaperPicker;
function closeWallpaperPicker() { wallpaperPicker.hidden = true; }

document.querySelectorAll("[data-open-wallpapers]").forEach((button) => button.addEventListener("click", () => {
    closeStartMenu();
    openWallpaperPicker();
}));
document.querySelector("[data-close-start]")?.addEventListener("click", closeStartMenu);

const startMenuSearch = document.getElementById("startMenuSearch");
startMenuSearch?.addEventListener("input", () => {
    const query = startMenuSearch.value.trim().toLowerCase();
    const programs = Array.from(document.querySelectorAll("[data-start-program]"));
    let visiblePrograms = 0;
    programs.forEach((program) => {
        const isVisible = !query || program.textContent.toLowerCase().includes(query);
        program.hidden = !isVisible;
        if (isVisible) visiblePrograms += 1;
    });
    const emptyMessage = document.querySelector(".start-search-empty");
    if (emptyMessage) emptyMessage.hidden = visiblePrograms !== 0;
});

document.querySelector(".desktop").addEventListener("contextmenu", (event) => {
    if (event.target.closest("button, .os-window, #osTaskbar, #osStartMenu, #beingDock, #beingHud, #playerBadge")) return;
    event.preventDefault();
    updateWallpaperMenuLabels();
    desktopContextMenu.hidden = false;
    const menuWidth = 218;
    const menuHeight = desktopContextMenu.offsetHeight;
    desktopContextMenu.style.left = Math.min(event.clientX, window.innerWidth - menuWidth - 6) + "px";
    desktopContextMenu.style.top = Math.min(event.clientY, window.innerHeight - menuHeight - 6) + "px";
});

desktopContextMenu.addEventListener("click", (event) => {
    const action = event.target.closest("[data-context-action]")?.dataset.contextAction;
    if (!action) return;
    closeDesktopContextMenu();
    if (action === "change-wallpaper") openWallpaperPicker();
    if (action === "next-wallpaper") shuffleDesktopWallpaper();
    if (action === "toggle-shuffle") setWallpaperShuffle(!wallpaperShuffleEnabled);
    if (action === "refresh") window.location.reload();
});

document.addEventListener("pointerdown", (event) => {
    if (!desktopContextMenu.hidden && !event.target.closest("#desktopContextMenu")) closeDesktopContextMenu();
});
document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    closeDesktopContextMenu();
    closeWallpaperPicker();
});

document.querySelectorAll("[data-wallpaper-index]").forEach((button) => button.addEventListener("click", () => {
    pendingWallpaperIndex = Number(button.dataset.wallpaperIndex);
    renderWallpaperSelection();
    showWallpaper(pendingWallpaperIndex, false, false);
}));
document.querySelector("[data-wallpaper-save]").addEventListener("click", () => {
    showWallpaper(pendingWallpaperIndex);
    setWallpaperShuffle(document.getElementById("wallpaperShuffleToggle").checked);
    closeWallpaperPicker();
});
document.querySelector("[data-wallpaper-cancel]").addEventListener("click", () => {
    showWallpaper(currentWallpaperIndex);
    closeWallpaperPicker();
});
document.querySelector("[data-wallpaper-close]").addEventListener("click", closeWallpaperPicker);

showWallpaper(currentWallpaperIndex, true);
setWallpaperShuffle(wallpaperShuffleEnabled);
