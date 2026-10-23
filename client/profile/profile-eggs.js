// the geocities bits of MyPixel: a visitor counter that is mostly for show
(() => {
  const counter = document.getElementById("hitCounter");
  const digits = document.getElementById("hitDigits");
  if (!counter || !digits) return;

  // not a real count. it starts from the page's name and goes up one per visit from this browser
  function visitorNumber(name) {
    let seed = 0;
    for (const letter of name.toLowerCase()) seed = (seed * 31 + letter.charCodeAt(0)) % 9000;
    let visits = 0;
    try {
      const key = `8bitgpu-hits:${name.toLowerCase()}`;
      visits = Number(localStorage.getItem(key)) + 1;
      localStorage.setItem(key, String(visits));
    } catch {
      visits = 1;
    }
    return 1000 + seed + visits;
  }

  const name = () => document.getElementById("profileName").textContent.trim();
  let counted = false;
  new MutationObserver(() => {
    const current = name();
    if (counted || !current || current === "Loading...") return;
    counted = true;
    digits.textContent = String(visitorNumber(current)).padStart(6, "0");
  }).observe(document.getElementById("profileName"), { childList: true, characterData: true, subtree: true });
})();
