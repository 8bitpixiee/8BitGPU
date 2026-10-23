// names nobody gets to sign in as, they trigger the Login.exe error window instead
const BOSS_NAMES = ["admin", "administrator"];

export const isBossName = (name) => BOSS_NAMES.includes(String(name ?? "").trim().toLowerCase());
