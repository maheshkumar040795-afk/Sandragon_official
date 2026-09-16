// SANDRAGON — admin-configurable delivery charge, same pattern as
// banner-store.js. Lives at settings/shipping so it's public-read,
// admin-write like every other settings doc.
import { db, doc, getDoc, setDoc } from "./firebase-init.js";

// Sane defaults so checkout still works before the admin has configured
// anything: orders under ₹499 pay a flat ₹50 delivery charge, ₹499+ ships free.
const DEFAULT_CONFIG = { freeThreshold: 499, flatCharge: 50 };

let cached = null;

export async function getShippingConfig() {
  if (cached) return cached;
  try {
    const snap = await getDoc(doc(db, 'settings', 'shipping'));
    if (snap.exists()) {
      const d = snap.data();
      cached = {
        freeThreshold: Number(d.freeThreshold) || 0,
        flatCharge: Number(d.flatCharge) || 0
      };
      return cached;
    }
  } catch (err) {
    console.error('Could not load shipping config', err);
  }
  cached = DEFAULT_CONFIG;
  return cached;
}

export async function saveShippingConfig({ freeThreshold, flatCharge }) {
  const payload = { freeThreshold: Number(freeThreshold) || 0, flatCharge: Number(flatCharge) || 0 };
  await setDoc(doc(db, 'settings', 'shipping'), payload);
  cached = payload;
  return payload;
}

// Given a cart subtotal (before any coupon discount), returns the shipping
// charge to apply — 0 once the subtotal reaches the free-shipping threshold.
export function computeShippingCharge(subtotal, config) {
  if (config.freeThreshold > 0 && subtotal >= config.freeThreshold) return 0;
  return config.flatCharge;
}

export { DEFAULT_CONFIG };
