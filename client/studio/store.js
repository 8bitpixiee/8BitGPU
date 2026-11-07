// Account-saved pixel art. Everything resolves with parsed JSON and rejects with Error(server message).
//   StudioStore.list()                       -> [{ id, name, w, h, thumb, shared, createdAt, updatedAt }]
//   StudioStore.load(id)                     -> { ...summary, data, mine }
//   StudioStore.save({ id?, name, w, h, data, thumb }) -> { id, updatedAt }   (id given = update)
//   StudioStore.remove(id)                   -> true
//   StudioStore.setShared(id, bool)          -> bool
//   StudioStore.gallery(username)            -> [shared summaries]
(() => {
  async function call(method, path, body) {
    let res;
    try {
      res = await fetch(`/api/studio/${path}`, {
        method,
        credentials: "same-origin",
        headers: body === undefined ? {} : { "content-type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new Error("Could not reach the server.");
    }
    let payload = null;
    try {
      payload = await res.json();
    } catch {
      // a non-json body (gateway error page) falls through to the generic message
    }
    if (!res.ok) throw new Error(payload?.error || `Something went wrong (${res.status}).`);
    return payload;
  }

  window.StudioStore = {
    list: async () => (await call("GET", "art")).art,
    load: (id) => call("GET", `art/${encodeURIComponent(id)}`),
    save: ({ id, name, w, h, data, thumb }) => call("POST", "art", { id, name, w, h, data, thumb }),
    remove: async (id) => (await call("DELETE", `art/${encodeURIComponent(id)}`), true),
    setShared: async (id, shared) => (await call("POST", `art/${encodeURIComponent(id)}/share`, { shared: !!shared })).shared,
    gallery: async (username) => (await call("GET", `gallery/${encodeURIComponent(username)}`)).art,
  };
})();
