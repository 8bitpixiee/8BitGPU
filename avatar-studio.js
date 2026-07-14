const options = {
    hair: [
        { name: "Bald", src: "" },
        { name: "Bombshell", src: "volume_hair_fem_idle_front_v1.png" }
    ],
    bottom: [
        { name: "None", src: "" },
        { name: "Drawls", src: "drawls_fem_idle_front_v1.png" }
    ]
};

const selection = { hair: 1, bottom: 1 };
const savedOutfit = JSON.parse(localStorage.getItem("8bitgpu-avatar-outfit"));

if (savedOutfit) {
    Object.keys(selection).forEach((category) => {
        if (Number.isInteger(savedOutfit[category]) && options[category][savedOutfit[category]]) {
            selection[category] = savedOutfit[category];
        }
    });
}

function renderCategory(category) {
    const item = options[category][selection[category]];
    const layer = document.getElementById(`${category}Layer`);
    document.getElementById(`${category}Name`).textContent = item.name;
    layer.src = item.src;
    layer.hidden = !item.src;
}

function renderAvatar() {
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

document.getElementById("randomizeButton").addEventListener("click", () => {
    Object.keys(options).forEach((category) => {
        selection[category] = Math.floor(Math.random() * options[category].length);
    });
    renderAvatar();
    document.getElementById("saveStatus").textContent = "New look generated!";
});

document.getElementById("saveButton").addEventListener("click", () => {
    localStorage.setItem("8bitgpu-avatar-outfit", JSON.stringify(selection));
    document.getElementById("saveStatus").textContent = "Outfit saved to this browser!";
});

renderAvatar();
