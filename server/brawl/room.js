import { DurableObject } from "cloudflare:workers";
import { BrawlSession } from "./session.js";

// One of these per match. Plain sockets and a tight timer on purpose: no hibernation and no batching,
// so a button press goes in, gets simulated on the next tick and the answer is on its way back.
export class BrawlRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.session = null;
    this.sockets = [null, null];
    this.timer = null;
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/create") return this.create(request);
    if (path === "/connect") return this.connect(request);
    return new Response("nope", { status: 404 });
  }

  async create(request) {
    if (this.session) return new Response("exists", { status: 409 });
    const spec = await request.json().catch(() => null);
    if (!spec?.id || !Array.isArray(spec.players) || spec.players.length !== 2) return new Response("bad match", { status: 400 });
    this.session = new BrawlSession(spec, {
      now: () => Date.now(),
      send: (side, text) => {
        try {
          this.sockets[side]?.send(text);
        } catch {}
      },
    });
    this.timer = setInterval(() => this.pump(), 5);
    return new Response("ok");
  }

  connect(request) {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    if (!this.session) return new Response("no such match", { status: 404 });
    let who;
    try {
      who = JSON.parse(decodeURIComponent(request.headers.get("x-brawl-user")));
    } catch {
      return new Response("bad user", { status: 400 });
    }
    const side = this.session.sideOf(who.id);
    if (side < 0) return new Response("not in this match", { status: 403 });
    try {
      this.sockets[side]?.close(4000, "replaced");
    } catch {}
    const { 0: client, 1: server } = new WebSocketPair();
    server.accept();
    this.sockets[side] = server;
    server.addEventListener("message", (event) => this.session?.message(side, typeof event.data === "string" ? event.data : ""));
    const gone = () => {
      if (this.sockets[side] !== server) return;
      this.sockets[side] = null;
      this.session?.disconnect(side);
    };
    server.addEventListener("close", gone);
    server.addEventListener("error", gone);
    this.session.connect(side);
    return new Response(null, { status: 101, webSocket: client });
  }

  pump() {
    this.session.tick();
    if (!this.session.isDone()) return;
    clearInterval(this.timer);
    this.timer = null;
    for (const socket of this.sockets) {
      try {
        socket?.close(1000, "done");
      } catch {}
    }
    this.sockets = [null, null];
  }
}
