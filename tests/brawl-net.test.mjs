import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { BrawlSession } from "../server/brawl/session.js";

const require = createRequire(import.meta.url);
const Sim = require("../client/shared/brawl-sim.js");
const Predict = require("../client/shared/brawl-predict.js");
const { BIT } = Sim;

// the referee and two browsers with a fixed trip time each way, stepped five milliseconds at a time
function link(delay) {
  const clock = { t: 1000 };
  const toClient = [[], []];
  const toServer = [];
  const history = [];
  const session = new BrawlSession(
    { id: "m", players: [{ id: "a", username: "a", race: "pixie" }, { id: "b", username: "b", race: "macho" }] },
    { now: () => clock.t, send: (side, text) => toClient[side].push({ at: clock.t + delay, text }) },
  );
  const clients = [0, 1].map((side) => ({ side, snap: null, snapAt: 0, unacked: [], seq: 0, held: 0 }));
  const press = (side, held, taps = 0) => {
    const c = clients[side];
    c.held = held;
    c.unacked.push({ q: ++c.seq, p: taps, at: clock.t });
    toServer.push({ at: clock.t + delay, side, text: JSON.stringify({ t: "in", q: c.seq, h: held, p: taps }) });
  };
  const step = () => {
    clock.t += 5;
    for (const m of toServer.splice(0).filter((m) => (m.at <= clock.t ? (session.message(m.side, m.text), false) : true))) toServer.push(m);
    session.tick();
    history.push({ t: clock.t, state: Sim.snapshot(session.sim) });
    for (const c of clients) {
      const due = toClient[c.side].filter((m) => m.at <= clock.t);
      toClient[c.side] = toClient[c.side].filter((m) => m.at > clock.t);
      for (const m of due) {
        const msg = JSON.parse(m.text);
        if (msg.t !== "s") continue;
        c.snap = msg.s;
        c.snapAt = clock.t;
        c.unacked = c.unacked.filter((e) => e.q > msg.a[c.side]);
      }
    }
  };
  const run = (ms) => {
    const end = clock.t + ms;
    while (clock.t < end) step();
  };
  const predicted = (side) => {
    const c = clients[side];
    let taps = 0;
    for (const e of c.unacked) taps |= e.p;
    const frames = Predict.framesAhead(clock.t - c.snapAt, delay * 2);
    const age = c.unacked.length ? (clock.t - c.unacked[0].at) / Predict.FRAME : Infinity;
    return Predict.predict(c.snap, side, { held: c.held, taps, frames, age }).state;
  };
  const serverAt = (t) => [...history].reverse().find((h) => h.t <= t)?.state;
  session.connect(0);
  session.connect(1);
  return { clock, session, clients, press, run, predicted, serverAt, history };
}

for (const delay of [20, 50, 100]) {
  test(`with ${delay}ms each way you move the instant you press and land where the referee puts you`, () => {
    const net = link(delay);
    net.run(2000);
    assert.equal(net.session.sim.phase, "fight");
    const before = net.clients[0].snap.f[0].x;
    net.press(0, BIT.R);
    net.run(10);
    // nothing has come back from the referee yet but your fighter already moves
    assert.ok(net.predicted(0).f[0].x > before + 3, "no instant movement");
    assert.ok(net.predicted(0).f[0].x < before + 25, "jumped ahead instead of starting to walk");
    assert.equal(net.clients[0].snap.f[0].x, before);
    net.run(500);
    const arrive = net.clock.t;
    const guess = net.predicted(0).f[0].x;
    net.run(delay);
    const truth = net.serverAt(arrive + delay).f[0].x;
    assert.ok(Math.abs(guess - truth) < 14, `guess ${guess.toFixed(1)} vs referee ${truth.toFixed(1)}`);
  });
}

test("a tap shows up as an attack right away and still lands on the referee", () => {
  const net = link(60);
  net.run(2000);
  net.session.sim.f[0].x = 400;
  net.session.sim.f[1].x = 450;
  net.run(100);
  net.press(0, 0, BIT.A);
  net.press(0, 0, 0);
  net.run(5);
  assert.equal(net.predicted(0).f[0].st, "atk");
  net.run(400);
  assert.ok(net.session.sim.f[1].hp < net.session.sim.f[1].max);
});

test("a tap and release inside one network hop still counts as one attack", () => {
  const net = link(80);
  net.run(2000);
  net.session.sim.f[0].x = 400;
  net.session.sim.f[1].x = 450;
  net.press(0, BIT.A, BIT.A);
  net.press(0, 0, 0);
  net.run(400);
  assert.equal(net.session.sim.f[1].hp < net.session.sim.f[1].max, true);
  assert.equal(net.session.sim.f[0].landed >= 0, true);
});

test("prediction looks the same as the referee when nobody does anything", () => {
  const net = link(40);
  net.run(2500);
  const guess = net.predicted(1);
  const truth = net.serverAt(net.clock.t + 40);
  assert.deepEqual(
    guess.f.map((f) => [Math.round(f.x), Math.round(f.y), f.st]),
    truth.f.map((f) => [Math.round(f.x), Math.round(f.y), f.st]),
  );
});

test("frames ahead stays inside sane limits", () => {
  assert.equal(Predict.framesAhead(0, 0), 0);
  assert.equal(Predict.framesAhead(16.7, 100), 7);
  assert.equal(Predict.framesAhead(5000, 2000), 24);
  assert.equal(Predict.framesAhead(-50, 20), 0);
});
