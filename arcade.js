const avatarPath = "avatar/";
const options = {
    hair: ["", "volume_hair_fem_idle_front_v1.png", `${avatarPath}hair_fem_v1.png`, `${avatarPath}hair_fem_deerbra_v1.png`, `${avatarPath}hair_fem_deerbra_v2.png`, `${avatarPath}hair_fem_deerbra_v3.png`, `${avatarPath}hair_fem_deerbra_v4.png`, `${avatarPath}hair_lemon_v1.png`, `${avatarPath}hair_lemon_v2.png`, `${avatarPath}hair_lemon_v3.png`, `${avatarPath}hair_locs_v1.png`, `${avatarPath}hair_locs_v2.png`, `${avatarPath}hair_locs_v3.png`, `${avatarPath}hair_longwaves_v1.png`, `${avatarPath}hair_longwaves_v2.png`, `${avatarPath}hair_longwaves_v3.png`, `${avatarPath}sideswept_hair_v1.png`, `${avatarPath}sideswept_hair_v2.png`, `${avatarPath}sideswept_hair_v3.png`],
    ears: [`${avatarPath}ears_fem_v1.png`, `${avatarPath}ears_fem_v2.png`, `${avatarPath}ears_fem_v3.png`, `${avatarPath}kittie_ears_v1.png`, `${avatarPath}kittie_ears_v2.png`, `${avatarPath}kittie_ears_v3.png`, `${avatarPath}ears_fem_deerbra_v1.png`, `${avatarPath}ears_fem_deerbra_v3.png`, `${avatarPath}ears_fem_bovidil_v1.png`, `${avatarPath}ears_fem_bovidil_v2.png`, `${avatarPath}ears_fem_bovidil_v3.png`],
    eyes: ["", `${avatarPath}eyes_fem_v1.png`, `${avatarPath}eyes_fem_v2.png`, `${avatarPath}eyes_mac_v1.png`, `${avatarPath}eyes_mac_v2.png`, `${avatarPath}eyes_mac_v3.png`, `${avatarPath}eyes_lemon.png`],
    fit: ["", `${avatarPath}fit_fem_v1.png`, `${avatarPath}fit_fem_v2.png`, `${avatarPath}fit_fem_v3.png`, `${avatarPath}fit_kittie_v1.png`, `${avatarPath}fit_kittie_v2.png`, `${avatarPath}fit_kittie_v3.png`, `${avatarPath}drawls_fem_idle_front_v1.png`, `${avatarPath}drawls_fem_idle_front_v2.png`, `${avatarPath}drawls_fem_idle_front_v3.png`],
    thixieFit: ["", `${avatarPath}thixie_fit_v1.png`, `${avatarPath}thixie_fit_v2.png`, `${avatarPath}thixie_fit_v3.png`],
    extra: ["", `${avatarPath}wings_v1.png`, `${avatarPath}wings_v2.png`, `${avatarPath}wings_v3.png`, `${avatarPath}kittie_tail_v1.png`, `${avatarPath}kittie_tail_v2.png`, `${avatarPath}kittie_tail_v3.png`]
};

function setLayer(id, src) { const layer = document.getElementById(id); layer.src = src || ""; layer.style.display = src ? "block" : "none"; }
function loadBeing() {
    let outfit; try { outfit = JSON.parse(localStorage.getItem("8bitgpu-avatar-outfit")); } catch { outfit = null; }
    outfit ||= { species: "Pixies", skinTone: "Nutmeg", ears: 0, hair: 1, eyes: 1, fit: 0, extra: 0 };
    const thixie = outfit.bodyPreset === "thixie" || outfit.species === "Thixies";
    const deerbra = outfit.species === "Deerbras";
    if (thixie) { const body = { Nutmeg:"v1", Creme:"v2", Peachy:"v4" }[outfit.skinTone] || "v1"; const head = { Nutmeg:"v1", Creme:"v2", Peachy:"v3" }[outfit.skinTone] || "v1"; setLayer("bodyLayer", `${avatarPath}thixie_body_${body}.png`); setLayer("headLayer", `${avatarPath}thixie_head_${head}.png`); }
    else if (deerbra) { const v = outfit.skinTone === "Creme" ? "v2" : "v1"; setLayer("bodyLayer", `${avatarPath}body_fem_deerbra_${v}.png`); setLayer("headLayer", `${avatarPath}head_fem_deerbra_${v}.png`); }
    else { const v = { Nutmeg:"v1", Peachy:"v2", Creme:"v3" }[outfit.skinTone] || "v1"; setLayer("bodyLayer", `${avatarPath}body_fem_${v}.png`); setLayer("headLayer", `${avatarPath}head_fem_${v}.png`); }
    setLayer("earsLayer", options.ears[outfit.ears] || options.ears[0]); setLayer("hairLayer", options.hair[outfit.hair] || ""); setLayer("eyesLayer", options.eyes[outfit.eyes] || ""); setLayer("fitLayer", (thixie ? options.thixieFit : options.fit)[outfit.fit] || ""); setLayer("extraLayer", options.extra[outfit.extra] || "");
}

function state() { try { return JSON.parse(localStorage.getItem("8bitgpu-game-state")) || { xp:120, mana:80, inventory:[] }; } catch { return { xp:120, mana:80, inventory:[] }; } }
function saveState(next) { localStorage.setItem("8bitgpu-game-state", JSON.stringify(next)); parent.postMessage({ type:"8bitgpu-game-updated" }, location.origin); updateStats(); }
function updateStats() { const s = state(); const level = Math.floor(s.xp / 300) + 1; document.getElementById("arcadeStats").textContent = `LVL ${String(level).padStart(2,"0")} · XP ${s.xp % 300} / 300 · MANA ${s.mana} / 100`; }
function reward(button) { const s = state(); const item = button.dataset.reward; const xp = Number(button.dataset.xp); const mana = Number(button.dataset.mana); s.xp += xp; s.mana = Math.min(100, s.mana + mana); if (!s.inventory.includes(item)) s.inventory.push(item); saveState(s); const toast = document.getElementById("rewardToast"); toast.textContent = `+${xp} XP${mana ? ` · +${mana} MANA` : ""} · ${item}`; toast.classList.add("show"); setTimeout(() => toast.classList.remove("show"), 2600); }

const player = document.getElementById("gamePlayer"); let x = 48, y = 75;
function move(dx, dy) { x = Math.max(10, Math.min(89, x + dx)); y = Math.max(38, Math.min(86, y + dy)); player.style.left = `${x}%`; player.style.top = `${y}%`; }
document.addEventListener("keydown", (event) => { const key = event.key.toLowerCase(); const moves = { arrowleft:[-2,0], a:[-2,0], arrowright:[2,0], d:[2,0], arrowup:[0,-2], w:[0,-2], arrowdown:[0,2], s:[0,2] }; if (moves[key]) { event.preventDefault(); move(...moves[key]); } });
document.querySelectorAll(".hotspot").forEach((button) => button.addEventListener("click", () => reward(button)));
document.getElementById("focusButton").addEventListener("click", () => document.getElementById("arcadeGame").focus());
loadBeing(); updateStats(); document.getElementById("arcadeGame").focus();
