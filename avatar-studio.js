const assetPath = "avatar/";
const options = {
    ears: [
        { name: "Pixie Ears", src: `${assetPath}ears_fem_v1.png` },
        { name: "Kittie Ears", src: `${assetPath}ears_fem_v2.png` },
        { name: "Deerbra Ears", src: `${assetPath}ears_fem_deerbra_v1.png` }
    ],
    hair: [
        { name: "None", src: "" },
        { name: "Bombshell Blowout", src: "volume_hair_fem_idle_front_v1.png" },
        { name: "Straight (Violet)", src: `${assetPath}hair_fem_v1.png` },
        { name: "Kitties Locs (Cocoa)", src: `${assetPath}hair_fem_v2.png` },
        { name: "Beachy Waves (Cocoa)", src: `${assetPath}hair_fem_deerbra_v1.png` }
    ],
    eyes: [
        { name: "None", src: "" },
        { name: "Purple F", src: `${assetPath}eyes_fem_v1.png` },
        { name: "Pink F", src: `${assetPath}eyes_fem_v2.png` },
        { name: "Purple M", src: `${assetPath}eyes_mac_v1.png` },
        { name: "Red M", src: `${assetPath}eyes_mac_v2.png` },
        { name: "Green M", src: `${assetPath}eyes_mac_v3.png` }
    ],
    fit: [
        { name: "None", src: "" },
        { name: "Violet Two-Piece", src: `${assetPath}fit_fem_v1.png` },
        { name: "Kitties Chill-Outs", src: `${assetPath}fit_fem_v2.png` },
        { name: "Drawls (Desktop Classic)", src: "drawls_fem_idle_front_v1.png" }
    ],
    extra: [
        { name: "None", src: "" },
        { name: "Pixie Wings", src: `${assetPath}extra_fem_v1.png` },
        { name: "Mr. Babies Tail", src: `${assetPath}extra_fem_v2.png` }
    ]
};

const selection = { ears: 0, hair: 1, eyes: 1, fit: 1, extra: 0 };
const settings = { species: "Pixies", skinTone: "Nutmeg", bodyPreset: "custom" };
const steps = ["species", "skinTone", "style"];
let currentStep = 0;

try {
    const saved = JSON.parse(localStorage.getItem("8bitgpu-avatar-outfit"));
    if (saved) {
        Object.keys(selection).forEach((category) => {
            if (Number.isInteger(saved[category]) && options[category][saved[category]]) selection[category] = saved[category];
        });
        if (["Pixies", "Deerbras"].includes(saved.species)) settings.species = saved.species;
        if (["Nutmeg", "Peachy"].includes(saved.skinTone)) settings.skinTone = saved.skinTone;
        if (saved.bodyPreset === "thickPixie") settings.bodyPreset = "thickPixie";
    }
} catch { /* Start with the default Pixie if saved data is unavailable. */ }

function setLayer(layerName, src) {
    const layer = document.getElementById(`${layerName}Layer`);
    layer.src = src;
    layer.hidden = !src;
}

function renderBase() {
    if (settings.bodyPreset === "thickPixie") {
        setLayer("body", "body_base_fem_idle_front_v1.png");
        setLayer("head", "");
        return;
    }

    if (settings.species === "Deerbras") {
        setLayer("body", `${assetPath}body_fem_deerbra_v1.png`);
        setLayer("head", `${assetPath}head_fem_deerbra_v1.png`);
        return;
    }
    const version = settings.skinTone === "Peachy" ? "v2" : "v1";
    setLayer("body", `${assetPath}body_fem_${version}.png`);
    setLayer("head", `${assetPath}head_fem_${version}.png`);
}

function renderCategory(category) {
    const item = options[category][selection[category]];
    setLayer(category, item.src);
    document.getElementById(`${category}Name`).textContent = item.name;
}

function renderAvatar() {
    renderBase();
    Object.keys(options).forEach(renderCategory);
    if (settings.bodyPreset === "thickPixie") {
        setLayer("ears", "");
        setLayer("eyes", "");
    }
}

function renderSettingChoices() {
    document.querySelectorAll("[data-setting-choice]").forEach((button) => {
        button.classList.toggle("selected", settings[button.dataset.settingChoice] === button.dataset.value);
    });
}

function setStep(step) {
    currentStep = steps.indexOf(step);
    document.querySelectorAll("[data-step-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.stepPanel === step));
    document.querySelectorAll("[data-step-target]").forEach((tab) => tab.classList.toggle("active", tab.dataset.stepTarget === step));
    document.getElementById("previousButton").hidden = currentStep === 0;
    document.getElementById("nextButton").hidden = currentStep === steps.length - 1;
}

document.querySelectorAll("[data-control]").forEach((button) => button.addEventListener("click", () => {
    const category = button.dataset.control;
    settings.bodyPreset = "custom";
    selection[category] = (selection[category] + Number(button.dataset.direction) + options[category].length) % options[category].length;
    renderCategory(category);
    document.getElementById("saveStatus").textContent = "Looking cute!";
}));

document.querySelectorAll("[data-setting-choice]").forEach((button) => button.addEventListener("click", () => {
    const setting = button.dataset.settingChoice;
    settings[setting] = button.dataset.value;
    settings.bodyPreset = "custom";
    if (setting === "species" && settings.species === "Deerbras") settings.skinTone = "Peachy";
    renderAvatar();
    renderSettingChoices();
    document.getElementById("saveStatus").textContent = `${button.dataset.value} selected!`;
    if (setting === "species") setStep("skinTone");
}));

document.querySelectorAll("[data-step-target]").forEach((tab) => tab.addEventListener("click", () => setStep(tab.dataset.stepTarget)));
document.getElementById("previousButton").addEventListener("click", () => setStep(steps[Math.max(0, currentStep - 1)]));
document.getElementById("nextButton").addEventListener("click", () => setStep(steps[Math.min(steps.length - 1, currentStep + 1)]));

document.getElementById("randomizeButton").addEventListener("click", () => {
    settings.bodyPreset = "custom";
    Object.keys(options).forEach((category) => selection[category] = Math.floor(Math.random() * options[category].length));
    settings.species = ["Pixies", "Deerbras"][Math.floor(Math.random() * 2)];
    settings.skinTone = settings.species === "Deerbras" ? "Peachy" : ["Nutmeg", "Peachy"][Math.floor(Math.random() * 2)];
    renderAvatar();
    renderSettingChoices();
    document.getElementById("saveStatus").textContent = "New look generated!";
});

document.getElementById("saveButton").addEventListener("click", () => {
    localStorage.setItem("8bitgpu-avatar-outfit", JSON.stringify({ ...selection, ...settings }));
    if (window.parent && window.parent !== window && typeof window.parent.refreshDesktopAvatar === "function") {
        window.parent.refreshDesktopAvatar();
    }
    if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: "8bitgpu-avatar-saved" }, window.location.origin);
    }
    if (window.opener) {
        window.opener.postMessage({ type: "8bitgpu-avatar-saved" }, window.location.origin);
    }
    document.getElementById("saveStatus").textContent = "Outfit saved to this browser!";
});

renderAvatar();
renderSettingChoices();
setStep("species");
