import { portrait } from "./chat-avatar.js";
const reply = (body, status = 200) => Response.json(body, {status, headers: {'cache-control':'no-store'}});
const ids = value => String(value || '').split(',').map(x => x.trim()).filter(Boolean);

export async function ensureChatSchema(db) {
  await db.exec(`CREATE TABLE IF NOT EXISTS chat_members (user_id TEXT PRIMARY KEY, adult_at INTEGER NOT NULL, muted_until INTEGER NOT NULL DEFAULT 0, banned INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS chat_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL, body TEXT NOT NULL, created_at INTEGER NOT NULL, deleted INTEGER NOT NULL DEFAULT 0);
CREATE INDEX IF NOT EXISTS chat_messages_user_time ON chat_messages(user_id, created_at);
CREATE TABLE IF NOT EXISTS chat_blocks (user_id TEXT NOT NULL, blocked_id TEXT NOT NULL, PRIMARY KEY(user_id, blocked_id));
CREATE TABLE IF NOT EXISTS chat_reports (message_id INTEGER NOT NULL, reporter_id TEXT NOT NULL, reason TEXT NOT NULL, created_at INTEGER NOT NULL, resolved INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(message_id, reporter_id));`);
}

export async function handleChat(request, env, user, readBody) {
  if (!user) return reply({error:'Sign in to enter Chat.exe.'},401);
  const owner = ids(env.CHAT_OWNER_IDS).includes(user.id);
  if (env.CHAT_ENABLED !== 'true' || (!owner && !ids(env.CHAT_TEST_USER_IDS).includes(user.id))) {
    return reply({error:'Chat.exe is in private testing. Ask the owner for access.', code:'private_test'},403);
  }
  const db = env.DB;
  await ensureChatSchema(db);
  const path = new URL(request.url).pathname;
  let member = await db.prepare('SELECT * FROM chat_members WHERE user_id = ?').bind(user.id).first();
  if (member?.banned) return reply({error:'Your access to this chat room has been suspended.'},403);
  if (path === '/api/chat/join' && request.method === 'POST') {
    const body = await readBody(request);
    if (body?.adult !== true || body?.rules !== true) return reply({error:'Confirm you are 18 or older and accept the room rules.'},400);
    await db.prepare('INSERT OR IGNORE INTO chat_members (user_id,adult_at) VALUES (?,?)').bind(user.id,Date.now()).run();
    return reply({ok:true});
  }
  if (!member) return reply({error:'This community is for adults 18+. Please accept the room rules.',code:'join_required'},403);
  if (path === '/api/chat/messages' && request.method === 'GET') {
    const rows = await db.prepare(`SELECT m.id,m.user_id AS userId,u.username,m.body,m.created_at AS createdAt,p.avatar_json AS avatar
      FROM chat_messages m JOIN users u ON u.id=m.user_id LEFT JOIN player_data p ON p.user_id=m.user_id
      WHERE m.deleted=0 AND NOT EXISTS (SELECT 1 FROM chat_blocks b WHERE b.user_id=? AND b.blocked_id=m.user_id)
      ORDER BY m.id DESC LIMIT 60`).bind(user.id).all();
    const blocks = await db.prepare('SELECT b.blocked_id AS id,u.username FROM chat_blocks b JOIN users u ON u.id=b.blocked_id WHERE b.user_id=?').bind(user.id).all();
    return reply({messages:rows.results.reverse().map(({avatar,...message})=>({...message,portrait:portrait(avatar)})),blocks:blocks.results,user:{id:user.id,username:user.username},owner,mutedUntil:member.muted_until});
  }
  if (path === '/api/chat/messages' && request.method === 'POST') {
    if (member.muted_until > Date.now()) return reply({error:'You are temporarily muted.'},403);
    const body = await readBody(request);
    const message = typeof body?.message === 'string' ? body.message.trim() : '';
    if (!message || message.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(message)) return reply({error:'Write a message between 1 and 500 characters.'},400);
    // A single conditional insert serializes the cooldown even across parallel requests.
    const now=Date.now();
    const result = await db.prepare(`INSERT INTO chat_messages (user_id,body,created_at)
      SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM chat_messages WHERE user_id=? AND created_at>?)
      AND EXISTS (SELECT 1 FROM chat_members WHERE user_id=? AND banned=0 AND muted_until<=?)`).bind(user.id,message,now,user.id,now-3000,user.id,now).run();
    if (!result.meta.changes) return reply({error:'Wait a few seconds before sending another message.'},429);
    return reply({ok:true},201);
  }
  if (path === '/api/chat/block' && request.method === 'POST') {
    const body=await readBody(request);
    const target=typeof body?.userId === 'string' && await db.prepare('SELECT id FROM users WHERE id=?').bind(body.userId).first();
    if (!target || target.id === user.id) return reply({error:'Choose another member.'},400);
    if(body.blocked === false) await db.prepare('DELETE FROM chat_blocks WHERE user_id=? AND blocked_id=?').bind(user.id,target.id).run();
    else await db.prepare('INSERT OR IGNORE INTO chat_blocks (user_id,blocked_id) VALUES (?,?)').bind(user.id,target.id).run();
    return reply({ok:true});
  }
  if (path === '/api/chat/report' && request.method === 'POST') {
    const body=await readBody(request);
    if (!Number.isSafeInteger(body?.messageId) || typeof body?.reason !== 'string' || !body.reason.trim() || body.reason.length>300) return reply({error:'Choose a message and give a short reason (up to 300 characters).'},400);
    const message=await db.prepare('SELECT id FROM chat_messages WHERE id=? AND deleted=0').bind(body.messageId).first();
    if(!message) return reply({error:'That message is no longer available.'},404);
    await db.prepare('INSERT OR IGNORE INTO chat_reports (message_id,reporter_id,reason,created_at) VALUES (?,?,?,?)').bind(message.id,user.id,body.reason.trim(),Date.now()).run();
    return reply({ok:true});
  }
  if (path === '/api/chat/moderation') {
    if(!owner) return reply({error:'Owner access required.'},403);
    if(request.method==='GET') {
      const reports=await db.prepare(`SELECT r.message_id AS messageId,r.reporter_id AS reporterId,r.reason,m.body,m.user_id AS userId,u.username FROM chat_reports r JOIN chat_messages m ON m.id=r.message_id JOIN users u ON u.id=m.user_id WHERE r.resolved=0 ORDER BY r.created_at LIMIT 100`).all();
      const members=await db.prepare('SELECT c.user_id AS id,u.username,c.banned,c.muted_until AS mutedUntil FROM chat_members c JOIN users u ON u.id=c.user_id WHERE c.banned=1 OR c.muted_until>?').bind(Date.now()).all();
      return reply({reports:reports.results,members:members.results});
    }
    if(request.method==='POST') {
      const body=await readBody(request);
      if(body?.action==='delete' || body?.action==='resolve') {
        if(!Number.isSafeInteger(body.messageId))return reply({error:'Invalid message.'},400);
        if(body.action==='delete') await db.prepare('UPDATE chat_messages SET deleted=1 WHERE id=?').bind(body.messageId).run();
        await db.prepare('UPDATE chat_reports SET resolved=1 WHERE message_id=?').bind(body.messageId).run();
      } else if(['mute','unmute','ban','unban'].includes(body?.action)) {
        if(typeof body.userId!=='string' || ids(env.CHAT_OWNER_IDS).includes(body.userId))return reply({error:'Choose a non-owner member.'},400);
        if(body.action==='mute'||body.action==='unmute')await db.prepare('UPDATE chat_members SET muted_until=? WHERE user_id=?').bind(body.action==='mute'?Date.now()+3600000:0,body.userId).run();
        else await db.prepare('UPDATE chat_members SET banned=? WHERE user_id=?').bind(body.action==='ban'?1:0,body.userId).run();
      } else return reply({error:'Unknown moderation action.'},400);
      return reply({ok:true});
    }
  }
  return reply({error:'Chat endpoint not found.'},404);
}

