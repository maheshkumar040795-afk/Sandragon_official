// SANDRAGON — one shared way to get the active product catalog.
// The shop grid, the nav search, the product page ("You may also like")
// and the instant product-page render all read the same cached list, so a
// shopper clicking around never waits for the same Firestore query twice.
import { db, collection, getDocs, query, where } from "./firebase-init.js";
import { readCache, swr, tsMillis } from "./data-cache.js";

const KEY = 'products';

export async function fetchActiveProducts() {
  // No orderBy() in the query: pairing where() with orderBy() on another
  // field needs a composite index. Sort client-side instead.
  const q = query(collection(db, 'products'), where('active', '==', true));
  const snap = await getDocs(q);
  return snap.docs
    .map(d => ({ id: d.id, data: d.data() }))
    .sort((a, b) => tsMillis(b.data.createdAt) - tsMillis(a.data.createdAt));
}

export function getCachedProducts() {
  return readCache(KEY)?.v || null;
}

export function getCachedProduct(id) {
  const list = getCachedProducts();
  return list ? (list.find(x => x.id === id) || null) : null;
}

// Paint from cache immediately (if any), refresh in the background.
export function watchProducts(onData) {
  return swr(KEY, fetchActiveProducts, onData);
}
