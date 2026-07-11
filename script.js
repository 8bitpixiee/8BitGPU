function setHair(choice) {
  const hairLayer = document.getElemtById(hairLayer");

if (choice === "none") {
  hairLayer.style.display = "none";
} else {
  hairLayer.style.display = "block";
  hairLayer.src = choice;
}
}
function toggleMenu() {
  const menu = document.getElementById("avatarMenu");
  if (menu.style.display === "flex") {
    menu.style.display = "none";
  } else {
    menu.style.display = "flex";
  }
}
