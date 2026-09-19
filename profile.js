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
function setTheme(theme) { document.body.dataset.theme = theme; }
function render(nextProfile) {
    profile = nextProfile;
    setTheme(profile.theme);
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
    if (!response.ok) throw new Error(data.error || "8Bit Web could not load that page.");
    return data;
}
async function loadProfile() {
    const requested = new URLSearchParams(location.search).get("u");
    try {
        const me = await getJson("/api/auth/me");
        if (!requested && !me.user) { setStatus("Sign in through Account.exe to create your 8Bit Web page."); return; }
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
    byId("profileForm").elements.theme.value = profile.theme;
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
byId("profileForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = byId("saveProfile");
    button.disabled = true;
    try {
        const data = await getJson("/api/profile/me", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ mood: byId("moodInput").value, about: byId("aboutInput").value, favorites: byId("favoritesInput").value, theme: byId("profileForm").elements.theme.value }) });
        render(data.profile);
        closeEditor();
        setStatus("Your 8Bit Web page is saved.");
    } catch (error) { setStatus(error.message); }
    finally { button.disabled = false; }
});

loadProfile();
