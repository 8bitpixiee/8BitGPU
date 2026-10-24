import Sim from "../../client/shared/brawl-sim.js";

// One brawl between two people. It owns the real fight, the two browsers only send their buttons
// and draw what comes back. Nothing here touches the platform, so the Durable Object around it
// just feeds in sockets and a clock and the tests can do the same.
const TICK_MS = 1000 / 60;
const SEND_EVERY = 2; // ticks between snapshots, 30 a second
const MAX_CATCH_UP = 8;
const JOIN_GRACE_MS = 30000;
const DROP_GRACE_MS = 8000;
const LINGER_MS = 4000;
const INPUTS_PER_SECOND = 240;

export class BrawlSession {
  constructor({ id, players }, io) {
    this.id = id;
    this.players = players.map(({ id: userId, username, avatar, race }) => ({ id: userId, username, avatar, race }));
    this.io = io;
    this.sim = Sim.create(this.players.map((player) => player.race));
    this.held = [0, 0];
    this.pending = [0, 0];
    this.seq = [0, 0];
    this.online = [false, false];
    this.dropAt = [0, 0];
    this.budget = [INPUTS_PER_SECOND, INPUTS_PER_SECOND];
    this.budgetAt = [0, 0];
    this.done = 0;
    this.started = false;
    this.t0 = 0;
    this.finished = false;
    this.closeAt = 0;
    this.joinBy = io.now() + JOIN_GRACE_MS;
  }

  sideOf(userId) {
    return this.players.findIndex((player) => player.id === userId);
  }

  connect(side) {
    this.online[side] = true;
    this.dropAt[side] = 0;
    this.io.send(side, JSON.stringify({ t: "hello", id: this.id, side, players: this.players, frame: this.sim.frame }));
    if (this.finished) return this.io.send(side, this.endMessage());
    if (this.started) this.io.send(side, this.stateMessage());
    if (!this.started && this.online[0] && this.online[1]) {
      this.started = true;
      this.t0 = this.io.now();
      this.broadcast(this.stateMessage());
    }
  }

  disconnect(side) {
    this.online[side] = false;
    if (this.started && !this.sim.over) this.dropAt[side] = this.io.now() + DROP_GRACE_MS;
  }

  // the browser sends {t:"in", q: its own counter, h: buttons held, p: buttons tapped since the last message}
  message(side, text) {
    if (text === "ping") return this.io.send(side, "pong");
    if (typeof text !== "string" || text.length > 120) return;
    const now = this.io.now();
    if (now - this.budgetAt[side] >= 1000) {
      this.budgetAt[side] = now;
      this.budget[side] = INPUTS_PER_SECOND;
    }
    if (this.budget[side]-- <= 0) return;
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }
    if (msg?.t !== "in") return;
    const bits = (value) => (Number.isInteger(value) ? value & 127 : 0);
    this.held[side] = bits(msg.h);
    this.pending[side] |= bits(msg.p);
    if (Number.isInteger(msg.q) && msg.q > this.seq[side]) this.seq[side] = msg.q;
  }

  tick() {
    const now = this.io.now();
    if (this.finished) return;
    if (!this.started) {
      if (now > this.joinBy) this.finish("noshow", -1);
      return;
    }
    let due = Math.floor((now - this.t0) / TICK_MS) - this.done;
    if (due > MAX_CATCH_UP) {
      // fell behind, skip ahead instead of racing to catch up
      this.done += due - MAX_CATCH_UP;
      due = MAX_CATCH_UP;
    }
    for (let i = 0; i < due && !this.sim.over; i++) {
      const phase = this.sim.phase;
      const bits = [this.held[0] | this.pending[0], this.held[1] | this.pending[1]];
      this.pending[0] = this.pending[1] = 0;
      Sim.step(this.sim, bits[0], bits[1]);
      this.done++;
      if (this.done % SEND_EVERY === 0 || phase !== this.sim.phase) this.broadcast(this.stateMessage());
    }
    for (const side of [0, 1]) {
      if (this.dropAt[side] && now >= this.dropAt[side] && !this.sim.over) this.forfeit(side);
    }
    if (this.sim.over) this.finish("over", this.sim.winner);
  }

  forfeit(side) {
    const other = 1 - side;
    this.sim.wins[other] = Sim.WINS_NEEDED;
    this.sim.winner = other;
    this.sim.phase = "matchend";
    this.sim.over = true;
    this.finish("forfeit", other);
  }

  finish(reason, winner) {
    if (this.finished) return;
    this.finished = true;
    this.reason = reason;
    this.winner = winner;
    this.closeAt = this.io.now() + LINGER_MS;
    this.broadcast(this.stateMessage());
    this.broadcast(this.endMessage());
  }

  isDone() {
    return this.finished && this.io.now() >= this.closeAt;
  }

  stateMessage() {
    return JSON.stringify({ t: "s", a: [this.seq[0], this.seq[1]], s: Sim.snapshot(this.sim) });
  }

  endMessage() {
    return JSON.stringify({ t: "end", winner: this.winner, reason: this.reason });
  }

  broadcast(text) {
    for (const side of [0, 1]) if (this.online[side]) this.io.send(side, text);
  }
}
