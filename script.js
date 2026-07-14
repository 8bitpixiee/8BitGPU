function toggleMenu() {
    alert("CLICK WORKS");

    const menu = document.getElementById("avatarMenu");

    alert(menu);

    if (menu.style.display === "none") {
        menu.style.display = "flex";
    } else {
        menu.style.display = "none";
    }
}
