// SANDRAGON — shared category list, now admin-managed (Firestore
// `categories` collection) instead of hardcoded. Add/remove categories from
// Admin → Categories and every part of the site (admin product form, nav
// mega-menu, storefront filter pills, related-products logic) picks it up
// automatically — nothing else needs to change.
import { db, collection, getDocs, orderBy, query } from "./firebase-init.js";

// A single shared, mutable array. Other modules do `import { CATEGORIES }`
// and use it synchronously (e.g. `CATEGORIES.map(...)`) right after import —
// that works because the top-level `await refreshCategories()` below blocks
// this module's own evaluation (and therefore every importer's) until the
// first fetch completes, so by the time any importing module runs its own
// top-level code, CATEGORIES is already populated.
export const CATEGORIES = [];

export async function refreshCategories() {
  try {
    const q = query(collection(db, 'categories'), orderBy('createdAt', 'asc'));
    const snap = await getDocs(q);
    const fresh = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    CATEGORIES.length = 0;
    CATEGORIES.push(...fresh);
  } catch (err) {
    console.error('Could not load categories', err);
  }
  return CATEGORIES;
}

await refreshCategories();

export function categoryName(id) {
  const c = CATEGORIES.find(c => c.id === id);
  return c ? c.name : '';
}

export function categoryIcon(id) {
  const c = CATEGORIES.find(c => c.id === id);
  return c ? c.icon : 'fa-tag';
}
