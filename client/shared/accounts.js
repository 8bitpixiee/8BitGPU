(function (root, factory) {
  const api = factory(root);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Accounts = api;
})(typeof self !== "undefined" ? self : this, function (root) {
  // things the browser keeps about whoever is signed in, so the next account never inherits them
  const PLAYER_KEYS = [
    "8bitgpu-player-name",
    "8bitgpu-account-active",
    "8bitgpu-avatar-outfit",
    "8bitgpu-user-avatar",
    "8bitgpu-lounge-activities",
  ];

  function forgetPlayer(storage) {
    for (const key of PLAYER_KEYS) storage.removeItem(key);
  }

  // after a switch the page reloads and restoreOnlinePlayer fills the rest back in from the server
  function rememberPlayer(storage, user) {
    forgetPlayer(storage);
    storage.setItem("8bitgpu-player-name", user.username);
    storage.setItem("8bitgpu-account-active", "true");
    storage.removeItem("8bitgpu-guest-session");
    if (user.avatar) storage.setItem("8bitgpu-avatar-outfit", JSON.stringify(user.avatar));
  }

  const api = { PLAYER_KEYS, forgetPlayer, rememberPlayer };
  if (!root.document) return api;

  async function ask(path, body) {
    const response = await root.fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: body === undefined ? {} : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "The account terminal blinked out.");
    return data;
  }

  api.list = () => ask("/api/auth/accounts");
  api.switchTo = async (id) => {
    const data = await ask("/api/auth/switch", { id });
    rememberPlayer(root.localStorage, data.user);
    return data.user;
  };
  api.logout = async () => {
    await ask("/api/auth/logout", {});
    forgetPlayer(root.localStorage);
  };
  return api;
});
