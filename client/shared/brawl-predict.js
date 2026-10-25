(function (root, factory) {
  const api = factory(root.BrawlSim || (typeof require === "function" ? require("./brawl-sim.js") : null));
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.BrawlPredict = api;
})(typeof self !== "undefined" ? self : this, function (Sim) {
  const FRAME = 1000 / 60;
  const MAX_FRAMES = 24;
  const MAX_LEAD = 12;

  // How many fighting frames to run past the last snapshot. The snapshot is already one trip old, and
  // a button you press now only reaches the referee one trip from now, so you are drawn a full round
  // trip ahead of the snapshot. That is also where the referee will have you when your newest button lands.
  function framesAhead(sinceSnapshotMs, rttMs) {
    const lead = Math.min(MAX_LEAD, Math.round(rttMs / FRAME));
    return Math.max(0, Math.min(MAX_FRAMES, Math.floor(sinceSnapshotMs / FRAME) + lead));
  }

  // Starts from what the referee last said and plays it forward. Your newest buttons only apply
  // from the moment you pressed them (age, in frames, of the oldest button the referee hasn't
  // acknowledged), before that you keep doing what the referee already knows. Taps the referee
  // hasn't confirmed are pressed once, on that first frame. The other fighter is assumed to keep
  // doing what they were doing.
  function predict(snapshot, mySide, { held, taps, frames, age = Infinity }) {
    const state = Sim.clone(snapshot);
    const theirs = state.f[1 - mySide].prev;
    const known = state.f[mySide].prev;
    const first = Math.max(0, frames - Math.max(1, Math.min(frames, age)));
    const events = [];
    for (let i = 0; i < frames; i++) {
      const mine = i < first ? known : i === first ? held | taps : held;
      Sim.step(state, mySide === 0 ? mine : theirs, mySide === 0 ? theirs : mine);
      events.push(...state.ev);
    }
    return { state, events };
  }

  return { FRAME, framesAhead, predict };
});
