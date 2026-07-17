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

    const avatarPath = "avatar/";
    const setLayer = (id, source) => {
        const layer = document.getElementById(id);
        layer.src = source;
        layer.style.display = source ? "block" : "none";
    };

    const hairOptions = ["", "volume_hair_fem_idle_front_v1.png", `${avatarPath}hair_fem_v1.png`, `${avatarPath}hair_fem_v2.png`, `${avatarPath}hair_fem_deerbra_v1.png`];
    const earsOptions = [`${avatarPath}ears_fem_v1.png`, `${avatarPath}ears_fem_v2.png`, `${avatarPath}ears_fem_deerbra_v1.png`];
    const eyesOptions = ["", `${avatarPath}eyes_fem_v1.png`, `${avatarPath}eyes_fem_v2.png`, `${avatarPath}eyes_mac_v1.png`, `${avatarPath}eyes_mac_v2.png`, `${avatarPath}eyes_mac_v3.png`];
    const fitOptions = ["", `${avatarPath}fit_fem_v1.png`, `${avatarPath}fit_fem_v2.png`, "drawls_fem_idle_front_v1.png"];
    const extraOptions = ["", `${avatarPath}extra_fem_v1.png`, `${avatarPath}extra_fem_v2.png`];

    if (savedOutfit.bodyPreset === "thickPixie") {
        setLayer("bodyLayer", "body_base_fem_idle_front_v1.png");
        setLayer("headLayer", "");
        setLayer("earsLayer", "");
        setLayer("eyesLayer", "");
        setLayer("hairLayer", hairOptions[savedOutfit.hair] || "");
        setLayer("fitLayer", fitOptions[savedOutfit.fit] || "");
        setLayer("extraLayer", extraOptions[savedOutfit.extra] || "");
        return;
    }

    const isDeerbra = savedOutfit.species === "Deerbras";
    const version = savedOutfit.skinTone === "Peachy" ? "v2" : "v1";
    setLayer("bodyLayer", isDeerbra ? `${avatarPath}body_fem_deerbra_v1.png` : `${avatarPath}body_fem_${version}.png`);
    setLayer("headLayer", isDeerbra ? `${avatarPath}head_fem_deerbra_v1.png` : `${avatarPath}head_fem_${version}.png`);
    setLayer("earsLayer", earsOptions[savedOutfit.ears] || earsOptions[0]);
    setLayer("hairLayer", hairOptions[savedOutfit.hair] || "");
    setLayer("eyesLayer", eyesOptions[savedOutfit.eyes] || "");
    setLayer("fitLayer", fitOptions[savedOutfit.fit] || "");
    setLayer("extraLayer", extraOptions[savedOutfit.extra] || "");

}

loadSavedOutfit();

function renderPlayerBadge() {
    const playerName = document.getElementById("playerName");
    if (!playerName) return;

    playerName.textContent = localStorage.getItem("8bitgpu-player-name") || "Guest Pixie";
}

renderPlayerBadge();

const desktopApps = {
    welcome: {
        title: "WELCOME.exe",
        width: 580,
        height: 420,
        left: 260,
        top: 115,
        content: `<section class="os-welcome"><h2>Welcome to 8BitGPU</h2><p>A little enchanted computer world for games, glow-ups, streams, store drops, and pixie behavior.</p><button type="button" onclick="openApp('avatarLab')">Open Avatar Lab</button></section>`
    },
    avatarLab: { title: "Avatar Lab.exe", src: "avatar-studio.html", width: 1000, height: 720, left: 160, top: 70 },
    storefront: { title: "STORE.exe", src: "storefront.html", width: 920, height: 680, left: 235, top: 92 },
    login: { title: "Login.exe", src: "login.html", width: 700, height: 620, left: 290, top: 110 },
    profile: { title: "PROFILE.exe", width: 470, height: 365, left: 510, top: 155, content: () => `<section class="os-welcome os-profile"><p class="os-profile-label">CURRENT CREATURE</p><h2>${escapePlayerName()}</h2><p>Your saved avatar is waiting on the desktop. Online outfits, inventory, and friends will live here once the game account system wakes up.</p><button type="button" onclick="openApp('avatarLab')">Open Avatar Lab</button></section>` }
};

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
        windowElement.appendChild(frame);
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
