const assetPath = "assets/avatar/";

const options = {
    hair: [
        { name: "None", src: "" },
        { name: "Bombshell Blowout", src: "volume_hair_fem_idle_front_v1.png" },
        { name: "Hair v1", src: `${assetPath}hair_fem_v1.png` },
        { name: "Hair v2", src: `${assetPath}hair_fem_v2.png` },
        { name: "Deerbra Hair", src: `${assetPath}hair_fem_deerbra_v1.png` }
    ],
    eyes: [
        { name: "None", src: "" },
        { name: "Pixie Eyes 1", src: `${assetPath}eyes_fem_v1.png` },
        { name: "Pixie Eyes 2", src: `${assetPath}eyes_fem_v2.png` },
        { name: "Mac Eyes 1", src: `${assetPath}eyes_mac_v1.png` },
        { name: "Mac Eyes 2", src: `${assetPath}eyes_mac_v2.png` },
        { name: "Mac Eyes 3", src: `${assetPath}eyes_mac_v3.png` }
    ],
    fit: [
        { name: "None", src: "" },
        { name: "Fit 1", src: `${assetPath}fit_fem_v1.png` },
        { name: "Fit 2", src: `${assetPath}fit_fem_v2.png` }
    ],
    extra: [
        { name: "None", src: "" },
        { name: "Extra 1", src: `${assetPath}extra_fem_v1.png` },
        { name: "Extra 2", src: `${assetPath}extra_fem_v2.png` }
    ]
};

const selection = { hair: 1, eyes: 1, fit: 1, extra: 0 };
const settings = {
    species: "Pixies",
    skinTone: "Soft Pink",
    affinity: "Natura — nature",
    hairstyle: "Bombshell Blowout",
    fitTheme: "Mage"
};

let savedOutfit = null;
try {
    savedOutfit = JSON.parse(localStorage.getItem("8bitgpu-avatar-outfit"));
} catch {
    savedOutfit = null;
}

if (savedOutfit) {
    Object.keys(selection).forEach((category) => {
        if (Number.isInteger(savedOutfit[category]) && options[category][savedOutfit[category]]) {
            selection[category] = savedOutfit[category];
        }
    });

    Object.keys(settings).forEach((setting) => {
        if (typeof savedOutfit[setting] === "string") {
            settings[setting] = savedOutfit[setting];
        }
    });
}

function setLayer(layerName, src) {
    const layer = document.getElementById(`${layerName}Layer`);
    layer.src = src;
    layer.hidden = !src;
}

function renderBase() {
    if (settings.species === "Deerbras") {
        setLayer("body", `${assetPath}body_fem_deerbra_v1.png`);
        setLayer("ears", `${assetPath}ears_fem_deerbra_v1.png`);
        setLayer("head", `${assetPath}head_fem_deerbra_v1.png`);
        return;
    }

    const version = settings.skinTone === "Lavender Purple" ? "v2" : "v1";
    setLayer("body", `${assetPath}body_fem_${version}.png`);
    setLayer("ears", `${assetPath}ears_fem_${version}.png`);
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
}

document.querySelectorAll("[data-control]").forEach((button) => {
    button.addEventListener("click", () => {
        const category = button.dataset.control;
        const direction = Number(button.dataset.direction);
        selection[category] = (selection[category] + direction + options[category].length) % options[category].length;
        renderCategory(category);
        document.getElementById("saveStatus").textContent = "Looking cute ✦";
    });
});

document.querySelectorAll("[data-setting]").forEach((select) => {
    select.value = settings[select.dataset.setting];
    select.addEventListener("change", () => {
        settings[select.dataset.setting] = select.value;
        renderBase();
        document.getElementById("saveStatus").textContent = "New character detail selected ✦";
    });
});

document.getElementById("randomizeButton").addEventListener("click", () => {
    Object.keys(options).forEach((category) => {
        selection[category] = Math.floor(Math.random() * options[category].length);
    });
    document.querySelectorAll("[data-setting]").forEach((select) => {
        const choice = select.options[Math.floor(Math.random() * select.options.length)];
        select.value = choice.value;
        settings[select.dataset.setting] = choice.value;
    });
    renderAvatar();
    document.getElementById("saveStatus").textContent = "New look generated!";
});

document.getElementById("saveButton").addEventListener("click", () => {
    localStorage.setItem("8bitgpu-avatar-outfit", JSON.stringify({ ...selection, ...settings }));
    document.getElementById("saveStatus").textContent = "Outfit saved to this browser!";
});

renderAvatar();
