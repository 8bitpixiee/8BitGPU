const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../client/games/party.js");

// manual clock: nothing happens until advance(), so message delivery order is deterministic
function makeClock() {
  let now = 0, seq = 0;
  const q = [];
  return {
    setTimeout(fn, ms) { const t = { at: now + ms, seq: seq++, fn, dead: false }; q.push(t); return t; },
    clearTimeout(t) { if (t) t.dead = true; },
    advance(ms) {
      const end = now + ms;
      for (;;) {
        const next = q.filter((t) => !t.dead).sort((a, b) => a.at - b.at || a.seq - b.seq)[0];
        if (!next || next.at > end) break;
        q.splice(q.indexOf(next), 1);
        now = next.at;
        next.fn();
      }
      now = end;
    },
  };
}

// in-memory stand-in for the relay + GameNet: oldest member is host, sender gets no echo
function makeRoom(clock) {
  const members = [];
  const later = (fn) => clock.setTimeout(fn, 0);
  const hostId = () => members[0]?.id ?? null;
  return {
    join(name, session) {
      const m = { id: name, username: name, session, host: null, roster: [], alive: true };
      const net = {
        id: name,
        host: () => m.host,
        isHost: () => m.host === name,
        players: () => m.roster.slice(),
        send(data, to) {
          const copy = JSON.parse(JSON.stringify(data));
          for (const o of members.slice()) if (o.id !== name && (!to || o.id === to)) later(() => o.alive && o.session.handlers.onMsg(name, copy));
        },
        close() { net.leave(); },
        leave() {
          if (!m.alive) return;
          m.alive = false;
          members.splice(members.indexOf(m), 1);
          for (const o of members.slice()) {
            later(() => {
              if (!o.alive) return;
              o.host = hostId();
              o.roster = o.roster.filter((p) => p.id !== name);
              o.session.handlers.onLeave(name, o.host);
            });
          }
        },
      };
      members.push(m);
      session.attach(net);
      m.host = hostId();
      m.roster = members.map((x) => ({ id: x.id, username: x.username }));
      later(() => m.alive && session.handlers.onHello({}));
      for (const o of members.slice(0, -1)) {
        later(() => {
          if (!o.alive) return;
          o.host = hostId();
          o.roster.push({ id: name, username: name });
          o.session.handlers.onJoin({ id: name, username: name }, o.host);
        });
      }
      return net;
    },
  };
}

// a "player" that finishes every game 5s in with a score of base + round
function player(clock, room, name, base) {
  const log = {};
  let s;
  const hooks = {
    startRound(info) {
      (log.games ||= []).push(info.game.id);
      clock.setTimeout(() => s.report(base + info.i), 5000);
    },
    roundEnd(info) { (log.ends ||= []).push(info); },
    final(info) { log.final = info; },
    busy() { log.busy = true; },
  };
  s = P.createSession({ clock, hooks, rand: () => 0.25 });
  const net = room.join(name, s);
  return { s, net, log };
}

test("planRounds is seeded, covers 8 distinct games", () => {
  const a = P.planRounds(42);
  assert.deepEqual(a, P.planRounds(42));
  assert.equal(new Set(a).size, 8);
  assert.notDeepEqual(a, P.planRounds(43));
  assert.ok(P.GAMES.length >= 8);
});

test("pointsFor ranks and shares points on ties", () => {
  assert.deepEqual(P.pointsFor({ a: 9, b: 5, c: 1 }), { a: 10, b: 8, c: 6 });
  assert.deepEqual(P.pointsFor({ a: 5, b: 5, c: 1 }), { a: 10, b: 10, c: 6 });
});

test("bot scores stay inside the game's range", () => {
  for (const g of P.GAMES) {
    for (let s = 0; s < 20; s++) {
      const v = P.botScore(g.id, P.mulberry32(s), s / 20);
      assert.ok(v >= g.range[0] && v <= g.range[1], g.id);
    }
  }
});

test("a three player party finishes with identical standings everywhere", () => {
  const clock = makeClock();
  const room = makeRoom(clock);
  const a = player(clock, room, "a", 300);
  clock.advance(10);
  const b = player(clock, room, "b", 200);
  const c = player(clock, room, "c", 100);
  clock.advance(10);
  assert.ok(a.s.startParty(0));
  clock.advance(8 * 20000);
  for (const p of [a, b, c]) {
    assert.equal(p.log.ends.length, 8);
    assert.ok(p.log.final, "final reached");
  }
  assert.deepEqual(a.log.final.ranking, b.log.final.ranking);
  assert.deepEqual(a.log.final.ranking, c.log.final.ranking);
  assert.equal(a.log.final.ranking[0].id, "a");
  assert.equal(a.log.final.ranking[0].total, 80); // 10 points x 8 rounds
  assert.deepEqual(a.log.games, c.log.games);
});

test("solo practice runs with bots through loopNet", () => {
  const clock = makeClock();
  let final;
  const s = P.createSession({ clock, hooks: { startRound: () => clock.setTimeout(() => s.report(50), 100), final: (f) => (final = f) } });
  s.attach(P.loopNet(s.handlers, { id: "me", username: "Me" }, clock));
  clock.advance(10);
  assert.ok(s.startParty(3));
  clock.advance(8 * 20000);
  assert.equal(final.ranking.length, 4);
  assert.equal(final.rounds, 8);
  assert.ok(final.ranking.some((r) => r.bot));
});

test("host leaving mid-round hands over and the party still finishes", () => {
  const clock = makeClock();
  const room = makeRoom(clock);
  const a = player(clock, room, "a", 300);
  clock.advance(10);
  const b = player(clock, room, "b", 200);
  const c = player(clock, room, "c", 100);
  clock.advance(10);
  a.s.startParty(0);
  // a few rounds in, a round is running (not yet reported) when the host drops
  clock.advance(1500 + 2 * 10000 + 2000);
  assert.equal(a.log.games.length, 3);
  a.net.leave();
  clock.advance(8 * 20000);
  assert.ok(b.net.isHost());
  assert.ok(b.log.final && c.log.final);
  assert.deepEqual(b.log.final.ranking, c.log.final.ranking);
  assert.equal(b.log.final.ranking.length, 3);
  assert.equal(b.log.ends.length, 8);
  assert.ok(b.log.final.ranking.find((r) => r.id === "a").left);
  assert.equal(b.log.final.ranking[0].id, "b");
});

test("someone joining a running party is told it is busy", () => {
  const clock = makeClock();
  const room = makeRoom(clock);
  const a = player(clock, room, "a", 10);
  clock.advance(10);
  a.s.startParty(2);
  clock.advance(3000);
  const late = player(clock, room, "late", 10);
  clock.advance(10);
  assert.ok(late.log.busy);
});

test("only the host may start a party", () => {
  const clock = makeClock();
  const room = makeRoom(clock);
  player(clock, room, "a", 10);
  clock.advance(10);
  const b = player(clock, room, "b", 10);
  clock.advance(10);
  assert.equal(b.s.startParty(0), false);
  b.s.handlers.onMsg("b", { k: "start", seed: 1, players: [] }); // not from the host
  assert.equal(b.s.state.phase, "lobby");
});
