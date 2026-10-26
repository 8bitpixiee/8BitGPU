import { SELF_BADGES } from './badges.js';
export const defaultNameplate = {"palette":"lilac","frame":"ticket","charm":"none","title":"","colors":{"background":{"h":270,"s":22,"l":24},"border":{"h":270,"s":26,"l":65},"name":{"h":275,"s":30,"l":92},"title":{"h":270,"s":22,"l":78}},"visibleBadges":null};
const ids = [...SELF_BADGES, 'pixiee-pal', 'pickle-pal', 'crew'];
export function validateNameplate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  if (!['lilac','rose','mint','peach','midnight'].includes(value.palette) ||
      !['scallop','pill','ticket'].includes(value.frame) ||
      !['sparkle','heart','moon','flower','wings','music','disc','cash','kiss','violet-user','sunset-user','eyes','none'].includes(value.charm) ||
      typeof value.title !== 'string' || value.title.length > 28 || /[\r\n\x00-\x1f]/.test(value.title)) return null;
  const colors = value.colors ?? defaultNameplate.colors;
  if (!colors || typeof colors !== 'object' || Array.isArray(colors)) return null;
  const cleanColors = {};
  for (const key of ['background','border','name','title']) {
    const c=colors[key];
    if (!c || !['h','s','l'].every(k=>typeof c[k]==='number' && Number.isFinite(c[k]) && c[k]>=0 && c[k]<=(k==='h'?360:100))) return null;
    cleanColors[key]={h:c.h,s:c.s,l:c.l};
  }
  const visible=value.visibleBadges ?? null;
  if (visible!==null && (!Array.isArray(visible) || visible.length>ids.length || new Set(visible).size!==visible.length || !visible.every(id=>ids.includes(id)))) return null;
  return {palette:value.palette,frame:value.frame,charm:value.charm,title:value.title.trim(),colors:cleanColors,visibleBadges:visible===null?null:[...visible]};
}
export function readNameplate(json) {try{return validateNameplate(JSON.parse(json)) || structuredClone(defaultNameplate);}catch{return structuredClone(defaultNameplate);}}
export async function nameplateFor(db,userId){const row=await db.prepare('SELECT settings_json FROM player_nameplates WHERE user_id=?').bind(userId).first();return readNameplate(row?.settings_json);}
