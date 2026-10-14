// SANDRAGON — tiny stale-while-revalidate cache on top of localStorage.
//
// Every page used to wait for a fresh Firestore round trip before showing
// anything (products, categories, banners, ads). On a phone that is often
// 0.5-2 s per page. Now each page paints instantly from the last copy it saw,
// then quietly refreshes from Firestore and re-renders only if something
// actually changed. Prices and stock are always re-checked against Firestore
// at checkout (cart.js), so a stale cached copy can never cause a wrong charge.

const PREFIX = 'sd_cache_v1:';

// Firestore Timestamps don't survive JSON, so they're stored as { __ts: ms }
// and revived into a small object with the same toMillis()/toDate() methods
// the rest of the code already calls.
function toPlain(v) {
  if (v === null || typeof v !== 'object') return v;
  if (typeof v.toMillis === 'function') return { __ts: v.toMillis() };
  if (Array.isArray(v)) return v.map(toPlain);
  const out = {};
  for (const k of Object.keys(v)) {
    if (typeof v[k] === 'function') continue;
    out[k] = toPlain(v[k]);
  }
  return out;
}

function makeTs(ms) {
  return { __ts: ms, seconds: Math.floor(ms / 1000), toMillis: () => ms, toDate: () => new Date(ms) };
}

function revive(v) {
  if (v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map(revive);
  if (typeof v.__ts === 'number' && Object.keys(v).length === 1) return makeTs(v.__ts);
  const out = {};
  for (const k of Object.keys(v)) out[k] = revive(v[k]);
  return out;
}

export function readCache(key) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return { t: parsed.t, raw: JSON.stringify(parsed.v), v: revive(parsed.v) };
  } catch {
    return null;
  }
}

export function writeCache(key, value) {
  try {
    const plain = toPlain(value);
    localStorage.setItem(PREFIX + key, JSON.stringify({ t: Date.now(), v: plain }));
    return JSON.stringify(plain);
  } catch {
    // Storage full or disabled (private mode): caching is a bonus, never a requirement.
    return null;
  }
}

// Calls onData(cachedValue, { fromCache: true }) synchronously when a cached
// copy exists, then fetches fresh data and calls onData(fresh, { fromCache: false })
// only when it differs from what was already shown. Returns the fetch promise.
export function swr(key, fetcher, onData) {
  const hit = readCache(key);
  if (hit) {
    try { onData(hit.v, { fromCache: true, age: Date.now() - hit.t }); } catch (e) { console.error(e); }
  }
  return fetcher().then(fresh => {
    const freshRaw = writeCache(key, fresh) ?? JSON.stringify(toPlain(fresh));
    if (!hit || hit.raw !== freshRaw) onData(revive(JSON.parse(freshRaw)), { fromCache: false });
    return fresh;
  }).catch(err => {
    if (!hit) throw err;
    console.warn(`Using cached ${key}; refresh failed`, err);
    return hit.v;
  });
}

export function tsMillis(v) {
  if (!v) return 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  if (typeof v.__ts === 'number') return v.__ts;
  return 0;
}
