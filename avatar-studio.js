const assetPath = "avatar/";

const options = {
    ears: [
        { name: "Pixie Ears", src: `${assetPath}ears_fem_v1.png` }, { name: "Peachy Pixie Ears", src: `${assetPath}ears_fem_v2.png` }, { name: "Creme Pixie Ears", src: `${assetPath}ears_fem_v3.png` },
        { name: "Kittie Ears", src: `${assetPath}kittie_ears_v1.png` }, { name: "Gray Kittie Ears", src: `${assetPath}kittie_ears_v2.png` }, { name: "Black Kittie Ears", src: `${assetPath}kittie_ears_v3.png` },
        { name: "Deerbra Ears", src: `${assetPath}ears_fem_deerbra_v1.png` }, { name: "Sandy Deerbra Ears", src: `${assetPath}ears_fem_deerbra_v3.png` },
        { name: "Brown Bovadill Ears", src: `${assetPath}ears_fem_bovidil_v1.png` }, { name: "Dark Brown Bovadill Ears", src: `${assetPath}ears_fem_bovidil_v2.png` }, { name: "Cow Print Bovadill Ears", src: `${assetPath}ears_fem_bovidil_v3.png` }
    ],
    hair: [
        { name: "None", src: "" }, { name: "Bombshell Blowout", src: "volume_hair_fem_idle_front_v1.png" }, { name: "Straight Violet", src: `${assetPath}hair_fem_v1.png` },
        { name: "Beachy Waves Cocoa", src: `${assetPath}hair_fem_deerbra_v1.png` }, { name: "Beachy Waves Pumpkin", src: `${assetPath}hair_fem_deerbra_v2.png` }, { name: "Beachy Waves Halo", src: `${assetPath}hair_fem_deerbra_v3.png` }, { name: "Beachy Waves Slime", src: `${assetPath}hair_fem_deerbra_v4.png` },
        { name: "Sunburst Bussdown", src: `${assetPath}hair_lemon_v1.png` }, { name: "Gaia Bussdown", src: `${assetPath}hair_lemon_v2.png` }, { name: "Nebula Bussdown", src: `${assetPath}hair_lemon_v3.png` },
        { name: "Cocoa Locs", src: `${assetPath}hair_locs_v1.png` }, { name: "Mossy Locs", src: `${assetPath}hair_locs_v2.png` }, { name: "Peachy Locs", src: `${assetPath}hair_locs_v3.png` },
        { name: "Long Waves Chrysanthemum", src: `${assetPath}hair_longwaves_v1.png` }, { name: "Long Waves Halo", src: `${assetPath}hair_longwaves_v2.png` }, { name: "Long Waves Cocoa", src: `${assetPath}hair_longwaves_v3.png` },
        { name: "Bombshell Orchid", src: `${assetPath}sideswept_hair_v1.png` }, { name: "Bombshell Seafoam", src: `${assetPath}sideswept_hair_v2.png` }, { name: "Bombshell Coral", src: `${assetPath}sideswept_hair_v3.png` }
    ],
    eyes: [
        { name: "None", src: "" }, { name: "Purple F", src: `${assetPath}eyes_fem_v1.png` }, { name: "Pink F", src: `${assetPath}eyes_fem_v2.png` },
        { name: "Purple M", src: `${assetPath}eyes_mac_v1.png` }, { name: "Red M", src: `${assetPath}eyes_mac_v2.png` }, { name: "Green M", src: `${assetPath}eyes_mac_v3.png` }, { name: "Lemon", src: `${assetPath}eyes_lemon.png` }
    ],
    fit: [
        { name: "None", src: "" }, { name: "Kitties Chillouts Cool Magma", src: `${assetPath}fit_fem_v1.png` }, { name: "Sunrise Two-Piece", src: `${assetPath}fit_fem_v2.png` }, { name: "Malachite Two-Piece", src: `${assetPath}fit_fem_v3.png` },
        { name: "Kitties Chillouts", src: `${assetPath}fit_kittie_v1.png` }, { name: "Space Cadet Chillouts", src: `${assetPath}fit_kittie_v2.png` }, { name: "Blue Dream Chillouts", src: `${assetPath}fit_kittie_v3.png` },
        { name: "Purple Drawls", src: `${assetPath}drawls_fem_idle_front_v1.png` }, { name: "Synth Blue Drawls", src: `${assetPath}drawls_fem_idle_front_v2.png` }, { name: "Golden Hour Drawls", src: `${assetPath}drawls_fem_idle_front_v3.png` }
    ],
    thixieFit: [{ name: "None", src: "" }, { name: "Aura Blue", src: `${assetPath}thixie_fit_v1.png` }, { name: "Mauve Kiss", src: `${assetPath}thixie_fit_v2.png` }, { name: "Watermelon", src: `${assetPath}thixie_fit_v3.png` }],
    extra: [
        { name: "None", src: "" }, { name: "Pixie Wings", src: `${assetPath}wings_v1.png` }, { name: "Evil Pixie Wings", src: `${assetPath}wings_v2.png` }, { name: "Synth Pixie Wings", src: `${assetPath}wings_v3.png` },
        { name: "Mr. Babies Tail", src: `${assetPath}kittie_tail_v1.png` }, { name: "Gray Mr. Babies Tail", src: `${assetPath}kittie_tail_v2.png` }, { name: "Black Curvy Tail", src: `${assetPath}kittie_tail_v3.png` }
    ]
};

const selection = { ears: 0, hair: 1, eyes: 1, fit: 1, extra: 0 };
const settings = { species: "Pixies", skinTone: "Nutmeg", bodyPreset: "custom" };
const steps = ["species", "skinTone", "style"];
const pickerGroups = {
    hair: [{ name: "No Hair", variants: [0] }, { name: "Bombshell", variants: [1, 16, 17, 18] }, { name: "Straight", variants: [2] }, { name: "Beachy Waves", variants: [3, 4, 5, 6] }, { name: "Bussdown", variants: [7, 8, 9] }, { name: "Locs", variants: [10, 11, 12] }, { name: "Long Waves", variants: [13, 14, 15] }],
    eyes: [{ name: "No Eyes", variants: [0] }, { name: "Feminine Eyes", variants: [1, 2] }, { name: "Masc Eyes", variants: [3, 4, 5] }, { name: "Lemon Eyes", variants: [6] }],
    ears: [{ name: "Pixie", variants: [0, 1, 2] }, { name: "Kittie", variants: [3, 4, 5] }, { name: "Deerbra", variants: [6, 7] }, { name: "Bovadill", variants: [8, 9, 10] }],
    fit: [{ name: "No Fit", variants: [0] }, { name: "Two-Piece", variants: [1, 2, 3] }, { name: "Chillouts", variants: [4, 5, 6] }, { name: "Drawls", variants: [7, 8, 9] }],
    extra: [{ name: "No Extra", variants: [0] }, { name: "Wings", variants: [1, 2, 3] }, { name: "Tails", variants: [4, 5, 6] }]
};
let currentStep = 0;
let activePickerCategory = "hair";
const activePickerGroup = { hair: 1, eyes: 1, ears: 0, fit: 1, extra: 1 };

function currentOptions(category) { return category === "fit" && settings.bodyPreset === "thixie" ? options.thixieFit : options[category]; }
function validSkinTones() { return settings.species === "Deerbras" ? ["Peachy", "Creme"] : ["Nutmeg", "Peachy", "Creme"]; }
function groupsFor(category) { return category === "fit" && settings.bodyPreset === "thixie" ? currentOptions("fit").map((_, index) => ({ name: currentOptions("fit")[index].name, variants: [index] })) : pickerGroups[category]; }

try {
    const saved = JSON.parse(localStorage.getItem("8bitgpu-avatar-outfit"));
    if (saved) {
        if (["Pixies", "Deerbras", "Thixies"].includes(saved.species)) settings.species = saved.species;
        if (["Nutmeg", "Peachy", "Creme"].includes(saved.skinTone)) settings.skinTone = saved.skinTone;
        settings.bodyPreset = saved.bodyPreset === "thixie" || saved.species === "Thixies" ? "thixie" : "custom";
        if (!validSkinTones().includes(settings.skinTone)) settings.skinTone = validSkinTones()[0];
        Object.keys(selection).forEach((category) => { if (Number.isInteger(saved[category]) && currentOptions(category)[saved[category]]) selection[category] = saved[category]; });
    }
} catch { /* Start with the default Pixie if saved data is unavailable. */ }

function setLayer(layerName, src) { const layer = document.getElementById(`${layerName}Layer`); layer.onerror = () => { layer.hidden = true; }; layer.src = src; layer.hidden = !src; }
function renderPreviewLabel() { const username = localStorage.getItem("8bitgpu-player-name"); document.getElementById("previewLabel").textContent = username ? `${username.toUpperCase()}'S BEING` : "YOUR BEING"; }
function renderBase() {
    if (settings.bodyPreset === "thixie") { const bodyVersion = { Nutmeg: "v1", Creme: "v2", Peachy: "v4" }[settings.skinTone]; const headVersion = { Nutmeg: "v1", Creme: "v2", Peachy: "v3" }[settings.skinTone]; setLayer("body", `${assetPath}thixie_body_${bodyVersion}.png`); setLayer("head", `${assetPath}thixie_head_${headVersion}.png`); return; }
    if (settings.species === "Deerbras") { const version = settings.skinTone === "Creme" ? "v2" : "v1"; setLayer("body", `${assetPath}body_fem_deerbra_${version}.png`); setLayer("head", `${assetPath}head_fem_deerbra_${version}.png`); return; }
    const version = { Nutmeg: "v1", Peachy: "v2", Creme: "v3" }[settings.skinTone]; setLayer("body", `${assetPath}body_fem_${version}.png`); setLayer("head", `${assetPath}head_fem_${version}.png`);
}
function renderCategory(category) { const item = currentOptions(category)[selection[category]] || currentOptions(category)[0]; setLayer(category, item.src); const name = document.getElementById(`${category}Name`); if (name) name.textContent = item.name; }
function renderAvatar() { renderBase(); ["ears", "hair", "eyes", "fit", "extra"].forEach(renderCategory); }
function renderSettingChoices() { document.querySelectorAll("[data-setting-choice]").forEach((button) => { const setting = button.dataset.settingChoice; const unavailable = setting === "skinTone" && !validSkinTones().includes(button.dataset.value); button.hidden = unavailable; button.classList.toggle("selected", settings[setting] === button.dataset.value); }); }
function setStep(step) { currentStep = steps.indexOf(step); document.querySelectorAll("[data-step-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.stepPanel === step)); document.querySelectorAll("[data-step-target]").forEach((tab) => tab.classList.toggle("active", tab.dataset.stepTarget === step)); document.getElementById("previousButton").hidden = currentStep === 0; document.getElementById("nextButton").hidden = currentStep === steps.length - 1; if (step === "style") renderPicker(); }
function tileMarkup(item, className, index, selected) { return `<button type="button" class="${className}${selected ? " selected" : ""}${item.src ? "" : " is-none"}" data-picker-index="${index}" title="${item.name}" aria-label="${item.name}">${item.src ? `<img src="${item.src}" alt="">` : "×"}</button>`; }
function renderPicker() {
    const category = activePickerCategory; const list = currentOptions(category); const groups = groupsFor(category);
    if (!groups.some((group) => group.variants.includes(selection[category]))) selection[category] = groups[0].variants[0];
    let groupIndex = activePickerGroup[category] ?? 0;
    if (!groups[groupIndex] || !groups[groupIndex].variants.includes(selection[category])) groupIndex = groups.findIndex((group) => group.variants.includes(selection[category]));
    activePickerGroup[category] = Math.max(0, groupIndex);
    document.querySelectorAll("[data-picker-category]").forEach((button) => button.classList.toggle("active", button.dataset.pickerCategory === category));
    document.getElementById("pickerLabel").textContent = `${category.toUpperCase()} STYLE`;
    document.getElementById("assetGrid").innerHTML = groups.map((group, index) => { const item = list[group.variants[0]]; return tileMarkup({ ...item, name: group.name }, "asset-tile", index, index === activePickerGroup[category]); }).join("");
    const colors = groups[activePickerGroup[category]].variants;
    document.getElementById("colorLabel").textContent = colors.length > 1 ? "COLORWAY" : "SELECTED ITEM";
    document.getElementById("colorGrid").innerHTML = colors.map((index) => tileMarkup(list[index], "color-tile", index, selection[category] === index)).join("");
    document.querySelectorAll(".asset-tile").forEach((button) => button.addEventListener("click", () => { activePickerGroup[category] = Number(button.dataset.pickerIndex); const first = groups[activePickerGroup[category]].variants[0]; selection[category] = first; renderCategory(category); renderPicker(); document.getElementById("saveStatus").textContent = "Style selected!"; }));
    document.querySelectorAll(".color-tile").forEach((button) => button.addEventListener("click", () => { selection[category] = Number(button.dataset.pickerIndex); renderCategory(category); renderPicker(); document.getElementById("saveStatus").textContent = "Colorway selected!"; }));
}

document.querySelectorAll("[data-picker-category]").forEach((button) => button.addEventListener("click", () => { activePickerCategory = button.dataset.pickerCategory; renderPicker(); }));
document.querySelectorAll("[data-setting-choice]").forEach((button) => button.addEventListener("click", () => { const setting = button.dataset.settingChoice; settings[setting] = button.dataset.value; if (setting === "species") { settings.bodyPreset = settings.species === "Thixies" ? "thixie" : "custom"; if (!validSkinTones().includes(settings.skinTone)) settings.skinTone = validSkinTones()[0]; selection.fit = settings.bodyPreset === "thixie" ? 1 : 1; setStep("skinTone"); } renderAvatar(); renderSettingChoices(); renderPicker(); document.getElementById("saveStatus").textContent = `${button.textContent} selected!`; }));
document.querySelectorAll("[data-step-target]").forEach((tab) => tab.addEventListener("click", () => setStep(tab.dataset.stepTarget)));
document.getElementById("previousButton").addEventListener("click", () => setStep(steps[Math.max(0, currentStep - 1)]));
document.getElementById("nextButton").addEventListener("click", () => setStep(steps[Math.min(steps.length - 1, currentStep + 1)]));
document.getElementById("randomizeButton").addEventListener("click", () => { settings.species = ["Pixies", "Deerbras", "Thixies"][Math.floor(Math.random() * 3)]; settings.bodyPreset = settings.species === "Thixies" ? "thixie" : "custom"; const tones = validSkinTones(); settings.skinTone = tones[Math.floor(Math.random() * tones.length)]; ["ears", "hair", "eyes", "fit", "extra"].forEach((category) => selection[category] = Math.floor(Math.random() * currentOptions(category).length)); renderAvatar(); renderSettingChoices(); renderPicker(); document.getElementById("saveStatus").textContent = "New look generated!"; });
document.getElementById("saveButton").addEventListener("click", async () => { const outfit = { ...selection, ...settings }; localStorage.setItem("8bitgpu-avatar-outfit", JSON.stringify(outfit)); if (window.parent && window.parent !== window && typeof window.parent.refreshDesktopAvatar === "function") window.parent.refreshDesktopAvatar(); if (window.parent && window.parent !== window) window.parent.postMessage({ type: "8bitgpu-avatar-saved" }, window.location.origin); if (window.opener) window.opener.postMessage({ type: "8bitgpu-avatar-saved" }, window.location.origin); try { const response = await fetch("/api/avatar", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(outfit) }); document.getElementById("saveStatus").textContent = response.ok ? "Outfit saved to your player account!" : response.status === 401 ? "Saved here — log in to save it online too." : "Saved here. Online save will retry later."; } catch { document.getElementById("saveStatus").textContent = "Saved here. Online save is unavailable right now."; } });

renderAvatar(); renderPreviewLabel(); renderSettingChoices(); setStep("species");
async function restoreOnlineOutfit() { try { const response = await fetch("/api/auth/me", { cache: "no-store" }); const data = await response.json(); if (!data.user) return; localStorage.setItem("8bitgpu-player-name", data.user.username); renderPreviewLabel(); if (!data.user.avatar) return; const onlineOutfit = JSON.stringify(data.user.avatar); if (localStorage.getItem("8bitgpu-avatar-outfit") !== onlineOutfit) { localStorage.setItem("8bitgpu-avatar-outfit", onlineOutfit); window.location.reload(); } } catch { /* Avatar Lab still works locally if the account server is offline. */ } }
restoreOnlineOutfit();
