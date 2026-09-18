// Singleplayer world slots: named worlds in localStorage.
// Each world record: {id, name, seed (int32), mode, type, created, lastPlayed}.
// The world save itself lives under saveKeyFor(id).

const WORLDS_KEY = 'webcraft_worlds_v1';
const OLD_SAVE_KEY = 'webcraft_save_v1';

export const saveKeyFor = (id) => `webcraft_save_${id}`;

export function newWorldId() {
  return 'w' + Date.now().toString(36) + ((Math.random() * 1296) | 0).toString(36);
}

// Text seed -> int32 (numeric strings pass through, like Minecraft)
export function hashSeed(str) {
  const s = String(str ?? '').trim();
  if (/^-?\d+$/.test(s)) return s | 0;
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 31) + s.charCodeAt(i)) | 0;
  return h;
}

export function loadWorlds() {
  let list = null;
  try { list = JSON.parse(localStorage.getItem(WORLDS_KEY) || 'null'); } catch (e) {}
  if (Array.isArray(list)) return list.filter(w => w && w.id != null).map(w => ({ type: 'normal', ...w }));
  list = [];
  // migrate the pre-slots single save, if any
  try {
    const raw = localStorage.getItem(OLD_SAVE_KEY);
    if (raw) {
      const s = JSON.parse(raw);
      const w = {
        id: 'world1', name: 'Мой мир',
        seed: (s.seed | 0) || 1,
        mode: s.gameMode === 'creative' ? 'creative' : 'survival', type: 'normal',
        created: Date.now(), lastPlayed: Date.now(),
      };
      localStorage.setItem(saveKeyFor(w.id), raw);
      localStorage.removeItem(OLD_SAVE_KEY);
      list.push(w);
      storeWorlds(list);
    }
  } catch (e) { /* corrupted */ }
  return list;
}

export function storeWorlds(list) {
  try { localStorage.setItem(WORLDS_KEY, JSON.stringify(list)); } catch (e) {}
}

export function touchWorld(id) {
  const list = loadWorlds();
  const w = list.find(w => w.id === id);
  if (w) { w.lastPlayed = Date.now(); storeWorlds(list); }
}

export function deleteWorldSave(id) {
  try { localStorage.removeItem(saveKeyFor(id)); } catch (e) {}
}
