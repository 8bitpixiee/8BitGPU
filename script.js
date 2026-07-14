function toggleMenu() {
    const menu = document.getElementById("avatarMenu");

    if (menu.style.display === "none" || menu.style.display === "") {
        menu.style.display = "flex";
    } else
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
