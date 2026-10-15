// SANDRAGON — landing video settings (settings/hero), set from
// Admin → Banners → Landing Video.  { videoUrl, mobileVideoUrl }
import { db, doc, getDoc, setDoc } from "./firebase-init.js";
import { swr, writeCache } from "./data-cache.js";

export async function getHeroSettings() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'hero'));
    if (snap.exists()) {
      const d = snap.data();
      return { videoUrl: d.videoUrl || '', mobileVideoUrl: d.mobileVideoUrl || '' };
    }
  } catch (err) {
    console.error('Could not load landing video settings', err);
    throw err;
  }
  return { videoUrl: '', mobileVideoUrl: '' };
}

export async function saveHeroSettings({ videoUrl, mobileVideoUrl }) {
  const payload = { videoUrl: videoUrl || '', mobileVideoUrl: mobileVideoUrl || '' };
  await setDoc(doc(db, 'settings', 'hero'), payload);
  writeCache('hero', payload);
  return payload;
}

// Storefront: refresh from Firestore and switch video only if the admin changed it.
export function syncHeroVideo() {
  if (!window.__sdHeroVideo) return;
  swr('hero', getHeroSettings, (cfg, { fromCache }) => {
    if (!fromCache) window.__sdHeroVideo.apply(cfg);
  }).catch(() => {});
}
