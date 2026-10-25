import { DurableObject } from "cloudflare:workers";

const EMOTES = new Set(["dance", "twerk", "smoke", "drink", "shroom", "laugh", "spin", "wave", "crashout"]);
const FACINGS = new Set(["up", "down", "left", "right"]);
const EMOTE_MS = 8000;
const MAX_SEATS = 50;
const STALE_MS = 90000;
const FLUSH_MS = 100;

const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

export class LoungeRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.timer = null;
    this.avatars = new Map();
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/connect") return this.connect(request);
    const body = await request.json().catch(() => ({}));
    if (path === "/kick") this.kick(body.userId, body.reason === "room_changed" ? 4000 : 4003, body.reason === "room_changed" ? "room_changed" : "removed");
    else if (path === "/poke") this.broadcast({ t: "chat" });
    else if (path === "/avatar") await this.setAvatar(body.userId, body.avatar);
    else return new Response("nope", { status: 404 });
    return new Response("ok");
  }

  connect(request) {
    if (request.headers.get("Upgrade") !== "websocket") return new Response("expected websocket", { status: 426 });
    let who;
    try {
      who = JSON.parse(decodeURIComponent(request.headers.get("x-lounge-user")));
    } catch {
      return new Response("bad user", { status: 400 });
    }
    this.kick(who.id, 4000, "replaced");
    if (this.ctx.getWebSockets().length >= MAX_SEATS) return new Response("room full", { status: 503 });
    const { 0: client, 1: server } = new WebSocketPair();
    this.ctx.acceptWebSocket(server);
    const pillow = who.room === "pillow";
    const seed = [...who.id].reduce((n, c) => n + c.charCodeAt(0), 0);
    server.serializeAttachment({
      id: who.id,
      username: who.username,
      owner: Boolean(who.owner),
      room: pillow ? "pillow" : "arcade",
      x: who.from ? (pillow ? 16 : 84) : pillow ? 78 : 36 + (seed % 19),
      y: who.from ? 86 : pillow ? 84 : 66 + (seed % 9),
      facing: "down",
      flying: 0,
      emote: "",
      emoteUntil: 0,
      lastMove: 0,
      lastEmote: 0,
    });
    this.avatars.set(who.id, who.avatar);
    this.ctx.storage.put("a:" + who.id, who.avatar);
    this.schedule(0);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== "string" || raw.length > 300) return;
    let msg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const me = ws.deserializeAttachment();
    if (!me) return;
    const now = Date.now();
    if (msg.t === "pos") {
      if (now - me.lastMove < 50) return;
      if (!Number.isFinite(msg.x) || !Number.isFinite(msg.y)) return;
      me.x = clamp(msg.x, 6, 94);
      me.y = clamp(msg.y, me.room === "pillow" ? 76 : 12, 94);
      me.facing = FACINGS.has(msg.facing) ? msg.facing : "down";
      me.flying = msg.flying === true ? 1 : 0;
      me.lastMove = now;
    } else if (msg.t === "emote") {
      if (!EMOTES.has(msg.emote) || now - me.lastEmote < 500) return;
      me.emote = msg.emote;
      me.emoteUntil = now + EMOTE_MS;
      me.lastEmote = now;
    } else return;
    ws.serializeAttachment(me);
    this.schedule(FLUSH_MS);
  }

  async webSocketClose(ws, code) {
    try {
      ws.close(code === 1005 ? 1000 : code, "bye");
    } catch {}
    await this.dropAvatar(ws);
    this.schedule(0);
  }

  async webSocketError(ws) {
    await this.webSocketClose(ws, 1011);
  }

  kick(userId, code, reason) {
    for (const ws of this.ctx.getWebSockets()) {
      if (ws.deserializeAttachment()?.id !== userId) continue;
      try {
        ws.close(code, reason);
      } catch {}
    }
    this.schedule(0);
  }

  async dropAvatar(closed) {
    const id = closed.deserializeAttachment()?.id;
    const stillHere = this.ctx.getWebSockets().some((ws) => ws !== closed && ws.deserializeAttachment()?.id === id);
    if (!id || stillHere) return;
    this.avatars.delete(id);
    await this.ctx.storage.delete("a:" + id);
  }

  async setAvatar(userId, avatar) {
    if (typeof userId !== "string" || !avatar) return;
    this.avatars.set(userId, avatar);
    await this.ctx.storage.put("a:" + userId, avatar);
    this.schedule(FLUSH_MS);
  }

  schedule(ms) {
    const due = Date.now() + ms;
    if (this.timer && this.due <= due) return;
    clearTimeout(this.timer);
    this.due = due;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.flush();
    }, ms);
  }

  async flush() {
    const now = Date.now();
    const members = [];
    let nextExpiry = Infinity;
    for (const ws of this.ctx.getWebSockets()) {
      const stamp = this.ctx.getWebSocketAutoResponseTimestamp(ws);
      if (stamp && now - stamp.getTime() > STALE_MS) {
        try {
          ws.close(4001, "idle");
        } catch {}
        continue;
      }
      const me = ws.deserializeAttachment();
      if (!me) continue;
      let avatar = this.avatars.get(me.id);
      if (!avatar) {
        avatar = await this.ctx.storage.get("a:" + me.id);
        if (avatar) this.avatars.set(me.id, avatar);
      }
      const live = me.emoteUntil > now;
      if (live) nextExpiry = Math.min(nextExpiry, me.emoteUntil);
      members.push({
        id: me.id,
        username: me.username,
        x: me.x,
        y: me.y,
        facing: me.facing,
        flying: me.flying,
        avatar,
        emote: live ? me.emote : undefined,
        emoteUntil: live ? me.emoteUntil : undefined,
      });
    }
    this.broadcast({ t: "members", members });
    if (nextExpiry !== Infinity) this.schedule(nextExpiry - now + 50);
  }

  broadcast(payload) {
    const text = JSON.stringify(payload);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(text);
      } catch {}
    }
  }
}
