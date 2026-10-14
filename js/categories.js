// SANDRAGON — shared category list, admin-managed (Firestore `categories`
// collection). Add/remove categories from Admin → Categories and every part
// of the site (admin product form, nav mega-menu, storefront filter pills,
// related-products logic) picks it up automatically.
//
// Speed: this module used to block every page (search, menu, product grid)
// on a Firestore round trip via a top-level await. Now it fills CATEGORIES
// from the last cached copy instantly and refreshes in the background,
// firing a `sandragon:categories-updated` event if anything changed. It only
// waits for the network when there is no cached copy yet (very first visit)
// or on admin pages, where an up-to-date list matters more than speed.
import { db, collection, getDocs, orderBy, query } from "./firebase-init.js";
import { readCache, writeCache } from "./data-cache.js";

const KEY = 'categories';

// A single shared, mutable array other modules import and read synchronously.
export const CATEGORIES = [];

const cached = readCache(KEY);
if (cached && Array.isArray(cached.v)) CATEGORIES.push(...cached.v);

export async function refreshCategories() {
  try {
    const q = query(collection(db, 'categories'), orderBy('createdAt', 'asc'));
    const snap = await getDocs(q);
    const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    const before = JSON.stringify(CATEGORIES.map(c => [c.id, c.name, c.icon, c.image]));
    CATEGORIES.length = 0;
    CATEGORIES.push(...fresh);
    writeCache(KEY, fresh);
    const after = JSON.stringify(CATEGORIES.map(c => [c.id, c.name, c.icon, c.image]));
    if (before !== after) {
      window.dispatchEvent(new CustomEvent('sandragon:categories-updated'));
    }
  } catch (err) {
    console.error('Could not load categories', err);
  }
  return CATEGORIES;
}

export const categoriesReady = refreshCategories();

const isAdminPage = /\/admin\//.test(location.pathname);
if (!CATEGORIES.length || isAdminPage) {
  await categoriesReady;
}

export function categoryName(id) {
  const c = CATEGORIES.find(c => c.id === id);
  return c ? c.name : '';
}

// Always returns a usable Font Awesome class, falling back to the generic
// tag icon so a category never renders with a blank icon.
export function categoryIcon(id) {
  const c = CATEGORIES.find(c => c.id === id);
  return (c && c.icon) ? c.icon : 'fa-tag';
}

// A category's uploaded logo/image, if admin set one ('' otherwise).
export function categoryImage(id) {
  const c = CATEGORIES.find(c => c.id === id);
  return (c && c.image) || '';
}
