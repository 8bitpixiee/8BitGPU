const test = require("node:test");
const assert = require("node:assert/strict");
const StudioCollab = require("../client/studio/collab.js");

// in-memory stand-in for GameNet + the relay room. Deliveries queue up so we control when they land.
function makeWorld() {
  const queue = [];
  const rooms = new Map();
  let ticks = 0;
  let timers = [];
  let nowMs = 1_000_000;

  const clock = {
    now: () => nowMs,
    setTimeout(fn, ms) {
      const t = { fn, at: nowMs + ms };
      timers.push(t);
      return t;
    },
    clearTimeout(t) {
      timers = timers.filter((x) => x !== t);
    },
  };

  const world = {
    clock,
    sent: [], // every frame a client put on the wire, for counting
    flush() {
      while (queue.length) queue.shift()();
    },
    advance(ms) {
      const end = nowMs + ms;
      for (;;) {
        world.flush();
        const due = timers.filter((t) => t.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!due) break;
        timers = timers.filter((t) => t !== due);
        nowMs = Math.max(nowMs, due.at);
        due.fn();
      }
      nowMs = end;
      world.flush();
    },
    // a fresh GameNet.connect for one user; tracks open connections so tests can drop them
    connector(username) {
      return (game, code, handlers) => {
        assert.equal(game, "studio");
        const room = rooms.get(code) || rooms.set(code, []).get(code);
        const me = { id: username, username, joined: ++ticks, handlers, open: true };
        const roster = () => room.map((m) => ({ id: m.id, username: m.username }));
        const hostId = () => room[0]?.id ?? null;
        let helloed = false;
        const api = {
          get id() {
            return helloed ? me.id : null;
          },
          host: () => hostId(),
          players: () => roster(),
          send(data, to) {
            if (!me.open) return false;
            world.sent.push({ from: me.id, data });
            const copy = JSON.parse(JSON.stringify(data));
            queue.push(() => {
              for (const m of room) if (m !== me && m.open && (!to || m.id === to)) m.handlers.onMsg?.(me.id, JSON.parse(JSON.stringify(copy)));
            });
            return true;
          },
          close: () => leave(),
        };
        const leave = () => {
          if (!me.open) return;
          me.open = false;
          room.splice(room.indexOf(me), 1);
          queue.push(() => {
            for (const m of room) m.handlers.onLeave?.(me.id, hostId());
            handlers.onClose?.();
          });
        };
        me.drop = leave;
        queue.push(() => {
          room.push(me);
          helloed = true;
          handlers.onHello?.({ id: me.id, host: hostId(), players: roster() });
          for (const m of room) if (m !== me) m.handlers.onJoin?.({ id: me.id, username: me.username }, hostId());
        });
        api.drop = leave;
        world.conns.push(me);
        return api;
      };
    },
    conns: [],
  };
  return world;
}

function fakeEditor(doc = "") {
  const ed = {
    doc,
    applied: [],
    cursors: {},
    serialize: () => ed.doc,
    load(str) {
      ed.doc = str;
      ed.applied = [];
    },
    applyOp(op) {
      ed.applied.push(op);
      ed.doc += op;
    },
    setPeerCursor(id, c) {
      if (c) ed.cursors[id] = c;
      else delete ed.cursors[id];
    },
  };
  return ed;
}

// local edit: change the doc and tell collab, like the real editor's onOp
const draw = (ed, session, op) => {
  ed.doc += op;
  session.sendOp(op);
};

function join(world, name, doc) {
  const ed = fakeEditor(doc);
  const status = [];
  const peerLists = [];
  const session = StudioCollab.create("ROOM", {
    clock: world.clock,
    connect: world.connector(name),
    onStatus: (t) => status.push(t),
    onPeers: (l) => peerLists.push(l.map((p) => p.username)),
  });
  session.bind(ed);
  world.flush();
  return { ed, session, status, peerLists };
}

test("joiner gets the host's snapshot and nobody is told twice", () => {
  const w = makeWorld();
  const a = join(w, "ann", "ABC");
  const b = join(w, "bo", "");
  w.advance(10);
  assert.equal(b.ed.doc, "ABC");
  assert.equal(a.session.isHost(), true);
  assert.equal(b.session.synced(), true);
  assert.equal(a.status.at(-1), "hosting");
  assert.equal(b.status.at(-1), "live");
  assert.deepEqual(a.session.peers().map((p) => p.username), ["bo"]);
  assert.deepEqual(b.peerLists.at(-1), ["ann"]);
});

test("ops reach the other side, are batched, and never echo back", () => {
  const w = makeWorld();
  const a = join(w, "ann", "");
  const b = join(w, "bo", "");
  w.advance(10);
  w.sent.length = 0;
  for (const ch of "12345") draw(a.ed, a.session, ch);
  assert.equal(w.sent.length, 0, "nothing goes out until the batch timer fires");
  w.advance(60);
  assert.equal(w.sent.filter((s) => s.data.k === "op").length, 1);
  assert.equal(b.ed.doc, "12345");
  assert.deepEqual(a.ed.applied, []);
  // many ops over time stay at or under 20 messages a second
  w.sent.length = 0;
  for (let i = 0; i < 100; i++) {
    draw(a.ed, a.session, "x");
    w.advance(10);
  }
  w.advance(100);
  assert.ok(w.sent.filter((s) => s.data.k === "op").length <= 21);
  assert.equal(b.ed.doc, "12345" + "x".repeat(100));
});

test("an op that was already inside the snapshot is not applied again", () => {
  const w = makeWorld();
  const a = join(w, "ann", "");
  draw(a.ed, a.session, "A"); // sits in ann's queue
  const b = join(w, "bo", "");
  w.advance(1); // bo asks, ann flushes first then snapshots
  draw(a.ed, a.session, "B");
  w.advance(200);
  assert.equal(a.ed.doc, "AB");
  assert.equal(b.ed.doc, "AB");
});

test("ops that arrive while waiting for the snapshot are held, then deduped", () => {
  const w = makeWorld();
  const a = join(w, "ann", "");
  const c = join(w, "cy", "");
  w.advance(10);
  const b = join(w, "bo", ""); // hello delivered, sync-req on its way
  draw(c.ed, c.session, "Z"); // cy draws right as bo joins
  w.advance(200);
  assert.equal(b.ed.doc, a.ed.doc);
  assert.equal(b.ed.doc.split("Z").length - 1, 1);
});

test("cursors are throttled, named and cleaned up when someone leaves", () => {
  const w = makeWorld();
  const a = join(w, "ann", "");
  const b = join(w, "bo", "");
  w.advance(10);
  w.sent.length = 0;
  for (let i = 0; i < 30; i++) {
    a.session.sendCursor({ x: i, y: 2, color: "#f0f", tool: "pen" });
    w.advance(10); // 100Hz of input for 300ms
  }
  w.advance(100); // the trailing frame carries the final position
  const cur = w.sent.filter((s) => s.data.k === "cur").length;
  assert.ok(cur >= 3 && cur <= 6, `cursor frames: ${cur}`);
  assert.deepEqual(b.ed.cursors.ann, { x: 29, y: 2, name: "ann", color: "#f0f", tool: "pen" });
  a.session.detach();
  w.advance(10);
  assert.equal(b.ed.cursors.ann, undefined);
});

test("host leaves: the next oldest takes over and can serve new joiners", () => {
  const w = makeWorld();
  const a = join(w, "ann", "DOC");
  const b = join(w, "bo", "");
  w.advance(10);
  a.session.detach();
  w.advance(10);
  assert.equal(b.session.isHost(), true);
  assert.equal(b.status.at(-1), "hosting");
  draw(b.ed, b.session, "!");
  const c = join(w, "cy", "");
  w.advance(300);
  assert.equal(c.ed.doc, "DOC!");
});

test("joiner whose host vanished before answering gets promoted without hanging", () => {
  const w = makeWorld();
  const a = join(w, "ann", "X");
  w.advance(1);
  const ed = fakeEditor("mine");
  const b = { ed, session: StudioCollab.create("ROOM", { clock: w.clock, connect: w.connector("bo") }) };
  b.session.bind(ed);
  a.session.detach(); // queued behind bo's hello, so it lands before the sync-req would
  w.advance(20);
  assert.equal(b.session.synced(), true);
  assert.equal(b.session.isHost(), true);
  assert.equal(b.ed.doc, "mine");
});

test("dropped connection reconnects and resyncs from the host", () => {
  const w = makeWorld();
  const a = join(w, "ann", "ONE");
  const b = join(w, "bo", "");
  w.advance(10);
  // bo's socket dies; meanwhile ann keeps drawing
  w.conns.find((c) => c.id === "bo" && c.open).drop();
  w.advance(10);
  assert.equal(b.status.at(-1), "reconnecting...");
  draw(a.ed, a.session, "two");
  w.advance(100);
  assert.equal(b.ed.doc, "ONE", "still stale while offline");
  w.advance(1500); // first retry after a second
  assert.equal(b.session.synced(), true);
  assert.equal(b.ed.doc, "ONEtwo");
  assert.equal(b.status.at(-1), "live");
  draw(a.ed, a.session, "3");
  w.advance(100);
  assert.equal(b.ed.doc, "ONEtwo3");
});

test("a reloaded page's op numbers are not mistaken for old ones", () => {
  const w = makeWorld();
  const a = join(w, "ann", "");
  const b1 = join(w, "bo", "");
  w.advance(10);
  draw(b1.ed, b1.session, "p");
  w.advance(100);
  b1.session.detach();
  w.advance(10);
  w.clock.setTimeout(() => {}, 0);
  w.advance(5);
  const b2 = join(w, "bo", "");
  w.advance(10);
  draw(b2.ed, b2.session, "q");
  w.advance(100);
  assert.equal(a.ed.doc, "pq");
});

test("junk messages and a failing editor do not break the stream", () => {
  const w = makeWorld();
  const a = join(w, "ann", "");
  const b = join(w, "bo", "");
  w.advance(10);
  b.ed.applyOp = (op) => {
    if (op === "bad") throw new Error("nope");
    b.ed.doc += op;
  };
  draw(a.ed, a.session, "bad");
  w.advance(60);
  draw(a.ed, a.session, "ok");
  w.advance(60);
  assert.equal(b.ed.doc, "ok");
  const peer = w.conns.find((c) => c.id === "ann");
  peer.handlers.onMsg("bo", null);
  peer.handlers.onMsg("bo", { k: "wat" });
});

test("attach hooks an already mounted editor", () => {
  const w = makeWorld();
  const ed = fakeEditor("hi");
  const other = join(w, "bo", "");
  const session = StudioCollab.attach(ed, "ROOM", { clock: w.clock, connect: w.connector("ann") });
  w.advance(10);
  assert.equal(typeof ed.onOp, "function");
  ed.onOp("!");
  w.advance(100);
  assert.equal(other.ed.doc.endsWith("!"), true);
  session.detach();
  assert.equal(ed.onOp, null);
});
