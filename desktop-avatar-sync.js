/* Load the new Avatar Lab save format on the main 8BitGPU desktop. */
(function () {
  const avatarPath = "avatar/";
  const setLayer = (id, source) => {
    const layer = document.getElementById(id);
    if (!layer) return;
    layer.onerror = () => { layer.style.display = "none"; };
    layer.src = source || "";
    layer.style.display = source ? "block" : "none";
  };
  const variant = (tone, map, fallback) => map[tone] || fallback;
  function renderNewOutfit() {
    let saved;
    try { saved = JSON.parse(localStorage.getItem("8bitgpu-avatar-outfit")); } catch { return; }
    if (!saved || saved.version !== 2) return;
    const companion = document.getElementById("companion");
    const emptyState = document.getElementById("beingEmptyState");
    if (companion) companion.style.display = "block";
    if (emptyState) emptyState.hidden = true;

    const species = saved.species;
    const tone = saved.skinTone;
    let body = "body_fem_v1.png";
    let head = "head_fem_v1.png";
    if (species === "Pixie" && saved.build === "Masc") {
      const v = variant(tone, { Chocolate: "v1", Tanned: "v2", Creamer: "v3" }, "v1");
      body = `body_masc_${v}.png`; head = `head_masc_${v}.png`;
    } else if (species === "Pixie" && saved.build === "Chunky Masc") {
      const v = variant(tone, { Chocolate: "v1", Tanned: "v2", Creamer: "v3" }, "v1");
      body = `body_chunky_masc_${v}.png`; head = `head_chunky_masc_${v}.png`;
    } else if (species === "Pixie") {
      const v = variant(tone, { Nutmeg: "v1", Peachy: "v2", Creme: "v3" }, "v1");
      body = `body_fem_${v}.png`; head = `head_fem_${v}.png`;
    } else if (species === "Deerbra") {
      const v = variant(tone, { Wood: "v1", Copper: "v2", Pedal: "v3" }, "v1");
      body = `body_fem_deerbra_${v}.png`; head = `head_fem_deerbra_${v}.png`;
    } else if (species === "Bovadill") {
      const toneNumber = variant(tone, { Cocoa: "1", Peachy: "2", Milky: "3" }, "1");
      const breedNumber = variant(saved.build, { Highland: "1", Holstein: "2", Dexter: "3" }, "1");
      body = `bovidil_body_fem_v${toneNumber}.${breedNumber}.png`;
      head = `bovidil_head_fem_v${toneNumber}.png`;
    } else if (species === "Thixie") {
      const v = variant(tone, { Nutmeg: "v1", Creme: "v2", Peachy: "v3" }, "v1");
      body = `thixie_body_${v}.png`; head = `thixie_head_${v}.png`;
    }
    setLayer("bodyLayer", avatarPath + body);
    setLayer("headLayer", avatarPath + head);
    const layers = saved.layers || {};
    setLayer("earsLayer", layers.ears);
    setLayer("hairLayer", layers.hair);
    setLayer("eyesLayer", layers.eyes);
    setLayer("fitLayer", layers.fit);
    setLayer("extraLayer", layers.extra);
  }
  window.addEventListener("storage", (event) => {
    if (event.key === "8bitgpu-avatar-outfit") renderNewOutfit();
  });
  window.addEventListener("message", (event) => {
    if (event.origin === window.location.origin && event.data?.type === "8bitgpu-avatar-saved") renderNewOutfit();
  });
  renderNewOutfit();
  window.refreshDesktopAvatar = renderNewOutfit;
}());
