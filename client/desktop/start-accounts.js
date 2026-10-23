// Start menu footer: Log In for guests, Switch Account and Log Out once someone is signed in
(() => {
  const byId = (id) => document.getElementById(id);
  const login = byId("startLogin");
  const session = byId("startSession");
  const switchButton = byId("startSwitch");
  const logoutButton = byId("startLogout");
  const menu = byId("startAccounts");
  if (!login || !session) return;

  function renderMenu(data) {
    menu.replaceChildren();
    for (const account of data.accounts) {
      const item = document.createElement("button");
      item.type = "button";
      item.textContent = account.username;
      item.setAttribute("role", "menuitem");
      if (account.id === data.active) {
        item.disabled = true;
        item.textContent += " (you)";
      } else {
        item.addEventListener("click", async () => {
          item.disabled = true;
          try {
            await Accounts.switchTo(account.id);
            location.reload();
          } catch (error) {
            item.textContent = error.message;
          }
        });
      }
      menu.append(item);
    }
    const add = document.createElement("button");
    add.type = "button";
    add.textContent = "+ Add another account";
    add.setAttribute("role", "menuitem");
    add.addEventListener("click", () => {
      closeMenu();
      openApp("login");
    });
    menu.append(add);
  }

  function closeMenu() {
    menu.hidden = true;
    switchButton.setAttribute("aria-expanded", "false");
  }

  switchButton.addEventListener("click", async () => {
    if (!menu.hidden) return closeMenu();
    try {
      renderMenu(await Accounts.list());
    } catch {
      return;
    }
    menu.hidden = false;
    switchButton.setAttribute("aria-expanded", "true");
  });
  document.addEventListener("pointerdown", (event) => {
    if (!menu.hidden && !session.contains(event.target)) closeMenu();
  });

  logoutButton.addEventListener("click", async () => {
    logoutButton.disabled = true;
    try {
      await Accounts.logout();
      location.reload();
    } catch {
      logoutButton.disabled = false;
    }
  });

  Accounts.list()
    .then((data) => {
      const signedIn = Boolean(data.active);
      login.hidden = signedIn;
      session.hidden = !signedIn;
    })
    .catch(() => {});
})();
