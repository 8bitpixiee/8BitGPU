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
