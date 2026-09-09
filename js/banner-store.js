import { db, doc, getDoc, setDoc } from "./firebase-init.js";

const MAX_SLIDES = 6;

// Shown until the admin uploads real banners, so the carousel is never
// empty on a fresh install.
const DEFAULT_SLIDES = [
  { url: "https://res.cloudinary.com/ly0b9cqe/image/upload/v1788887978/add_1.png", mobileUrl: "", link: "" }
];

export async function getBannerSlides() {
  try {
    const snap = await getDoc(doc(db, 'settings', 'banner'));
    if (snap.exists() && Array.isArray(snap.data().slides) && snap.data().slides.length) {
      return snap.data().slides.slice(0, MAX_SLIDES);
    }
  } catch (err) {
    console.error('Could not load banner slides', err);
  }
  return DEFAULT_SLIDES;
}

export async function saveBannerSlides(slides) {
  const trimmed = slides.filter(s => s && s.url).slice(0, MAX_SLIDES);
  await setDoc(doc(db, 'settings', 'banner'), { slides: trimmed });
  return trimmed;
}

export { MAX_SLIDES, DEFAULT_SLIDES };
