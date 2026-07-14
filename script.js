function toggleMenu() {
    const menu = document.getElementById("avatarMenu");

    menu.style.display =
        menu.style.display === "flex"
            ? "none"
            : "flex";
}

function setHair(choice) {
    const hairLayer = document.getElementById("hairLayer");

    if (choice === "none") {
        hairLayer.style.display = "none";
    } else {
        hairLayer.style.display = "block";
        hairLayer.src = choice;
    }
}

function loadSavedOutfit() {
    const savedOutfit = JSON.parse(localStorage.getItem("8bitgpu-avatar-outfit"));

    if (!savedOutfit) {
        return;
    }

    const hairLayer = document.getElementById("hairLayer");
    const bottomLayer = document.getElementById("drawlsLayer");

    if (savedOutfit.hair === 0) {
        hairLayer.style.display = "none";
    }

    if (savedOutfit.bottom === 0) {
        bottomLayer.style.display = "none";
    }
}

document.addEventListener("click", function(event) {
    const menu = document.getElementById("avatarMenu");
    const companion = document.getElementById("companion");

    if (
        !menu.contains(event.target) &&
        !companion.contains(event.target)
    ) {
        menu.style.display = "none";
    }
});

loadSavedOutfit();
