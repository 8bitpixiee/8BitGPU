function setHair(choice) {
  const hairLayer = document.getElementById("hairLayer");

if (choice === "none") {
  hairLayer.style.display = "none";
} else {
  hairLayer.style.display = "block";
  hairLayer.src = choice;
  }
}
function toggleMenu() {
  const menu = document.getElementById("avatarMenu").style.display ="none";
  if (menu.style.display === "flex") {
    menu.style.display = "none";
  } else {
    menu.style.display = "flex";
  }
}
