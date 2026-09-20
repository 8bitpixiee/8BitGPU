const reply = (body, status = 200) => Response.json(body, {status, headers: {'cache-control':'no-store'}});
export async function handleSocial(request, db, user, readBody) {
  await db.exec(`CREATE TABLE IF NOT EXISTS social_pairs (a TEXT NOT NULL,b TEXT NOT NULL,sender TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'pending',PRIMARY KEY(a,b));
CREATE TABLE IF NOT EXISTS social_events (id INTEGER PRIMARY KEY AUTOINCREMENT,recipient TEXT NOT NULL,sender TEXT NOT NULL,kind TEXT NOT NULL,body TEXT NOT NULL DEFAULT '',seen INTEGER NOT NULL DEFAULT 0,created_at INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS social_inbox ON social_events(recipient,id);
CREATE TABLE IF NOT EXISTS social_top (user_id TEXT PRIMARY KEY,ids TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS profile_layouts (user_id TEXT PRIMARY KEY,layout TEXT NOT NULL);`);
  await db.exec('CREATE TABLE IF NOT EXISTS social_migrations (name TEXT PRIMARY KEY);');
  if(!await db.prepare("SELECT 1 FROM social_migrations WHERE name='legacy-friends'").first()) {
    await db.batch([
      db.prepare("INSERT OR IGNORE INTO social_pairs(a,b,sender) SELECT MIN(user_id,friend_id),MAX(user_id,friend_id),user_id FROM player_friends WHERE user_id<>friend_id ORDER BY created_at"),
      db.prepare("INSERT INTO social_events(recipient,sender,kind,body,created_at) SELECT CASE WHEN sender=a THEN b ELSE a END,sender,'request','',? FROM social_pairs WHERE status='pending' AND NOT EXISTS(SELECT 1 FROM social_migrations WHERE name='legacy-friends')").bind(Date.now()),
      db.prepare("INSERT OR IGNORE INTO social_migrations VALUES('legacy-friends')")
    ]);
  }
  const url = new URL(request.url), path = url.pathname, method = request.method;
  const rows = async (sql,...args) => (await db.prepare(sql).bind(...args).all()).results;
  const pair = (id) => [user.id,id].sort();
  const accepted = async (id) => !!await db.prepare("SELECT 1 FROM social_pairs WHERE a=? AND b=? AND status='accepted'").bind(...pair(id)).first();
  const event = (id,kind,body='') => db.prepare('INSERT INTO social_events(recipient,sender,kind,body,created_at) VALUES(?,?,?,?,?)').bind(id,user.id,kind,body,Date.now());
  if (path === '/api/social/top' && method === 'GET') {
    const owner = await db.prepare('SELECT id FROM users WHERE username=?').bind(url.searchParams.get('u') || user?.username || '').first();
    const saved = owner && await db.prepare('SELECT ids FROM social_top WHERE user_id=?').bind(owner.id).first();
    const friends=[];
    for(const id of JSON.parse(saved?.ids || '[]')) {
      const p=[owner.id,id].sort();
      const f=await db.prepare("SELECT id,username FROM users WHERE id=? AND EXISTS(SELECT 1 FROM social_pairs WHERE a=? AND b=? AND status='accepted')").bind(id,...p).first();
      if(f) friends.push(f);
    }
    return reply({friends});
  }
  if (!user) return reply({error:'Sign in to use your social window.'},401);
  if (path === '/api/social/layout') {
    if(method==='GET') return reply({layout:JSON.parse((await db.prepare('SELECT layout FROM profile_layouts WHERE user_id=?').bind(user.id).first())?.layout || '{}')});
    if(method==='PUT') {
      const body=await readBody(request), layout=body?.layout;
      if(!layout || Array.isArray(layout) || typeof layout!=='object' || Object.keys(layout).length>12 || Object.entries(layout).some(([key,p])=> !/^(being|about|favorites|collection|connections|photo[123])$/.test(key)|| !p || !Number.isFinite(p.x)||!Number.isFinite(p.y)||p.x<0||p.x>1||p.y<0||p.y>10000)) return reply({error:'Invalid window arrangement.'},400);
      await db.prepare('INSERT INTO profile_layouts VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET layout=excluded.layout').bind(user.id,JSON.stringify(layout)).run();
      return reply({ok:true});
    }
  }
  if(path==='/api/social/top' && method==='PUT') {
    const body=await readBody(request), ids=body?.ids;
    if(!Array.isArray(ids)||ids.length>8||new Set(ids).size!==ids.length||ids.some(id=>typeof id!=='string')) return reply({error:'Choose up to eight different friends.'},400);
    for(const id of ids) if(!await accepted(id)) return reply({error:'Top 8 must be accepted friends.'},400);
    await db.prepare('INSERT INTO social_top VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET ids=excluded.ids').bind(user.id,JSON.stringify(ids)).run();
    return reply({ok:true});
  }
  if(path==='/api/friends' && method==='GET') {
    const friends=await rows("SELECT u.id,u.username FROM social_pairs p JOIN users u ON u.id=CASE WHEN p.a=? THEN p.b ELSE p.a END WHERE (p.a=? OR p.b=?) AND p.status='accepted' ORDER BY u.username",user.id,user.id,user.id);
    const requests=await rows("SELECT u.id,u.username,p.sender FROM social_pairs p JOIN users u ON u.id=CASE WHEN p.a=? THEN p.b ELSE p.a END WHERE (p.a=? OR p.b=?) AND p.status='pending'",user.id,user.id,user.id);
    return reply({friends,requests:requests.map(r=>({...r,incoming:r.sender!==user.id}))});
  }
  if(path==='/api/friends' && method==='POST') {
    const body=await readBody(request);
    if(typeof body?.username!=='string') return reply({error:'Enter a creature name.'},400);
    const target=await db.prepare('SELECT id,username FROM users WHERE username=?').bind(body.username.trim()).first();
    if(!target) return reply({error:'Account not found.'},404);
    if(target.id===user.id) return reply({error:'Choose another user.'},400);
    const p=pair(target.id);
    await db.batch([event(target.id,'request'),db.prepare("INSERT INTO social_pairs(a,b,sender) VALUES(?,?,?)").bind(...p,user.id)]).catch(async error=>{
      if(!await db.prepare('SELECT 1 FROM social_pairs WHERE a=? AND b=?').bind(...p).first()) throw error;
    });
    return reply({friend:target,pending:!await accepted(target.id)},201);
  }
  const friend=path.match(/^\/api\/friends\/([^/]+)$/);
  if(friend && ['PUT','DELETE'].includes(method)) {
    const p=pair(decodeURIComponent(friend[1]));
    if(method==='DELETE') { await db.prepare('DELETE FROM social_pairs WHERE a=? AND b=?').bind(...p).run(); return reply({ok:true}); }
    const pending=await db.prepare("SELECT sender FROM social_pairs WHERE a=? AND b=? AND status='pending'").bind(...p).first();
    if(!pending||pending.sender===user.id) return reply({error:'Only the recipient can accept this request.'},403);
    await db.batch([db.prepare("UPDATE social_pairs SET status='accepted' WHERE a=? AND b=?").bind(...p),event(pending.sender,'accepted')]);
    return reply({ok:true});
  }
  if(path==='/api/social/events' && method==='GET') return reply({events:await rows('SELECT e.*,u.username FROM social_events e JOIN users u ON u.id=e.sender WHERE recipient=? ORDER BY e.id DESC LIMIT 100',user.id),unread:(await db.prepare('SELECT COUNT(*) AS n FROM social_events WHERE recipient=? AND seen=0').bind(user.id).first()).n});
  if(path==='/api/social/read' && method==='POST') {
    const body=await readBody(request);
    if(!Number.isSafeInteger(body?.through)) return reply({error:'Invalid notification.'},400);
    await db.prepare('UPDATE social_events SET seen=1 WHERE recipient=? AND id<=?').bind(user.id,body.through).run(); return reply({ok:true});
  }
  if(path==='/api/social/messages' && method==='GET') {
    const id=url.searchParams.get('friend');
    if(!id || !await accepted(id)) return reply({error:'Messages are for accepted friends.'},403);
    return reply({messages:(await rows("SELECT e.*,u.username FROM social_events e JOIN users u ON u.id=e.sender WHERE kind='message' AND ((sender=? AND recipient=?) OR (sender=? AND recipient=?)) ORDER BY id DESC LIMIT 60",user.id,id,id,user.id)).reverse()});
  }
  if(path==='/api/social/send' && method==='POST') {
    const body=await readBody(request), id=body?.friend;
    if(typeof id!=='string'||!await accepted(id)) return reply({error:'Only accepted friends can receive messages and invites.'},403);
    if(!['message','invite'].includes(body.kind)||typeof body.body!=='string'||!body.body.trim()||body.body.length>1000 || (body.kind==='invite'&&!['arcade','chat'].includes(body.body))) return reply({error:'Enter a message (up to 1,000 characters) or choose a room.'},400);
    const recent=await db.prepare('SELECT 1 FROM social_events WHERE sender=? AND kind IN (\'message\',\'invite\') AND created_at>?').bind(user.id,Date.now()-1500).first();
    if(recent) return reply({error:'Please wait a moment before sending again.'},429);
    await event(id,body.kind,body.body.trim()).run();return reply({ok:true},201);
  }
  return reply({error:'Not found.'},404);
}
