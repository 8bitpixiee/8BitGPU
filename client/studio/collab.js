// Realtime collaboration for the pixel studio, on top of GameNet's "studio" relay room (max 8 people).
//
//   const session = StudioCollab.create("ABCD", { me, onStatus(text), onPeers(list) });
//   mount the editor with   onOp: session.sendOp   then   session.bind(editor)
// or, for an editor that is already mounted and exposes assignable hooks:
//   const session = StudioCollab.attach(editor, "ABCD", opts)    (sets editor.onOp / editor.onCursor for you)
//
//   session: { sendOp(op), sendCursor({x,y,color,tool}), bind(editor), detach(), peers(), isHost(), synced() }
//
// Editor surface used: serialize(), load(str), applyOp(op), optional setPeerCursor(id, {x,y,name,color,tool} | null).
//
// Wire format (all inside GameNet messages):
//   {k:'sync-req'}                       joiner -> host
//   {k:'sync', doc, seen}                host -> that joiner only. seen = last op number applied per sender
//   {k:'op', op, n} / {k:'op', ops, n}   broadcast. n is the sender's number for the LAST op in the message
//   {k:'cur', x, y, color, tool}         presence, ~15Hz
// The host is whoever GameNet says (oldest in the room). Numbers let a joiner drop live ops that were
// already baked into the snapshot it got, so nothing is applied twice.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.StudioCollab = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const OP_MS = 50; // at most 20 op messages a second
  const CURSOR_MS = 66; // ~15Hz
  const MAX_MSG = 40000; // relay drops frames over 64KB, stay well under
  const MAX_BUFFER = 2000;
  const SYNC_RETRY_MS = 4000;
  const MAX_RETRIES = 6;

  const colorFor = (id) => {
    let h = 0;
    for (const ch of String(id)) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return `hsl(${h} 80% 60%)`;
  };

  function create(code, opts = {}) {
    const clock = opts.clock || { setTimeout: (f, ms) => setTimeout(f, ms), clearTimeout: (t) => clearTimeout(t), now: () => Date.now() };
    const connect = opts.connect || ((game, room, handlers) => root.GameNet.connect(game, room, handlers));
    const status = (text) => opts.onStatus?.(text);

    let net = null;
    let editor = null;
    let closed = false;
    let isSynced = false;
    let retries = 0;
    let retryTimer = null;
    let syncTimer = null;
    // my op counter. Starts from the clock so a reloaded page never reuses numbers peers already saw
    let sentN = clock.now() * 1000;
    let queue = []; // my ops waiting for the next flush
    let opTimer = null;
    let cursor = null;
    let cursorTimer = null;
    let lastCursor = -Infinity;
    const seen = {}; // sender id -> highest op number applied here
    const waiting = []; // ops that arrived before our snapshot did
    const early = []; // anything that arrived before an editor was bound
    const peerIds = new Set(); // peers we drew a cursor for, cleared when they or we drop

    // GameNet only has an id once the server's hello arrived
    const ready = () => !!net && net.id != null;
    const nameOf = (id) => net?.players().find((p) => p.id === id)?.username || "";
    const selfId = () => net?.id;
    const isHost = () => !!net && net.host() === net.id;

    function emitPeers() {
      opts.onPeers?.(peers());
    }
    function peers() {
      return net ? net.players().filter((p) => p.id !== net.id) : [];
    }

    // ---- sending
    function flushOps() {
      clock.clearTimeout(opTimer);
      opTimer = null;
      if (!queue.length || !net) {
        queue = [];
        return;
      }
      // pack as many ops as fit under the frame limit
      while (queue.length) {
        let take = 0;
        let size = 40;
        while (take < queue.length && (take === 0 || size + JSON.stringify(queue[take]).length < MAX_MSG)) size += JSON.stringify(queue[take++]).length + 1;
        const ops = queue.splice(0, take);
        const n = sentN - queue.length;
        net.send(ops.length === 1 ? { k: "op", op: ops[0], n } : { k: "op", ops, n });
      }
    }

    function sendOp(op) {
      // while offline the reconnect snapshot is the source of truth, so nothing is queued
      if (closed || !net || !ready()) return;
      queue.push(op);
      sentN++;
      seen[selfId()] = sentN;
      if (!opTimer) opTimer = clock.setTimeout(flushOps, OP_MS);
    }

    function sendCursor(c) {
      if (closed || !net || !ready()) return;
      cursor = c;
      const wait = lastCursor + CURSOR_MS - clock.now();
      if (wait <= 0) return pushCursor();
      if (!cursorTimer) cursorTimer = clock.setTimeout(pushCursor, wait);
    }
    function pushCursor() {
      cursorTimer = null;
      if (!cursor || !net) return;
      lastCursor = clock.now();
      net.send({ k: "cur", x: cursor.x, y: cursor.y, color: cursor.color || opts.color || colorFor(selfId()), tool: cursor.tool });
      cursor = null;
    }

    // ---- syncing
    function askForSnapshot() {
      clock.clearTimeout(syncTimer);
      syncTimer = null;
      if (closed || isSynced || !net || isHost()) return;
      net.send({ k: "sync-req" }, net.host());
      // host may have vanished mid-request, ask whoever is host by then
      syncTimer = clock.setTimeout(askForSnapshot, SYNC_RETRY_MS);
    }

    function markSynced() {
      isSynced = true;
      clock.clearTimeout(syncTimer);
      syncTimer = null;
      status(isHost() ? "hosting" : "live");
      for (const item of waiting.splice(0)) applyMessage(item.from, item.data);
    }

    function applyOps(from, data) {
      const ops = data.ops || [data.op];
      const n = Number(data.n);
      const first = n - ops.length + 1;
      ops.forEach((op, i) => {
        const num = first + i;
        if (Number.isFinite(num)) {
          if (num <= (seen[from] || 0)) return; // already inside the snapshot
          seen[from] = num;
        }
        try {
          editor.applyOp(op);
        } catch {
          // one bad op from a peer must not stop the stream
        }
      });
    }

    function applyMessage(from, data) {
      if (!data || typeof data !== "object") return;
      if (data.k === "sync-req") {
        if (!isHost()) return;
        flushOps(); // so the snapshot and the op numbers agree
        net.send({ k: "sync", doc: editor.serialize(), seen: { ...seen } }, from);
      } else if (data.k === "sync") {
        if (isSynced || typeof data.doc !== "string") return;
        editor.load(data.doc);
        for (const [id, n] of Object.entries(data.seen || {})) if (Number.isFinite(n)) seen[id] = Math.max(seen[id] || 0, n);
        markSynced();
      } else if (data.k === "op") {
        if (!isSynced) {
          if (waiting.length < MAX_BUFFER) waiting.push({ from, data });
          return;
        }
        applyOps(from, data);
      } else if (data.k === "cur") {
        if (typeof editor.setPeerCursor !== "function") return;
        peerIds.add(from);
        editor.setPeerCursor(from, { x: Number(data.x), y: Number(data.y), name: nameOf(from), color: String(data.color || colorFor(from)).slice(0, 40), tool: data.tool });
      }
    }

    function onMsg(from, data) {
      if (from === selfId()) return; // never react to my own echo
      if (!editor) {
        if (early.length < MAX_BUFFER) early.push({ from, data });
        return;
      }
      applyMessage(from, data);
    }

    // ---- connection
    function open() {
      if (closed) return;
      isSynced = false;
      status(retries ? "reconnecting..." : "connecting...");
      let self = null;
      const handlers = {
        onHello() {
          if (net !== self) return;
          retries = 0;
          emitPeers();
          if (isHost()) markSynced();
          else {
            status("syncing...");
            askForSnapshot();
          }
        },
        onJoin() {
          if (net !== self) return;
          emitPeers();
        },
        onLeave(id, host) {
          if (net !== self) return;
          editor?.setPeerCursor?.(id, null);
          peerIds.delete(id);
          emitPeers();
          if (!isSynced) {
            // the host I was waiting on may be gone, and I may be the host now
            if (host === net.id) markSynced();
            else askForSnapshot();
          } else if (host === net.id) status("hosting");
        },
        onMsg: (from, data) => net === self && onMsg(from, data),
        onClose() {
          if (net !== self || closed) return;
          net = null;
          queue = [];
          clock.clearTimeout(syncTimer);
          for (const p of peerIds) editor?.setPeerCursor?.(p, null);
          peerIds.clear();
          opts.onPeers?.([]);
          if (retries >= MAX_RETRIES) return status("disconnected");
          const wait = Math.min(10000, 1000 * 2 ** retries++);
          status("reconnecting...");
          retryTimer = clock.setTimeout(open, wait);
        },
      };
      self = connect("studio", code, handlers);
      net = self;
    }

    function bind(ed) {
      editor = ed;
      for (const item of early.splice(0)) onMsg(item.from, item.data);
      return session;
    }

    function detach() {
      closed = true;
      for (const t of [opTimer, cursorTimer, syncTimer, retryTimer]) clock.clearTimeout(t);
      if (editor && editor.onOp === sendOp) editor.onOp = null;
      if (editor && editor.onCursor === sendCursor) editor.onCursor = null;
      const n = net;
      net = null;
      n?.close();
      status("left");
    }

    const session = { sendOp, sendCursor, bind, detach, peers, isHost, synced: () => isSynced };
    open();
    return session;
  }

  // for an editor that is already mounted: hooks it up and starts the session
  function attach(editor, code, opts) {
    const session = create(code, opts);
    session.bind(editor);
    editor.onOp = session.sendOp;
    editor.onCursor = session.sendCursor;
    return session;
  }

  return { create, attach };
});
