// inside the desktop the other legal page opens as its own window, and the home link has nowhere to go
if (window.parent !== window) {
  const nav = document.querySelector(".legal-nav");
  nav.querySelector('a[href="index.html"]').remove();
  const other = nav.querySelector("a");
  other.addEventListener("click", (event) => {
    event.preventDefault();
    window.parent.postMessage(
      { type: "8bitgpu-open-app", app: other.getAttribute("href").replace(".html", "") === "terms" ? "terms" : "privacy" },
      location.origin,
    );
  });
}
