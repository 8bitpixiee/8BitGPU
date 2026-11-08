import { DurableObject } from "cloudflare:workers";
import { GAMES } from "./config.js";

const MAX_BYTES = 65536;
const MAX_PER_SECOND = 60;

// Generic relay room for multiplayer games and collaborative drawing. One per game + room code.
// Clients talk to each other through it, the server only checks who is in, who is host, and slows spam.
//   server -> client:  {t:"hello", id, host, players:[{id,username}]}  {t:"join", player, host}  {t:"leave", id, host}
//                      {t:"msg", from, data}
//   client -> server:  {t:"msg", to?: playerId, data: anything json}
export class GameRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  players() {
    return this.ctx.getWebSockets().map((ws) => ws.deserializeAttachment()).filter(Boolean);
  }

  async fetch(request) {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    const who = JSON.parse(decodeURIComponent(request.headers.get("x-game-user") || "null"));
    const game = request.headers.get("x-game") || "";
    const max = GAMES[game]?.max || 0;
    if (!who?.id || !max) return new Response("no such game", { status: 404 });
    // one seat per account, a second tab replaces the first
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.deserializeAttachment()?.id === who.id) {
        try {
          ws.close(4000, "opened elsewhere");
        } catch {}
      }
    }
    const others = this.players().filter((p) => p.id !== who.id);
    if (others.length >= max) return new Response("room is full", { status: 409 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    const me = { id: who.id, username: who.username, joined: Date.now(), n: 0, sec: 0 };
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment(me);
    const host = [...others, me].sort((a, b) => a.joined - b.joined)[0].id;
    server.send(JSON.stringify({ t: "hello", id: me.id, host, players: [...others, me].map(({ id, username }) => ({ id, username })) }));
    this.broadcast({ t: "join", player: { id: me.id, username: me.username }, host }, me.id);
    return new Response(null, { status: 101, webSocket: client });
  }

  broadcast(payload, exceptId) {
    const text = JSON.stringify(payload);
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.deserializeAttachment()?.id === exceptId) continue;
      try {
        ws.send(text);
      } catch {}
    }
  }

  async webSocketMessage(ws, raw) {
    const me = ws.deserializeAttachment();
    if (!me || typeof raw !== "string" || raw.length > MAX_BYTES) return;
    const now = Math.floor(Date.now() / 1000);
    if (me.sec !== now) {
      me.sec = now;
      me.n = 0;
    }
    if (++me.n > MAX_PER_SECOND) return ws.serializeAttachment(me);
    ws.serializeAttachment(me);
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg?.t !== "msg") return;
    const out = JSON.stringify({ t: "msg", from: me.id, data: msg.data });
    for (const other of this.ctx.getWebSockets()) {
      const target = other.deserializeAttachment();
      if (!target || target.id === me.id) continue;
      if (typeof msg.to === "string" && target.id !== msg.to) continue;
      try {
        other.send(out);
      } catch {}
    }
  }

  async webSocketClose(ws, code) {
    const me = ws.deserializeAttachment();
    try {
      ws.close(code === 1005 ? 1000 : code, "bye");
    } catch {}
    if (!me) return;
    const left = this.players().filter((p) => p.id !== me.id);
    const host = left.sort((a, b) => a.joined - b.joined)[0]?.id || null;
    this.broadcast({ t: "leave", id: me.id, host }, me.id);
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws, 1011);
  }
}
