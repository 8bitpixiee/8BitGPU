const assetPath = "avatar/";
// Only expose character bases that have a complete body + head pair in /avatar.
// Keeping incomplete builds out of the live controls prevents a button from
// selecting a character that can never render.
const PLAYABLE_SPECIES = ["Pixie", "Deerbra", "Bovadill", "Thixie"];
const COMING_SOON_SPECIES = [];
// Keep saved species/build values compatible while exposing each body directly.
const beingChoices = [
    { name: "Pixie", species: "Pixie", build: "Fae" },
    { name: "Masc", species: "Pixie", build: "Masc" },
    { name: "Chunky Masc", species: "Pixie", build: "Chunky Masc" },
    { name: "Deerbra", species: "Deerbra", build: "Fae" },
    { name: "Bovadill", species: "Bovadill", build: "Highland" },
    { name: "Thixie", species: "Thixie", build: "Fae" }
    ,{ name: "Null", species: "Custom", build: "Null", bodyAsset: "Null.png" }
    ,{ name: "Femme", species: "Custom", build: "Femme", bodyAsset: "femme.png" }
    ,{ name: "Macho", species: "Custom", build: "Macho", bodyAsset: "macho.png" }
    ,{ name: "Maxie F", species: "Custom", build: "Maxie F", bodyAsset: "Maxie_F.png" }
    ,{ name: "Maxie M", species: "Custom", build: "Maxie M", bodyAsset: "Maxie_M.png" }
    ,{ name: "Anthro F", species: "Custom", build: "Anthro F", bodyAsset: "antrho_f.png" }
    ,{ name: "Anthro M", species: "Custom", build: "Anthro M", bodyAsset: "anthro_m.png" }
    ,{ name: "Clanker F", species: "Custom", build: "Clanker F", bodyAsset: "Clanker_F.png" }
    ,{ name: "Clanker M", species: "Custom", build: "Clanker M", bodyAsset: "Clanker_M.png" }
    ,{ name: "Mermaid F", species: "Custom", build: "Mermaid F", bodyAsset: "mermaid_f.png" }
    ,{ name: "Mermaid M", species: "Custom", build: "Mermaid M", bodyAsset: "mermaid_m.png" }
    ,{ name: "Voidling F", species: "Custom", build: "Voidling F", bodyAsset: "voidling_f.png" }
    ,{ name: "Voidling M", species: "Custom", build: "Voidling M", bodyAsset: "voidling_m.png" }
];
const customBodyAssets = Object.fromEntries(beingChoices.filter((choice) => choice.bodyAsset).map((choice) => [choice.build, choice.bodyAsset]));

const speciesData = {
    Pixie: {
        tones: ["Nutmeg", "Peachy", "Creme"],
        builds: ["Fae", "Masc", "Chunky Masc"]
    },
    Deerbra: {
        tones: ["Wood", "Copper", "Pedal"],
        builds: ["Fae"]
    },
    Bovadill: {
        tones: ["Cocoa", "Peachy", "Milky"],
        builds: ["Highland", "Holstein", "Dexter"]
    },
    Thixie: {
        tones: ["Nutmeg", "Creme", "Peachy"],
        builds: ["Fae"]
    },
    Custom: { tones: ["White"], builds: ["Null", "Femme", "Macho", "Maxie F", "Maxie M", "Anthro F", "Anthro M", "Clanker F", "Clanker M", "Mermaid F", "Mermaid M", "Voidling F", "Voidling M"] }
};

// These filenames are referenced by the catalogue but have not been uploaded
// to /avatar yet. Hide them from both the buttons and Randomize until the art
// arrives, instead of allowing a selection that produces a broken image.
const unavailableAssets = new Set();

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
        item("chillouts-magma", "Kitties Chillouts - Cool Magma", "fit_fem_v1.png", "Kitties Chillouts"),
        item("sunrise", "Sunrise Two-Piece", "fit_fem_v2.png", "Two-Piece"),
        item("malachite", "Malachite Two-Piece", "fit_fem_v3.png", "Two-Piece"),
        item("kittie-fit-one", "Kittie Fit - Look 01", "fit_kittie_v1.png", "Kittie Fits"),
        item("kittie-fit-two", "Kittie Fit - Look 02", "fit_kittie_v2.png", "Kittie Fits"),
        item("kittie-fit-three", "Kittie Fit - Look 03", "fit_kittie_v3.png", "Kittie Fits"),
        item("drawls-purple", "Drawls - Purple", "drawls_fem_idle_front_v1.png", "Drawls"),
        item("drawls-blue", "Drawls - Synth Blue", "drawls_fem_idle_front_v2.png", "Drawls"),
        item("drawls-gold", "Drawls - Golden Hour", "drawls_fem_idle_front_v3.png", "Drawls"),
        item("frolic-tree", "Frolic Fit - Tree Squatter", "frolic_fit_v1.png", "Frolic Fit"),
        item("frolic-smoke", "Frolic Fit - Smoke Spotter", "frolic_fit_v2.png", "Frolic Fit"),
        item("frolic-merican", "Frolic Fit - Merican Dough Boy", "frolic_fit_v3.png", "Frolic Fit"),
        item("skirt-blue", "Frolic Skirt - Blue", "frolic_skirt_v1.png", "Frolic Skirt"),
        item("skirt-red", "Frolic Skirt - Red", "frolic_skirt_v2.png", "Frolic Skirt"),
        item("skirt-green", "Frolic Skirt - Green", "frolic_skirt_v3.png", "Frolic Skirt"),
        item("thixie-aura", "Thixie Fit - Aura Blue", "thixie_fit_v1.png", "Thixie Fit"),
        item("thixie-mauve", "Thixie Fit - Mauve Kiss", "thixie_fit_v2.png", "Thixie Fit"),
        item("thixie-watermelon", "Thixie Fit - Watermelon", "thixie_fit_v3.png", "Thixie Fit")
    ],
    extra: [
        item("extra-none", "No Extra", "", "No Extra"),
        item("wings-lavender", "Pixie Wings - Lavender Sparkle", "wings_v1.png", "Pixie Wings"),
        item("wings-evil", "Pixie Wings - Evil Pixie", "wings_v2.png", "Pixie Wings"),
        item("wings-synth", "Pixie Wings - Synth Pixie", "wings_v3.png", "Pixie Wings"),
        item("kittie-tail-one", "Kittie Tail - Look 01", "kittie_tail_v1.png", "Kittie Tails"),
        item("kittie-tail-two", "Kittie Tail - Look 02", "kittie_tail_v2.png", "Kittie Tails"),
        item("kittie-tail-three", "Kittie Tail - Look 03", "kittie_tail_v3.png", "Kittie Tails"),
        item("bovadill-tail-highland", "Bovadill Tail - Highland", "bovidil_tail_v1.png", "Bovadill Tail", ["Bovadill"]),
        item("bovadill-tail-holstein", "Bovadill Tail - Holstein", "bovidil_tail_v2.png", "Bovadill Tail", ["Bovadill"]),
        item("bovadill-tail-dexter", "Bovadill Tail - Dexter", "bovidil_tail_v3.png", "Bovadill Tail", ["Bovadill"])
    ]
    ,chest: [item("chest-none", "No Chest Overlay", "", "No Chest Overlay"), item("chest-1", "Chest Size 1", "Boob_1.png", "Chest Size")]
};

const neutralColor = () => ({ hue: 0, saturation: 100, lightness: 100 });
const settings = { species: "Pixie", build: "Fae", skinTone: "Nutmeg", skinColor: neutralColor(), itemColors: {}, bodyAsset: "" };
const selection = { ears: "pixie-ears-nutmeg", chest: "chest-none", hair: "bombshell-original", eyes: "lashes-purple", fit: "chillouts-magma", extra: "wings-lavender" };
const steps = ["species", "skinTone", "style"];
let currentStep = 0;
let activePickerCategory = "hair";
const activeFamily = {};
const adjustableCategories = ["ears", "chest", "hair", "eyes", "fit", "extra"];
const adjustmentProfiles = {};

function profileKey() { return settings.species + ":" + settings.build; }
function defaultAdjustments() {
    const profile = Object.fromEntries(adjustableCategories.map((category) => [category, { x: 0, y: 0, scale: 1 }]));
    if (settings.build === "Masc") profile.eyes.y = 4;
    if (settings.build === "Chunky Masc") profile.eyes.y = 6;
    return profile;
}
function activeAdjustments() {
    if (!adjustmentProfiles[profileKey()]) adjustmentProfiles[profileKey()] = defaultAdjustments();
    return adjustmentProfiles[profileKey()];
}
function normalizeAdjustment(value) {
    return {
        x: Math.max(-20, Math.min(20, Number(value?.x) || 0)),
        y: Math.max(-20, Math.min(20, Number(value?.y) || 0)),
        scale: Math.max(.7, Math.min(1.3, Number(value?.scale) || 1))
    };
}
function applyLayerAdjustment(category) {
    const layer = document.getElementById(category + "Layer");
    if (!layer) return;
    const adjustment = activeAdjustments()[category];
    layer.style.transform = "translate(" + adjustment.x + "%, " + adjustment.y + "%) scale(" + adjustment.scale + ")";
}
function renderAdjuster() {
    const adjustment = activeAdjustments()[activePickerCategory];
    document.getElementById("adjusterReadout").textContent = activePickerCategory.toUpperCase() + " · X " + adjustment.x + " · Y " + adjustment.y + " · " + Math.round(adjustment.scale * 100) + "%";
}
function adjustActiveLayer(action) {
    const profile = activeAdjustments();
    const adjustment = profile[activePickerCategory];
    if (action === "left") adjustment.x = Math.max(-20, adjustment.x - 1);
    if (action === "right") adjustment.x = Math.min(20, adjustment.x + 1);
    if (action === "up") adjustment.y = Math.max(-20, adjustment.y - 1);
    if (action === "down") adjustment.y = Math.min(20, adjustment.y + 1);
    if (action === "shrink") adjustment.scale = Math.max(.7, Math.round((adjustment.scale - .05) * 100) / 100);
    if (action === "grow") adjustment.scale = Math.min(1.3, Math.round((adjustment.scale + .05) * 100) / 100);
    if (action === "reset") profile[activePickerCategory] = defaultAdjustments()[activePickerCategory];
    applyLayerAdjustment(activePickerCategory);
    renderAdjuster();
    document.getElementById("saveStatus").textContent = activePickerCategory.toUpperCase() + " alignment adjusted.";
}

function visibleOptions(category) {
    return options[category].filter((choice) => {
        const filename = choice.src.split("/").pop();
        return !choice.src || !unavailableAssets.has(filename);
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

        if (name === "body" && settings.bodyAsset) {
            document.getElementById("saveStatus").textContent = "That body PNG is missing from /avatar: " + settings.bodyAsset;
            return;
        }

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
    layer.style.display = source ? "block" : "none";
}
function normalizeSkinColor(value) {
    const number = (key, fallback) => Number.isFinite(Number(value?.[key])) ? Number(value[key]) : fallback;
    return {
        hue: Math.max(-180, Math.min(180, number("hue", 0))),
        saturation: Math.max(0, Math.min(200, number("saturation", 100))),
        lightness: Math.max(60, Math.min(140, number("lightness", 100)))
    };
}
function skinFilter(color = settings.skinColor) {
    return "hue-rotate(" + color.hue + "deg) saturate(" + color.saturation + "%) brightness(" + color.lightness + "%)";
}
function whiteSpriteFilter(color = settings.skinColor) {
    const unchanged = color.hue === 0 && color.saturation === 100 && color.lightness === 100;
    if (unchanged) return "none";
    // A hue rotation cannot change pure white. Sepia creates a color base
    // while black pixel outlines remain dark, then hue rotates that base.
    return "sepia(100%) saturate(" + Math.max(100, color.saturation * 4) + "%) hue-rotate(" + (color.hue - 28) + "deg) brightness(" + color.lightness + "%)";
}
function applySkinColor() {
    ["body", "head"].forEach((layer) => { const image = document.getElementById(layer + "Layer"); if (image) image.style.filter = settings.bodyAsset ? whiteSpriteFilter(settings.skinColor) : skinFilter(settings.skinColor); });
    adjustableCategories.forEach((category) => {
        const image = document.getElementById(category + "Layer");
        const selected = selectedOption(category);
        if (image) image.style.filter = skinFilter(settings.itemColors[selected.id] || neutralColor());
    });
}
function renderSkinSliders() {
    const color = settings.skinColor;
    const controls = [["skinHue", "hue", "°"], ["skinSaturation", "saturation", "%"], ["skinLightness", "lightness", "%"]];
    controls.forEach(([id, key, suffix]) => {
        const input = document.getElementById(id), output = document.getElementById(id + "Value");
        if (!input || !output) return;
        input.value = color[key]; output.textContent = color[key] + suffix;
    });
}
function renderItemSliders() {
    const selected = selectedOption(activePickerCategory);
    const color = settings.itemColors[selected.id] || neutralColor();
    document.getElementById("itemColorLegend").textContent = "Color " + selected.name;
    [["itemHue", "hue", "°"], ["itemSaturation", "saturation", "%"], ["itemLightness", "lightness", "%"]].forEach(([id, key, suffix]) => {
        const input = document.getElementById(id), output = document.getElementById(id + "Value");
        if (!input || !output) return;
        input.value = color[key]; output.textContent = color[key] + suffix;
    });
}
function baseFiles() {
    const customBody = settings.bodyAsset || customBodyAssets[settings.build];
    if (customBody) return { body: asset(customBody), head: "" };
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
        return { body: asset("bovidil_body_fem_v" + toneNumber + "." + breedNumber + ".png"), head: asset("bovidil_head_fem_v1.png") };
    }
    const bodyNumber = { Nutmeg: 1, Creme: 2, Peachy: 3 }[tone];
    const headNumber = { Nutmeg: 1, Creme: 2, Peachy: 3 }[tone];
    return { body: asset("thixie_body_v" + bodyNumber + ".png"), head: asset("thixie_head_v" + headNumber + ".png") };
}
function renderAvatar() {
    ensureSelections();
    const base = baseFiles();
    setLayer("body", base.body);
    setLayer("head", base.head);
    ["ears", "chest", "hair", "eyes", "fit", "extra"].forEach((category) => setLayer(category, selectedOption(category).src));
    adjustableCategories.forEach(applyLayerAdjustment);
    applySkinColor();
}
function renderPreviewLabel() {
    const username = localStorage.getItem("8bitgpu-player-name");
    document.getElementById("previewLabel").textContent = username ? username.toUpperCase() + "'S BEING" : "YOUR BEING";
}
function renderSpeciesChoices() {
    const playable = beingChoices.map(({ name, species, build, bodyAsset }) => {
        const selected = settings.species === species && settings.build === build;
        return '<button type="button" class="' + (selected ? "selected" : "") + '" aria-pressed="' + selected + '" data-species="' + species + '" data-being-build="' + build + '" data-body-asset="' + (bodyAsset || "") + '">' + name + '</button>';
    }).join("");
    const comingSoon = COMING_SOON_SPECIES.map((name) => '<button type="button" disabled aria-disabled="true" title="Character art coming soon">' + name + " — coming soon</button>").join("");
    document.getElementById("speciesGrid").innerHTML = playable + comingSoon;
    document.querySelectorAll("[data-species]").forEach((button) => button.addEventListener("click", () => {
        settings.species = button.dataset.species;
        settings.build = button.dataset.beingBuild;
        settings.bodyAsset = button.dataset.bodyAsset || "";
        settings.skinTone = speciesData[settings.species].tones[0];
        // The white body-build assets are full silhouettes. Start them clean
        // so a previous Pixie's outfit cannot hide the newly selected shape.
        if (settings.species === "Custom") {
            Object.keys(selection).forEach((category) => { selection[category] = category + "-none"; });
        }
        ensureSelections(); renderAll();
        document.getElementById("saveStatus").textContent = settings.species + " selected!";
    }));
}
function renderBuildChoices() {
    const builds = speciesData[settings.species].builds;
    const group = document.getElementById("buildGroup");
    group.hidden = true; // Body choices now live together in the Being grid.
    document.getElementById("buildGrid").innerHTML = builds.map((name) => '<button type="button" class="' + (settings.build === name ? "selected" : "") + '" data-build="' + name + '">' + name + "</button>").join("");
    document.querySelectorAll("[data-build]").forEach((button) => button.addEventListener("click", () => {
        settings.build = button.dataset.build;
        if (settings.build === "Masc" || settings.build === "Chunky Masc") selection.fit = "fit-none";
        renderAll();
        document.getElementById("saveStatus").textContent = settings.build + " build selected!";
    }));
}
function renderBreedChoices() {
    const group = document.getElementById("breedGroup");
    const isBovadill = settings.species === "Bovadill";
    group.hidden = !isBovadill;
    if (!isBovadill) {
        document.getElementById("breedGrid").innerHTML = "";
        return;
    }
    const breeds = speciesData.Bovadill.builds;
    document.getElementById("breedGrid").innerHTML = breeds.map((name) => '<button type="button" class="' + (settings.build === name ? "selected" : "") + '" data-breed="' + name + '">' + name + "</button>").join("");
    document.querySelectorAll("[data-breed]").forEach((button) => button.addEventListener("click", () => {
        settings.build = button.dataset.breed;
        renderAll();
        document.getElementById("saveStatus").textContent = settings.build + " coat selected!";
    }));
}
function renderToneChoices() {
    document.getElementById("toneGrid").dataset.paletteSpecies = settings.species;
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
    const removeButton = document.getElementById("removeSelectedItem"); if (removeButton) removeButton.textContent = "Remove " + category;
    document.querySelectorAll(".asset-tile").forEach((button) => button.addEventListener("click", () => {
        const selectedFamily = groups.find((group) => group.choices.some((choice) => choice.id === button.dataset.choiceId));
        activeFamily[category] = selectedFamily.name; selection[category] = selectedFamily.choices[0].id; renderAvatar(); renderPicker();
    }));
    document.querySelectorAll(".color-tile").forEach((button) => button.addEventListener("click", () => {
        selection[category] = button.dataset.choiceId; renderAvatar(); renderPicker();
    }));
    renderAdjuster(); renderItemSliders();
}
function renderAll() {
    renderSpeciesChoices(); renderBuildChoices(); renderToneChoices(); renderBreedChoices(); renderSkinSliders(); renderAvatar(); renderPicker(); renderPreviewLabel();
}
function randomChoice(list) { return list[Math.floor(Math.random() * list.length)]; }

try {
    const saved = JSON.parse(localStorage.getItem("8bitgpu-avatar-outfit"));
    if (saved) {
        const migration = { Pixies: "Pixie", Deerbras: "Deerbra", Thixies: "Thixie" };
        settings.species = migration[saved.species] || (speciesData[saved.species] ? saved.species : "Pixie");
        settings.build = speciesData[settings.species].builds.includes(saved.build) ? saved.build : speciesData[settings.species].builds[0];
        settings.skinTone = speciesData[settings.species].tones.includes(saved.skinTone) ? saved.skinTone : speciesData[settings.species].tones[0];
        settings.bodyAsset = saved.bodyAsset || beingChoices.find((choice) => choice.species === settings.species && choice.build === settings.build)?.bodyAsset || "";
        settings.skinColor = normalizeSkinColor(saved.skinColor);
        settings.itemColors = Object.fromEntries(Object.entries(saved.itemColors || {}).map(([id, color]) => [id, normalizeSkinColor(color)]));
        Object.keys(selection).forEach((category) => {
            if (saved.selection && options[category].some((choice) => choice.id === saved.selection[category])) selection[category] = saved.selection[category];
        });
        if (saved.adjustments) {
            adjustmentProfiles[profileKey()] = defaultAdjustments();
            adjustableCategories.forEach((category) => {
                if (saved.adjustments[category]) adjustmentProfiles[profileKey()][category] = normalizeAdjustment(saved.adjustments[category]);
            });
        }
    }
} catch { /* Start with the default Pixie if saved data is unavailable. */ }

document.querySelectorAll("[data-picker-category]").forEach((button) => button.addEventListener("click", () => { activePickerCategory = button.dataset.pickerCategory; renderPicker(); }));
document.getElementById("removeSelectedItem")?.addEventListener("click", () => {
    selection[activePickerCategory] = activePickerCategory + "-none";
    delete settings.itemColors[activePickerCategory + "-none"];
    setLayer(activePickerCategory, ""); renderPicker();
    document.getElementById("saveStatus").textContent = activePickerCategory.toUpperCase() + " removed.";
});
document.querySelectorAll("[data-adjust]").forEach((button) => button.addEventListener("click", () => adjustActiveLayer(button.dataset.adjust)));
[["skinHue", "hue"], ["skinSaturation", "saturation"], ["skinLightness", "lightness"]].forEach(([id, key]) => { const input=document.getElementById(id); if(input) input.addEventListener("input", (event) => {
    settings.skinColor[key] = Number(event.target.value); renderSkinSliders(); applySkinColor();
}); });
document.getElementById("resetSkinColor")?.addEventListener("click", () => {
    settings.skinColor = neutralColor(); renderSkinSliders(); applySkinColor();
});
[["itemHue", "hue"], ["itemSaturation", "saturation"], ["itemLightness", "lightness"]].forEach(([id, key]) => { const input=document.getElementById(id); if(input) input.addEventListener("input", (event) => {
    const selected = selectedOption(activePickerCategory); settings.itemColors[selected.id] = { ...(settings.itemColors[selected.id] || neutralColor()), [key]: Number(event.target.value) }; renderItemSliders(); applySkinColor();
}); });
document.getElementById("resetItemColor")?.addEventListener("click", () => { delete settings.itemColors[selectedOption(activePickerCategory).id]; renderItemSliders(); applySkinColor(); });
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
    const adjustments = JSON.parse(JSON.stringify(activeAdjustments()));
    const bodyAsset = settings.bodyAsset || customBodyAssets[settings.build] || "";
    const outfit = { version: 3, ...settings, bodyAsset, skinColor: normalizeSkinColor(settings.skinColor), itemColors: Object.fromEntries(Object.entries(settings.itemColors).map(([id, color]) => [id, normalizeSkinColor(color)])), bodyPreset: settings.species === "Thixie" ? "thixie" : "custom", selection: { ...selection }, layers, adjustments };
    localStorage.setItem("8bitgpu-avatar-outfit", JSON.stringify(outfit));
    localStorage.setItem("8bitgpu-user-avatar", "saved-being");
    localStorage.setItem("8bitgpu-user-avatar", "saved-being");
    if (window.parent && window.parent !== window) window.parent.postMessage({ type: "8bitgpu-avatar-saved" }, window.location.origin);
    if (window.opener) window.opener.postMessage({ type: "8bitgpu-avatar-saved" }, window.location.origin);
    try {
        const response = await fetch("/api/avatar", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(outfit) });
        document.getElementById("saveStatus").textContent = response.ok ? "Outfit saved to your player account!" : "Saved here. Online save will retry later.";
    } catch { document.getElementById("saveStatus").textContent = "Saved here. Online save is unavailable right now."; }
});
document.getElementById("mobileSaveButton").addEventListener("click", () => document.getElementById("saveButton").click());
document.getElementById("cameraButton").addEventListener("click", async () => {
    const button = document.getElementById("cameraButton"), slot = document.getElementById("snapshotSlot").value;
    button.disabled = true;
    try {
        const canvas = document.createElement("canvas"); canvas.width = canvas.height = 700;
        const context = canvas.getContext("2d"), gradient = context.createLinearGradient(0, 0, 700, 700);
        gradient.addColorStop(0, "#e4fff1"); gradient.addColorStop(.5, "#9ed9ca"); gradient.addColorStop(1, "#7760ad"); context.fillStyle = gradient; context.fillRect(0, 0, 700, 700);
        const images = [...document.querySelectorAll("#avatarCharacter img")].filter(image => image.src && !image.hidden);
        await Promise.all(images.map(image => image.decode?.().catch(() => {})));
        for (const image of images) { const key = image.id.replace("Layer", ""); const color = (key === "body" || key === "head") ? settings.skinColor : settings.itemColors[selectedOption(key)?.id] || neutralColor(); context.filter = (settings.bodyAsset && (key === "body" || key === "head")) ? whiteSpriteFilter(color) : skinFilter(color); context.drawImage(image, 0, 0, 700, 700); }
        context.filter = "none";
        const blob = await new Promise(resolve => canvas.toBlob(resolve, "image/webp", .88));
        if (!blob) throw Error("Camera could not create a snapshot.");
        const response = await fetch("/api/profile/images/" + slot, {method:"PUT",headers:{"content-type":"image/webp"},body:blob});
        const data = await response.json(); if (!response.ok) throw Error(data.error || "Snapshot could not save.");
        document.getElementById("saveStatus").textContent = "Camera snapshot saved to Desktop Backgrounds.";
    } catch (error) { document.getElementById("saveStatus").textContent = error.message; }
    finally { button.disabled = false; }
});
function playPreviewMotion() {
    const character = document.getElementById("avatarCharacter");
    character.classList.remove("is-hop");
    void character.offsetWidth;
    character.classList.add("is-hop");
    window.setTimeout(() => character.classList.remove("is-hop"), 540);
}
document.getElementById("avatarPreview").addEventListener("click", playPreviewMotion);
document.getElementById("avatarPreview").addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); playPreviewMotion(); }
});

renderAll();
setStep("species");


