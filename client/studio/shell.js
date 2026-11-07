// The drawing studio shell: a big window (or a plain page) around the pixel editor.
// It owns the File menu, the saved-art list and the collab dialog. The editor, store and collab
// pieces come from other files, so everything here is optional-chained and degrades to a message.
(() => {
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (text, onClick, className) => {
    const node = el("button", className, text);
    node.type = "button";
    node.addEventListener("click", onClick);
    return node;
  };
  const SIZES = [[16, 16], [32, 32], [64, 64], [128, 128], [64, 32], [160, 90]];
  const MAX_SIDE = 512;
  const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ"; // no I or O, they read as 1 and 0
  const newCode = () => Array.from({ length: 4 }, () => CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)]).join("");

  // host: any element. opts: { solo, view, me }
  function createShell(host, opts = {}) {
    host.classList.add("st-shell");
    const store = () => window.StudioStore;
    let editor = null;
    let current = { id: null, name: "Untitled", w: 0, h: 0 };
    let dirty = false;
    let collab = null;
    let dialog = null;

    const status = el("div", "st-status");
    status.setAttribute("role", "status");
    const editorHost = el("div", "st-editor");
    const peerBar = el("div", "st-peers");
    peerBar.hidden = true;
    host.append(peerBar, editorHost, status);
    const say = (text) => { status.textContent = text; };
    const refreshStatus = () => {
      const size = current.w ? ` · ${current.w}×${current.h}` : "";
      say(`${current.name}${dirty ? " *" : ""}${size}${collab ? " · room " + collab.code : ""}`);
    };

    // ------------------------------------------------------------ dialogs
    function closeDialog() {
      dialog?.remove();
      dialog = null;
    }
    function openDialog(heading, content, buttons = [], wide = false) {
      closeDialog();
      dialog = el("div", "st-dialog-back");
      const box = el("div", "st-dialog" + (wide ? " wide" : ""));
      box.setAttribute("role", "dialog");
      box.setAttribute("aria-label", heading);
      const actions = el("div", "st-actions");
      for (const [text, fn, cls] of buttons) actions.append(button(text, fn, cls));
      actions.append(button("Close", closeDialog));
      box.append(el("h2", "", heading), content, actions);
      dialog.append(box);
      dialog.addEventListener("pointerdown", (event) => { if (event.target === dialog) closeDialog(); });
      host.append(dialog);
      box.querySelector("input")?.focus();
    }
    function message(heading, text) {
      openDialog(heading, el("p", "st-note", text));
    }
    // asks before throwing away unsaved work
    function confirmDiscard(then) {
      if (!dirty) return then();
      const body = el("p", "st-note", "This drawing has unsaved changes. Continue and lose them?");
      openDialog("Unsaved changes", body, [["Discard changes", () => { closeDialog(); then(); }, "danger"]]);
    }

    // ------------------------------------------------------------ the editor
    function mountEditor({ doc, size } = {}) {
      collabOff();
      editor?.destroy?.();
      editorHost.replaceChildren();
      editor = null;
      if (!window.PixelStudio?.mount) {
        editorHost.append(el("p", "st-note", "The pixel editor is not loaded on this page."));
        return;
      }
      editor = window.PixelStudio.mount(editorHost, {
        doc,
        // a blank canvas needs a size; the editor reads size (or w/h) when there is no doc
        size,
        w: size?.w,
        h: size?.h,
        menus: buildMenus(),
        onChange: () => { dirty = true; refreshStatus(); },
        onOp: (op) => collab?.handle?.sendOp?.(op),
      });
      const info = editor?.getDoc?.();
      if (info) { current.w = info.w; current.h = info.h; }
      dirty = false;
      refreshStatus();
    }

    function buildMenus() {
      // disabled is a getter so it is right whenever the editor draws the menu
      const item = (label, onClick, off) => {
        const entry = { label, onClick };
        if (off) Object.defineProperty(entry, "disabled", { get: off, enumerable: true });
        return entry;
      };
      return [
        {
          label: "File",
          items: [
            item("New…", () => confirmDiscard(newDialog)),
            item("Open…", () => confirmDiscard(openList), () => !store()),
            item("Save", () => save(false), () => !store()),
            item("Save as…", () => save(true), () => !store()),
            item("Delete", removeCurrent, () => !store() || !current.id),
            item("Export PNG", exportPng),
          ],
        },
        {
          label: "Collaborate",
          items: [
            item("Start or join a room…", collabDialog, () => !window.StudioCollab),
            item("Leave room", collabOff, () => !collab),
          ],
        },
      ];
    }

    // ------------------------------------------------------------ File menu
    function newDialog() {
      const body = el("div");
      const grid = el("div", "st-sizes");
      const wInput = el("input");
      const hInput = el("input");
      for (const input of [wInput, hInput]) { input.type = "number"; input.min = 1; input.max = MAX_SIDE; input.value = 32; }
      for (const [sw, sh] of SIZES) {
        grid.append(button(`${sw}×${sh}`, () => { wInput.value = sw; hInput.value = sh; }));
      }
      const custom = el("label", "st-custom", "Custom ");
      custom.append(wInput, document.createTextNode(" × "), hInput);
      body.append(grid, custom);
      openDialog("New drawing", body, [["Create", () => {
        const w = Math.round(Number(wInput.value));
        const h = Math.round(Number(hInput.value));
        if (!(w >= 1 && h >= 1 && w <= MAX_SIDE && h <= MAX_SIDE)) return say(`Pick a size from 1 to ${MAX_SIDE}.`);
        closeDialog();
        current = { id: null, name: "Untitled", w, h };
        mountEditor({ size: { w, h } });
      }, "primary"]]);
    }

    function openFile(id) {
      store().load(id).then((file) => {
        closeDialog();
        current = { id: file.id, name: file.name, w: file.w, h: file.h };
        mountEditor({ doc: file.data });
      }).catch((err) => message("Could not open it", err.message));
    }

    // the saved-art browser, also what the gallery wall shows
    function openList() {
      if (!store()) return message("Saved art", "Saving is not available here.");
      const body = el("div", "st-list");
      body.append(el("p", "st-note", "Loading…"));
      openDialog("My saved art", body, [], true);
      store().list().then((rows) => {
        body.replaceChildren();
        if (!rows.length) return body.append(el("p", "st-note", "Nothing saved yet. Draw something and use File, then Save."));
        for (const row of rows) {
          const card = el("div", "st-card");
          const open = button("", () => confirmDiscard(() => openFile(row.id)), "st-open");
          const img = el("img");
          img.alt = "";
          if (row.thumb) img.src = row.thumb;
          open.append(img, el("strong", "", row.name || "Untitled"), el("small", "", `${row.w}×${row.h}`));
          card.append(open, button("Delete", () => removeId(row.id, row.name, openList), "st-del"));
          body.append(card);
        }
      }).catch((err) => { body.replaceChildren(el("p", "st-note", err.message)); });
    }

    function save(asNew) {
      if (!editor) return;
      const write = (name) => {
        const info = editor.getDoc?.() || {};
        const row = {
          id: asNew ? undefined : current.id || undefined,
          name,
          w: info.w,
          h: info.h,
          data: editor.serialize(),
          thumb: editor.thumbnail?.(96),
        };
        say("Saving…");
        store().save(row).then(({ id }) => {
          current = { id, name, w: info.w, h: info.h };
          dirty = false;
          closeDialog();
          refreshStatus();
        }).catch((err) => message("Could not save", err.message));
      };
      if (!asNew && current.id) return write(current.name);
      const input = el("input");
      input.type = "text";
      input.maxLength = 60;
      input.value = current.name === "Untitled" ? "" : current.name;
      input.placeholder = "Name your drawing";
      const go = () => write(input.value.trim() || "Untitled");
      input.addEventListener("keydown", (event) => { if (event.key === "Enter") go(); });
      openDialog("Save drawing", input, [["Save", go, "primary"]]);
    }

    function removeId(id, name, after) {
      const body = el("p", "st-note", `Delete "${name || "Untitled"}" for good?`);
      openDialog("Delete drawing", body, [["Delete", () => {
        store().remove(id).then(() => {
          if (current.id === id) { current.id = null; dirty = true; }
          closeDialog();
          refreshStatus();
          after?.();
        }).catch((err) => message("Could not delete", err.message));
      }, "danger"]]);
    }
    function removeCurrent() {
      if (current.id) removeId(current.id, current.name);
    }

    function exportPng() {
      if (!editor) return;
      const link = el("a");
      link.href = editor.exportPNG(0);
      link.download = (current.name || "drawing").replace(/[^\w -]+/g, "") + ".png";
      link.click();
    }

    // ------------------------------------------------------------ collaboration
    function collabOff() {
      if (!collab) return;
      collab.handle?.detach?.();
      collab = null;
      peerBar.hidden = true;
      refreshStatus();
    }
    function collabOn(code) {
      code = code.trim().toUpperCase();
      if (!/^[A-Z0-9]{3,8}$/.test(code)) return say("Room codes are 3 to 8 letters or numbers.");
      if (!editor || !window.StudioCollab) return;
      collabOff();
      closeDialog();
      const handle = window.StudioCollab.attach(editor, code, {
        me: opts.me,
        onStatus: (text) => say(text),
        onPeers: (list) => {
          const names = (list || []).map((p) => p.username || p.name || String(p));
          peerBar.hidden = !names.length;
          peerBar.textContent = names.length ? "Drawing with: " + names.join(", ") : "";
        },
      });
      collab = { code, handle };
      refreshStatus();
    }
    function collabDialog() {
      const body = el("div");
      const input = el("input", "st-code");
      input.type = "text";
      input.maxLength = 8;
      input.value = collab?.code || newCode();
      input.setAttribute("aria-label", "Room code");
      input.addEventListener("keydown", (event) => { if (event.key === "Enter") collabOn(input.value); });
      body.append(el("p", "st-note", "Make a room and share its code, or type a friend's code to join theirs."), input);
      openDialog("Collaborate", body, [
        ["New code", () => { input.value = newCode(); }],
        ["Join", () => collabOn(input.value), "primary"],
      ]);
    }

    // ------------------------------------------------------------ go
    mountEditor();
    if (opts.view === "gallery") openList();

    return {
      showGallery: openList,
      isDirty: () => dirty,
      destroy() {
        collabOff();
        editor?.destroy?.();
        host.replaceChildren();
      },
    };
  }

  // the lounge window, one shared instance
  let win = null;
  let shell = null;
  function open(options = {}) {
    if (win && !win.hidden) {
      if (options.view === "gallery") shell?.showGallery();
      return;
    }
    if (!win) {
      win = el("section", "st-window");
      win.setAttribute("role", "dialog");
      win.setAttribute("aria-label", "Drawing studio");
      const bar = el("header", "st-bar");
      const x = button("×", close, "st-close");
      x.setAttribute("aria-label", "Close studio");
      bar.append(el("strong", "", "Studio.exe"), x);
      win.append(bar, el("div", "st-body"));
      document.body.append(win);
    }
    win.hidden = false;
    shell = createShell(win.querySelector(".st-body"), { view: options.view, me: window.loungeApi?.me?.() });
  }
  function close() {
    if (!win || win.hidden) return;
    if (shell?.isDirty() && !confirm("Close the studio and lose unsaved changes?")) return;
    shell?.destroy();
    shell = null;
    win.hidden = true;
  }

  window.StudioShell = { open, close, create: createShell };
})();
