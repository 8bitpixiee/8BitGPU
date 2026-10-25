export const defaultNameplate = { palette: 'lilac', frame: 'scallop', charm: 'sparkle', title: '' };
export function validateNameplate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!['lilac', 'rose', 'mint', 'peach', 'midnight'].includes(value.palette) ||
      !['scallop', 'pill', 'ticket'].includes(value.frame) ||
      !['sparkle', 'heart', 'moon', 'flower', 'wings', 'music', 'disc', 'cash', 'kiss', 'violet-user', 'sunset-user', 'eyes', 'none'].includes(value.charm) ||
      typeof value.title !== 'string' || value.title.length > 28 || /[\r\n\x00-\x1f]/.test(value.title)) return null;
  return { palette: value.palette, frame: value.frame, charm: value.charm, title: value.title.trim() };
}
export function readNameplate(json) {
  try { return validateNameplate(JSON.parse(json)) || { ...defaultNameplate }; }
  catch { return { ...defaultNameplate }; }
}

export async function nameplateFor(db,userId){const row=await db.prepare('SELECT settings_json FROM player_nameplates WHERE user_id=?').bind(userId).first();return readNameplate(row?.settings_json);}
