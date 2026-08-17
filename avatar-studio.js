const assetPath = "avatar/";
// Only expose character bases that have a complete body + head pair in /avatar.
// Keeping incomplete builds out of the live controls prevents a button from
// selecting a character that can never render.
const PLAYABLE_SPECIES = ["Pixie", "Deerbra", "Thixie"];
const COMING_SOON_SPECIES = ["Bovadill"];

const speciesData = {
    Pixie: {
        tones: ["Nutmeg", "Peachy", "Creme"],
        builds: ["Fae"]
    },
    Deerbra: {
        tones: ["Wood", "Copper"],
        builds: ["Fae"]
    },
    Bovadill: {
        tones: ["Cocoa", "Peachy", "Milky"],
        builds: ["Highland", "Holstein", "Dexter"]
    },
    Thixie: {
        tones: ["Nutmeg", "Creme", "Peachy"],
        builds: ["Fae"]
    }
};

// These filenames are referenced by the catalogue but have not been uploaded
// to /avatar yet. Hide them from both the buttons and Randomize until the art
// arrives, instead of allowing a selection that produces a broken image.
const unavailableAssets = new Set([
    "ears_fem_deerbra_v2.png",
    "eyes_fem_v3.png",
    "eyes_mac_v4.png",
    "ponytail v1.png", "ponytail v2.png", "ponytail v3.png", "ponytail v4.png",
    "comfy_hair_m_v1.png", "comfy_hair_m_v2.png", "comfy_hair_m_v3.png", "comfy_hair_m_v4.png",
    "donnie_hair_v1.png", "donnie_hair_v2.png", "donnie_hair_v3.png",
    "frolic_fit_v1.png", "frolic_fit_v2.png", "frolic_fit_v3.png",
    "frolic_skirt_v1.png", "frolic_skirt_v2.png", "frolic_skirt_v3.png",
    "bovidil_tail_v1.png", "bovidil_tail_v2.png", "bovidil_tail_v3.png"
]);

const asset = (filename) => filename ? assetPath + filename : "";
const shared = PLAYABLE_SPECIES;
const item = (id, name, filename, family, species = shared) => ({ id, name, src: asset(filename), family, species });

const options = {
    ears: [
        item("ears-none", "No Ears", "", "No Ears"),
        item("pixie-ears-nutmeg", "Pixie Ears - Nutmeg", "ears_fem_v1.png", "Pixie Ears", ["Pixie"]),
        item("pixie-ears-peachy", "Pixie Ears - Peachy", "ears_fem_v2.png", "Pixie Ears", ["Pixie"]),
        item("pixie-ears-creme", "Pixie Ears - Creme", "ears_fem_v3.png", "Pixie Ears", ["Pixie"]),
        item("deerbra-ears-dark", "Deerbra Ears - Dark Brown", "ears_fem_deerbra_v1.png", "Deerbra Ears", ["Deerbra"]),
        item("deerbra-ears-light", "Deerbra Ears - Light Brown", "ears_fem_deerbra_v2.png", "Deerbra Ears", ["Deerbra"]),
        item("deerbra-ears-sandy", "Deerbra Ears - Sandy", "ears_fem_deerbra_v3.png", "Deerbra Ears", ["Deerbra"]),
        item("bovadill-ears-highland", "Bovadill Ears - Highland", "ears_fem_bovidil_v1.png", "Bovadill Ears", ["Bovadill"]),
        item("bovadill-ears-dark", "Bovadill Ears - Dark Brown", "ears_fem_bovidil_v2.png", "Bovadill Ears", ["Bovadill"]),
        item("bovadill-ears-holstein", "Bovadill Ears - Holstein", "ears_fem_bovidil_v3.png", "Bovadill Ears", ["Bovadill"])
    ],
    eyes: [
        item("eyes-none", "No Eyes", "", "No Eyes"),
        item("lashes-purple", "Lashes - Purple", "eyes_fem_v1.png", "Lashes"),
        item("lashes-pink", "Lashes - Pink", "eyes_fem_v2.png", "Lashes"),
        item("lashes-mystery", "Lashes - Unnamed", "eyes_fem_v3.png", "Lashes"),
        item("chill-purple", "Chill - Purple", "eyes_mac_v1.png", "Chill"),
        item("chill-red", "Chill - Red", "eyes_mac_v2.png", "Chill"),
        item("chill-green", "Chill - Green", "eyes_mac_v3.png", "Chill"),
        item("chill-turquoise", "Chill - Turquoise", "eyes_mac_v4.png", "Chill"),
        item("soppy-yellow", "Soppy - Yellow", "eyes_lemon.png", "Soppy")
    ],
    hair: [
        item("hair-none", "No Hair", "", "No Hair"),
        item("bombshell-original", "Bombshell Blowout - Original", "volume_hair_fem_idle_front_v1.png", "Bombshell Blowout"),
        item("bombshell-orchid", "Bombshell Blowout - Orchid", "sideswept_hair_v1.png", "Bombshell Blowout"),
        item("bombshell-seafoam", "Bombshell Blowout - Seafoam", "sideswept_hair_v2.png", "Bombshell Blowout"),
        item("bombshell-coral", "Bombshell Blowout - Coral", "sideswept_hair_v3.png", "Bombshell Blowout"),
        item("straight-violet", "Straight - Violet", "hair_fem_v1.png", "Straight"),
        item("beachy-cocoa", "Beachy Waves - Cocoa", "hair_fem_deerbra_v1.png", "Beachy Waves"),
        item("beachy-pumpkin", "Beachy Waves - Pumpkin", "hair_fem_deerbra_v2.png", "Beachy Waves"),
        item("beachy-halo", "Beachy Waves - Halo", "hair_fem_deerbra_v3.png", "Beachy Waves"),
        item("beachy-slime", "Beachy Waves - Slime", "hair_fem_deerbra_v4.png", "Beachy Waves"),
        item("bussdown-sunburst", "Bussdown - Sunburst", "hair_lemon_v1.png", "Bussdown"),
        item("bussdown-gaia", "Bussdown - Gaia", "hair_lemon_v2.png", "Bussdown"),
        item("bussdown-nebula", "Bussdown - Nebula", "hair_lemon_v3.png", "Bussdown"),
        item("locs-cocoa", "Locs - Cocoa", "hair_locs_v1.png", "Locs"),
        item("locs-mossy", "Locs - Mossy", "hair_locs_v2.png", "Locs"),
        item("locs-peachy", "Locs - Peachy", "hair_locs_v3.png", "Locs"),
        item("waves-chrysanthemum", "Long Waves - Chrysanthemum", "hair_longwaves_v1.png", "Long Waves"),
        item("waves-halo", "Long Waves - Halo", "hair_longwaves_v2.png", "Long Waves"),
        item("waves-cocoa", "Long Waves - Cocoa", "hair_longwaves_v3.png", "Long Waves"),
        item("pony-red", "Ponytail - Red", "ponytail v1.png", "Ponytail"),
        item("pony-blonde", "Ponytail - Blonde", "ponytail v2.png", "Ponytail"),
        item("pony-purple", "Ponytail - Cunt Purple", "ponytail v3.png", "Ponytail"),
        item("pony-moss", "Ponytail - Moss Green", "ponytail v4.png", "Ponytail"),
        item("comfy-brick", "Comfy Hair - Brick Brown", "comfy_hair_m_v1.png", "Comfy Hair"),
        item("comfy-dark", "Comfy Hair - Dark Brown", "comfy_hair_m_v2.png", "Comfy Hair"),
        item("comfy-blonde", "Comfy Hair - Blonde", "comfy_hair_m_v3.png", "Comfy Hair"),
        item("comfy-green", "Comfy Hair - Green", "comfy_hair_m_v4.png", "Comfy Hair"),
        item("donnie-gold", "Donnie Hair - Gold", "donnie_hair_v1.png", "Donnie Hair"),
        item("donnie-burgundy", "Donnie Hair - Burgundy", "donnie_hair_v2.png", "Donnie Hair"),
        item("donnie-purple", "Donnie Hair - Cunt Purple", "donnie_hair_v3.png", "Donnie Hair")
    ],
    fit: [
        item("fit-none", "No Fit", "", "No Fit"),
        item("chillouts-magma", "Kitties Chillouts - Cool Magma", "fit_fem_v1.png", "Kitties Chillouts", ["Pixie", "Deerbra"]),
        item("sunrise", "Sunrise Two-Piece", "fit_fem_v2.png", "Two-Piece", ["Pixie", "Deerbra"]),
        item("malachite", "Malachite Two-Piece", "fit_fem_v3.png", "Two-Piece", ["Pixie", "Deerbra"]),
        item("drawls-purple", "Drawls - Purple", "drawls_fem_idle_front_v1.png", "Drawls", ["Pixie", "Deerbra"]),
        item("drawls-blue", "Drawls - Synth Blue", "drawls_fem_idle_front_v2.png", "Drawls", ["Pixie", "Deerbra"]),
        item("drawls-gold", "Drawls - Golden Hour", "drawls_fem_idle_front_v3.png", "Drawls", ["Pixie", "Deerbra"]),
        item("frolic-tree", "Frolic Fit - Tree Squatter", "frolic_fit_v1.png", "Frolic Fit", ["Pixie", "Deerbra"]),
        item("frolic-smoke", "Frolic Fit - Smoke Spotter", "frolic_fit_v2.png", "Frolic Fit", ["Pixie", "Deerbra"]),
        item("frolic-merican", "Frolic Fit - Merican Dough Boy", "frolic_fit_v3.png", "Frolic Fit", ["Pixie", "Deerbra"]),
        item("skirt-blue", "Frolic Skirt - Blue", "frolic_skirt_v1.png", "Frolic Skirt", ["Pixie", "Deerbra"]),
        item("skirt-red", "Frolic Skirt - Red", "frolic_skirt_v2.png", "Frolic Skirt", ["Pixie", "Deerbra"]),
        item("skirt-green", "Frolic Skirt - Green", "frolic_skirt_v3.png", "Frolic Skirt", ["Pixie", "Deerbra"]),
        item("thixie-aura", "Thixie Fit - Aura Blue", "thixie_fit_v1.png", "Thixie Fit", ["Thixie"]),
        item("thixie-mauve", "Thixie Fit - Mauve Kiss", "thixie_fit_v2.png", "Thixie Fit", ["Thixie"]),
        item("thixie-watermelon", "Thixie Fit - Watermelon", "thixie_fit_v3.png", "Thixie Fit", ["Thixie"])
    ],
    extra: [
        item("extra-none", "No Extra", "", "No Extra"),
        item("wings-lavender", "Pixie Wings - Lavender Sparkle", "wings_v1.png", "Pixie Wings", ["Pixie", "Thixie"]),
        item("wings-evil", "Pixie Wings - Evil Pixie", "wings_v2.png", "Pixie Wings", ["Pixie", "Thixie"]),
        item("wings-synth", "Pixie Wings - Synth Pixie", "wings_v3.png", "Pixie Wings", ["Pixie", "Thixie"]),
        item("bovadill-tail-highland", "Bovadill Tail - Highland", "bovidil_tail_v1.png", "Bovadill Tail", ["Bovadill"]),
        item("bovadill-tail-holstein", "Bovadill Tail - Holstein", "bovidil_tail_v2.png", "Bovadill Tail", ["Bovadill"]),
        item("bovadill-tail-dexter", "Bovadill Tail - Dexter", "bovidil_tail_v3.png", "Bovadill Tail", ["Bovadill"])
    ]
};

const settings = { species: "Pixie", build: "Fae", skinTone: "Nutmeg" };
const selection = { ears: "pixie-ears-nutmeg", hair: "bombshell-original", eyes: "lashes-purple", fit: "chillouts-magma", extra: "wings-lavender" };
const steps = ["species", "skinTone", "style"];
let currentStep = 0;
let activePickerCategory = "hair";
const activeFamily = {};

function visibleOptions(category) {
    return options[category].filter((choice) => {
        const filename = choice.src.split("/").pop();
        return choice.species.includes(settings.species) && (!choice.src || !unavailableAssets.has(filename));
    });
}
function selectedOption(category) {
    return visibleOptions(category).find((choice) => choice.id === selection[category]) || visibleOptions(category)[0];
}
function optionGroups(category) {
    return visibleOptions(category).reduce((groups, choice) => {
        let group = groups.find((entry) => entry.name === choice.family);
        if (!group) {
            group = { name: choice.family, choices: [] };
            groups.push(group);
        }
        group.choices.push(choice);
        return groups;
    }, []);
}
function ensureSelections() {
    Object.keys(selection).forEach((category) => { selection[category] = selectedOption(category).id; });
}
function setLayer(name, source) {
    const layer = document.getElementById(name + "Layer");
    layer.onerror = () => {
        layer.hidden = true;

        // A saved outfit can point at an art file that has not been uploaded
        // yet. Fall back to the first real option instead of leaving a broken
        // little strip in the preview.
        if (Object.prototype.hasOwnProperty.call(selection, name)) {
            const fallback = visibleOptions(name).find((choice) => choice.id !== selection[name] && choice.src);
            if (fallback) {
                selection[name] = fallback.id;
                setLayer(name, fallback.src);
            }
        }
    };
    layer.src = source;
    layer.hidden = !source;
}
function baseFiles() {
    const tone = settings.skinTone;
    if (settings.species === "Pixie") {
        const number = { Nutmeg: 1, Peachy: 2, Creme: 3 }[tone];
        if (settings.build === "Masc") return { body: asset("body_masc_v" + number + ".png"), head: asset("head_masc_v" + number + ".png") };
        if (settings.build === "Chunky Masc") return { body: asset("body_chunky_masc_v" + number + ".png"), head: asset("head_chunky_masc_v" + number + ".png") };
        return { body: asset("body_fem_v" + number + ".png"), head: asset("head_fem_v" + number + ".png") };
    }
    if (settings.species === "Deerbra") {
        const number = { Wood: 1, Copper: 2, Pedal: 3 }[tone];
        return { body: asset("body_fem_deerbra_v" + number + ".png"), head: asset("head_fem_deerbra_v" + number + ".png") };
    }
    if (settings.species === "Bovadill") {
        const toneNumber = { Cocoa: 1, Peachy: 2, Milky: 3 }[tone];
        const breedNumber = { Highland: 1, Holstein: 2, Dexter: 3 }[settings.build];
        return { body: asset("bovidil_body_fem_v" + toneNumber + "." + breedNumber + ".png"), head: asset("bovidil_head_fem_v" + toneNumber + ".png") };
    }
    const bodyNumber = { Nutmeg: 1, Creme: 2, Peachy: 4 }[tone];
    const headNumber = { Nutmeg: 1, Creme: 2, Peachy: 3 }[tone];
    return { body: asset("thixie_body_v" + bodyNumber + ".png"), head: asset("thixie_head_v" + headNumber + ".png") };
}
function renderAvatar() {
    ensureSelections();
    const base = baseFiles();
    setLayer("body", base.body);
    setLayer("head", base.head);
    ["ears", "hair", "eyes", "fit", "extra"].forEach((category) => setLayer(category, selectedOption(category).src));
}
function renderPreviewLabel() {
    const username = localStorage.getItem("8bitgpu-player-name");
    document.getElementById("previewLabel").textContent = username ? username.toUpperCase() + "'S BEING" : "YOUR BEING";
}
function renderSpeciesChoices() {
    const playable = PLAYABLE_SPECIES.map((name) => '<button type="button" class="' + (settings.species === name ? "selected" : "") + '" data-species="' + name + '">' + name + "</button>").join("");
    const comingSoon = COMING_SOON_SPECIES.map((name) => '<button type="button" disabled aria-disabled="true" title="Character art coming soon">' + name + " — coming soon</button>").join("");
    document.getElementById("speciesGrid").innerHTML = playable + comingSoon;
    document.querySelectorAll("[data-species]").forEach((button) => button.addEventListener("click", () => {
        settings.species = button.dataset.species;
        settings.build = speciesData[settings.species].builds[0];
        settings.skinTone = speciesData[settings.species].tones[0];
        ensureSelections(); renderAll(); setStep("skinTone");
        document.getElementById("saveStatus").textContent = settings.species + " selected!";
    }));
}
function renderBuildChoices() {
    const builds = speciesData[settings.species].builds;
    const group = document.getElementById("buildGroup");
    group.hidden = builds.length < 2;
    document.getElementById("buildGrid").innerHTML = builds.map((name) => '<button type="button" class="' + (settings.build === name ? "selected" : "") + '" data-build="' + name + '">' + name + "</button>").join("");
    document.querySelectorAll("[data-build]").forEach((button) => button.addEventListener("click", () => {
        settings.build = button.dataset.build;
        renderAll();
        document.getElementById("saveStatus").textContent = settings.build + " build selected!";
    }));
}
function renderToneChoices() {
    document.getElementById("toneGrid").innerHTML = speciesData[settings.species].tones.map((tone) => '<button type="button" class="swatch ' + tone.toLowerCase() + (settings.skinTone === tone ? " selected" : "") + '" data-tone="' + tone + '"><span>' + tone + "</span></button>").join("");
    document.querySelectorAll("[data-tone]").forEach((button) => button.addEventListener("click", () => {
        settings.skinTone = button.dataset.tone;
        renderAll();
        document.getElementById("saveStatus").textContent = settings.skinTone + " selected!";
    }));
}
function setStep(step) {
    currentStep = steps.indexOf(step);
    document.querySelectorAll("[data-step-panel]").forEach((panel) => panel.classList.toggle("active", panel.dataset.stepPanel === step));
    document.querySelectorAll("[data-step-target]").forEach((tab) => tab.classList.toggle("active", tab.dataset.stepTarget === step));
    document.getElementById("previousButton").hidden = currentStep === 0;
    document.getElementById("nextButton").hidden = currentStep === steps.length - 1;
    if (step === "style") renderPicker();
}
function tileMarkup(choice, className, selected) {
    // If a PNG was not uploaded yet, remove its tile rather than showing the
    // browser's broken-image icon. It automatically comes back when that PNG
    // exists in /avatar/.
    const image = '<img src="' + choice.src + '" alt="" onerror="this.closest(\'button\').remove()">';
    return '<button type="button" class="' + className + (selected ? " selected" : "") + (choice.src ? "" : " is-none") + '" data-choice-id="' + choice.id + '" title="' + choice.name + '" aria-label="' + choice.name + '">' + (choice.src ? image : "X") + "</button>";
}
function renderPicker() {
    const category = activePickerCategory;
    const groups = optionGroups(category);
    const selected = selectedOption(category);
    if (!activeFamily[category] || !groups.some((group) => group.name === activeFamily[category])) activeFamily[category] = groups.find((group) => group.choices.some((choice) => choice.id === selected.id)).name;
    const family = groups.find((group) => group.name === activeFamily[category]);
    document.querySelectorAll("[data-picker-category]").forEach((button) => button.classList.toggle("active", button.dataset.pickerCategory === category));
    document.getElementById("pickerLabel").textContent = category.toUpperCase() + " STYLE";
    document.getElementById("assetGrid").innerHTML = groups.map((group) => tileMarkup(group.choices[0], "asset-tile", group.name === activeFamily[category])).join("");
    document.getElementById("colorLabel").textContent = family.choices.length > 1 ? "COLORWAY" : "SELECTED ITEM";
    document.getElementById("colorGrid").innerHTML = family.choices.map((choice) => tileMarkup(choice, "color-tile", choice.id === selection[category])).join("");
    document.querySelectorAll(".asset-tile").forEach((button) => button.addEventListener("click", () => {
        const selectedFamily = groups.find((group) => group.choices.some((choice) => choice.id === button.dataset.choiceId));
        activeFamily[category] = selectedFamily.name; selection[category] = selectedFamily.choices[0].id; renderAvatar(); renderPicker();
    }));
    document.querySelectorAll(".color-tile").forEach((button) => button.addEventListener("click", () => {
        selection[category] = button.dataset.choiceId; renderAvatar(); renderPicker();
    }));
}
function renderAll() {
    renderSpeciesChoices(); renderBuildChoices(); renderToneChoices(); renderAvatar(); renderPicker(); renderPreviewLabel();
}
function randomChoice(list) { return list[Math.floor(Math.random() * list.length)]; }

try {
    const saved = JSON.parse(localStorage.getItem("8bitgpu-avatar-outfit"));
    if (saved) {
        const migration = { Pixies: "Pixie", Deerbras: "Deerbra", Thixies: "Thixie" };
        settings.species = migration[saved.species] || (PLAYABLE_SPECIES.includes(saved.species) ? saved.species : "Pixie");
        settings.build = speciesData[settings.species].builds.includes(saved.build) ? saved.build : speciesData[settings.species].builds[0];
        settings.skinTone = speciesData[settings.species].tones.includes(saved.skinTone) ? saved.skinTone : speciesData[settings.species].tones[0];
        Object.keys(selection).forEach((category) => {
            if (saved.selection && options[category].some((choice) => choice.id === saved.selection[category])) selection[category] = saved.selection[category];
        });
    }
} catch { /* Start with the default Pixie if saved data is unavailable. */ }

document.querySelectorAll("[data-picker-category]").forEach((button) => button.addEventListener("click", () => { activePickerCategory = button.dataset.pickerCategory; renderPicker(); }));
document.querySelectorAll("[data-step-target]").forEach((button) => button.addEventListener("click", () => setStep(button.dataset.stepTarget)));
document.getElementById("previousButton").addEventListener("click", () => setStep(steps[Math.max(0, currentStep - 1)]));
document.getElementById("nextButton").addEventListener("click", () => setStep(steps[Math.min(steps.length - 1, currentStep + 1)]));
document.getElementById("randomizeButton").addEventListener("click", () => {
    settings.species = randomChoice(PLAYABLE_SPECIES);
    settings.build = randomChoice(speciesData[settings.species].builds);
    settings.skinTone = randomChoice(speciesData[settings.species].tones);
    Object.keys(selection).forEach((category) => selection[category] = randomChoice(visibleOptions(category)).id);
    renderAll(); document.getElementById("saveStatus").textContent = "New look generated!";
});
document.getElementById("saveButton").addEventListener("click", async () => {
    const layers = {};
    Object.keys(selection).forEach((category) => layers[category] = selectedOption(category).src);
    const outfit = { version: 2, ...settings, bodyPreset: settings.species === "Thixie" ? "thixie" : "custom", selection: { ...selection }, layers };
    localStorage.setItem("8bitgpu-avatar-outfit", JSON.stringify(outfit));
    if (window.parent && window.parent !== window) window.parent.postMessage({ type: "8bitgpu-avatar-saved" }, window.location.origin);
    if (window.opener) window.opener.postMessage({ type: "8bitgpu-avatar-saved" }, window.location.origin);
    try {
        const response = await fetch("/api/avatar", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(outfit) });
        document.getElementById("saveStatus").textContent = response.ok ? "Outfit saved to your player account!" : "Saved here. Online save will retry later.";
    } catch { document.getElementById("saveStatus").textContent = "Saved here. Online save is unavailable right now."; }
});
document.getElementById("mobileSaveButton").addEventListener("click", () => document.getElementById("saveButton").click());

renderAll();
setStep("species");
