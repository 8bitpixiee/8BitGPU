const byId = (id) => document.getElementById(id);
const layers = ["extra", "body", "ears", "head", "eyes", "hair", "fit"];
let profile = null;
let isOwnProfile = false;

function setStatus(message) { byId("pageStatus").textContent = message; }
function setLayer(name, source) {
    const image = byId(name + "Layer");
    image.src = source || "";
    image.hidden = !source;
    image.onerror = () => { image.hidden = true; };
}
function baseLayers(avatar) {
    const tone = avatar?.skinTone;
    const species = avatar?.species;
    const build = avatar?.build;
    if (species === "Pixie") {
        const number = { Nutmeg: 1, Peachy: 2, Creme: 3 }[tone] || 1;
        const type = build === "Masc" ? "masc" : build === "Chunky Masc" ? "chunky_masc" : "fem";
        return { body: `avatar/body_${type}_v${number}.png`, head: `avatar/head_${type}_v${number}.png` };
    }
    if (species === "Deerbra") { const number = { Wood: 1, Copper: 2, Pedal: 3 }[tone] || 1; return { body: `avatar/body_fem_deerbra_v${number}.png`, head: `avatar/head_fem_deerbra_v${number}.png` }; }
    if (species === "Bovadill") { const toneNumber = { Cocoa: 1, Peachy: 2, Milky: 3 }[tone] || 1; const breedNumber = { Highland: 1, Holstein: 2, Dexter: 3 }[build] || 1; return { body: `avatar/bovidil_body_fem_v${toneNumber}.${breedNumber}.png`, head: "avatar/bovidil_head_fem_v1.png" }; }
    if (species === "Thixie") { const number = { Nutmeg: 1, Creme: 2, Peachy: 3 }[tone] || 1; return { body: `avatar/thixie_body_v${number}.png`, head: `avatar/thixie_head_v${number}.png` }; }
    return { body: "avatar/body_fem_v1.png", head: "avatar/head_fem_v1.png" };
}
function renderAvatar(avatar) {
    const base = baseLayers(avatar);
    const saved = avatar?.layers || {};
    layers.forEach((name) => setLayer(name, base[name] || saved[name] || ""));
}
function setTheme(theme) { document.body.dataset.theme = theme || "violet"; }
function clamp(value, min, max) { return Math.min(max, Math.max(min, value)); }
function hexToHsl(hex) {
    const value = String(hex || "").replace("#", "");
    if (!/^[0-9a-f]{6}$/i.test(value)) return { h: 280, s: 45, l: 80 };
    const red = parseInt(value.slice(0, 2), 16) / 255;
    const green = parseInt(value.slice(2, 4), 16) / 255;
    const blue = parseInt(value.slice(4, 6), 16) / 255;
    const max = Math.max(red, green, blue), min = Math.min(red, green, blue), light = (max + min) / 2;
    const delta = max - min;
    let hue = 0;
    if (delta) {
        if (max === red) hue = ((green - blue) / delta + (green < blue ? 6 : 0)) * 60;
        else if (max === green) hue = ((blue - red) / delta + 2) * 60;
        else hue = ((red - green) / delta + 4) * 60;
    }
    return { h: Math.round(hue), s: Math.round((delta ? delta / (1 - Math.abs(2 * light - 1)) : 0) * 100), l: Math.round(light * 100) };
}
function hslToHex(hue, saturation, lightness) {
    const s = saturation / 100, l = lightness / 100;
    const chroma = (1 - Math.abs(2 * l - 1)) * s;
    const segment = hue / 60, x = chroma * (1 - Math.abs(segment % 2 - 1));
    let rgb = [0, 0, 0];
    if (segment < 1) rgb = [chroma, x, 0]; else if (segment < 2) rgb = [x, chroma, 0]; else if (segment < 3) rgb = [0, chroma, x]; else if (segment < 4) rgb = [0, x, chroma]; else if (segment < 5) rgb = [x, 0, chroma]; else rgb = [chroma, 0, x];
    const match = l - chroma / 2;
    return `#${rgb.map((channel) => Math.round((channel + match) * 255).toString(16).padStart(2, "0")).join("")}`;
}
function paletteFromSliders() {
    const backgroundHue = Number(byId("backgroundHue").value);
    const paperHue = Number(byId("paperHue").value);
    const accentHue = Number(byId("accentHue").value);
    const brightness = Number(byId("brightnessSlider").value);
    return {
        background: hslToHex(backgroundHue, 42, clamp(brightness - 28, 16, 68)),
        paper: hslToHex(paperHue, 60, brightness),
        panel: hslToHex(paperHue, 54, clamp(brightness - 10, 16, 90)),
        edge: hslToHex(accentHue, 43, clamp(brightness - 42, 14, 58)),
        accent: hslToHex(accentHue, 68, clamp(brightness - 22, 20, 70)),
        ink: hslToHex(paperHue, 34, clamp(brightness - 72, 8, 34))
    };
}
function applyStyle(style) {
    const colors = style || {};
    const defaults = { background: "#b99ad2", paper: "#fffdf8", panel: "#f0e7f4", edge: "#724a91", accent: "#b95fd4", ink: "#321c48" };
    document.body.style.setProperty("--wall", colors.background || defaults.background);
    document.body.style.setProperty("--paper", colors.paper || defaults.paper);
    document.body.style.setProperty("--panel", colors.panel || defaults.panel);
    document.body.style.setProperty("--edge", colors.edge || defaults.edge);
    document.body.style.setProperty("--accent", colors.accent || defaults.accent);
    document.body.style.setProperty("--ink", colors.ink || defaults.ink);
    const page = byId("profile");
    const url = colors.wallpaperUrl || "";
    page.classList.toggle("has-wallpaper", Boolean(url));
    page.style.setProperty("--wallpaper-image", url ? `url(\"${url.replace(/[\\\"]/g, "\\\\$&")}\")` : "none");
}
function setSliderLabels() {
    [["backgroundHue", "backgroundHueValue"], ["paperHue", "paperHueValue"], ["accentHue", "accentHueValue"]].forEach(([input, output]) => { byId(output).textContent = `${byId(input).value}°`; });
    byId("brightnessValue").textContent = byId("brightnessSlider").value < 50 ? "dark" : "light";
}
function previewPalette() { setSliderLabels(); applyStyle({ ...paletteFromSliders(), wallpaperUrl: byId("wallpaperInput").value.trim() }); }
function render(nextProfile) {
    profile = nextProfile;
    setTheme(profile.theme);
    applyStyle(profile.style);
    const path = `8bitgpu.net/~${profile.username}`;
    byId("profileAddress").textContent = path;
    byId("profileUrl").textContent = path;
    byId("profileName").textContent = profile.username;
    byId("cardName").textContent = profile.username;
    byId("moodText").textContent = profile.mood || "Currently decorating this page.";
    byId("aboutText").textContent = profile.about || "This page is still being decorated.";
    byId("favoritesText").textContent = profile.favorites || "Add some favorite things to make this page yours.";
    renderAvatar(profile.avatar);
    byId("profile").hidden = false;
    byId("editButton").hidden = !isOwnProfile;
}
async function getJson(path, options) {
    const response = await fetch(path, { cache: "no-store", ...options });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "MyPixel could not load that page.");
    return data;
}
async function loadProfile() {
    const requested = new URLSearchParams(location.search).get("u");
    try {
        const me = await getJson("/api/auth/me");
        if (!requested && !me.user) { setStatus("Sign in through Account.exe to create your MyPixel page."); return; }
        isOwnProfile = Boolean(me.user && (!requested || requested.toLowerCase() === me.user.username.toLowerCase()));
        const data = isOwnProfile ? await getJson("/api/profile/me") : await getJson(`/api/profile/${encodeURIComponent(requested)}`);
        render(data.profile);
        setStatus("");
    } catch (error) { setStatus(error.message); }
}
function openEditor() {
    byId("moodInput").value = profile.mood;
    byId("aboutInput").value = profile.about;
    byId("favoritesInput").value = profile.favorites;
    const background = hexToHsl(profile.style?.background);
    const paper = hexToHsl(profile.style?.paper);
    const accent = hexToHsl(profile.style?.accent);
    byId("backgroundHue").value = background.h;
    byId("paperHue").value = paper.h;
    byId("accentHue").value = accent.h;
    byId("brightnessSlider").value = clamp(paper.l, 20, 96);
    byId("wallpaperInput").value = profile.style?.wallpaperUrl || "";
    previewPalette();
    byId("editor").hidden = false;
    byId("moodInput").focus();
}
function closeEditor() { byId("editor").hidden = true; }
function openLounge() { window.parent?.postMessage({ type: "8bitgpu-open-app", app: "arcade" }, location.origin); }

byId("editButton").addEventListener("click", openEditor);
byId("closeEditor").addEventListener("click", closeEditor);
byId("visitLounge").addEventListener("click", openLounge);
byId("openLounge").addEventListener("click", openLounge);
byId("backButton").addEventListener("click", () => history.back());
byId("forwardButton").addEventListener("click", () => history.forward());
["backgroundHue", "paperHue", "accentHue", "brightnessSlider", "wallpaperInput"].forEach((id) => byId(id).addEventListener("input", previewPalette));
byId("profileForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = byId("saveProfile");
    button.disabled = true;
    try {
        const data = await getJson("/api/profile/me", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ mood: byId("moodInput").value, about: byId("aboutInput").value, favorites: byId("favoritesInput").value, theme: "violet", style: { ...paletteFromSliders(), wallpaperUrl: byId("wallpaperInput").value.trim() } }) });
        render(data.profile);
        closeEditor();
        setStatus("Your MyPixel page is saved.");
    } catch (error) { setStatus(error.message); }
    finally { button.disabled = false; }
});

loadProfile();
