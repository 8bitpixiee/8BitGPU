// Save window colors without changing profile text, images or avatar data.
export async function saveWindowStyle(db,userId,style){
 await db.prepare(`INSERT INTO player_profile_styles (user_id,background_color,paper_color,panel_color,edge_color,accent_color,ink_color,wallpaper_url,updated_at)
 VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET background_color=excluded.background_color,paper_color=excluded.paper_color,panel_color=excluded.panel_color,edge_color=excluded.edge_color,accent_color=excluded.accent_color,ink_color=excluded.ink_color,wallpaper_url=excluded.wallpaper_url,updated_at=excluded.updated_at`)
 .bind(userId,style.background,style.paper,style.panel,style.edge,style.accent,style.ink,style.wallpaperUrl,Date.now()).run();
}
