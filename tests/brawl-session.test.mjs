import test from "node:test";
import assert from "node:assert/strict";
import { BrawlSession } from "../server/brawl/session.js";

const players = [
  { id: "a", username: "ann", avatar: {}, race: "pixie" },
  { id: "b", username: "bo", avatar: {}, race: "macho" },
];

function room() {
  const clock = { t: 1000 };
  const sent = [[], []];
  const session = new BrawlSession({ id: "m1", players }, { now: () => clock.t, send: (side, text) => sent[side].push(text) });
  const advance = (ms) => {
    const end = clock.t + ms;
    while (clock.t < end) {
      clock.t += 5;
      session.tick();
    }
  };
  const last = (side) => JSON.parse([...sent[side]].reverse().find((text) => text.startsWith('{"t":"s"')));
  return { clock, sent, session, advance, last };
}

test("sides come from who is on the player list", () => {
  const { session } = room();
  assert.equal(session.sideOf("a"), 0);
  assert.equal(session.sideOf("b"), 1);
  assert.equal(session.sideOf("c"), -1);
});

test("the fight waits for both people and then runs in real time", () => {
  const { session, advance, last } = room();
  session.connect(0);
  advance(500);
  assert.equal(session.sim.frame, 0);
  session.connect(1);
  advance(1000);
  assert.ok(session.sim.frame >= 58 && session.sim.frame <= 62, "frame " + session.sim.frame);
  assert.equal(last(0).s.frame, last(1).s.frame);
});

test("snapshots go out about thirty times a second", () => {
  const { session, advance, sent } = room();
  session.connect(0);
  session.connect(1);
  const before = sent[0].length;
  advance(1000);
  const count = sent[0].length - before;
  assert.ok(count >= 28 && count <= 32, "sent " + count);
});

test("a tap that is over before the next tick still counts as a press", () => {
  const { session, advance, last } = room();
  session.connect(0);
  session.connect(1);
  advance(1700);
  assert.equal(session.sim.phase, "fight");
  session.sim.f[0].x = 400;
  session.sim.f[1].x = 450;
  session.message(0, JSON.stringify({ t: "in", q: 1, h: 0, p: 16 }));
  advance(300);
  assert.ok(last(1).s.f[1].hp < last(1).s.f[1].max);
  assert.equal(last(0).a[0], 1);
});

test("junk and floods from a browser are ignored", () => {
  const { session } = room();
  session.connect(0);
  session.connect(1);
  session.message(0, "not json");
  session.message(0, JSON.stringify({ t: "other" }));
  session.message(0, "x".repeat(500));
  session.message(0, JSON.stringify({ t: "in", q: 1, h: 99999, p: "nope" }));
  assert.equal(session.held[0], 99999 & 127);
  assert.equal(session.pending[0], 0);
  for (let i = 0; i < 1000; i++) session.message(1, JSON.stringify({ t: "in", q: i + 1, h: 1, p: 0 }));
  assert.ok(session.seq[1] <= 240);
});

test("ping gets a pong", () => {
  const { session, sent } = room();
  session.connect(0);
  session.message(0, "ping");
  assert.equal(sent[0].at(-1), "pong");
});

test("leaving for good hands the match to the other person", () => {
  const { session, advance, sent } = room();
  session.connect(0);
  session.connect(1);
  advance(500);
  session.disconnect(1);
  advance(7000);
  assert.equal(session.finished, false);
  advance(2000);
  assert.equal(session.finished, true);
  assert.equal(session.winner, 0);
  assert.match(sent[0].at(-1), /"reason":"forfeit"/);
});

test("coming back in time keeps the match going and gets the current state", () => {
  const { session, advance, sent } = room();
  session.connect(0);
  session.connect(1);
  advance(500);
  session.disconnect(1);
  advance(3000);
  const before = sent[1].length;
  session.connect(1);
  assert.match(sent[1][before], /"t":"hello"/);
  assert.match(sent[1][before + 1], /"t":"s"/);
  advance(10000);
  assert.equal(session.finished, false);
});

test("nobody showing up cancels the match", () => {
  const { session, advance } = room();
  session.connect(0);
  advance(31000);
  assert.equal(session.finished, true);
  assert.equal(session.reason, "noshow");
});

test("a finished match closes after a short linger", () => {
  const { session, advance } = room();
  session.connect(0);
  session.connect(1);
  advance(200);
  session.forfeit(0);
  assert.equal(session.isDone(), false);
  advance(4200);
  assert.equal(session.isDone(), true);
});

test("a long stall skips ahead instead of replaying every missed frame", () => {
  const { session, clock } = room();
  session.connect(0);
  session.connect(1);
  clock.t += 5000;
  session.tick();
  assert.ok(session.sim.frame <= 10);
});
