// SANDRAGON — promotional ad banners (distinct from the hero carousel in
// banner-store.js). Each ad is its own Firestore doc in `ads`, so the admin
// can post/remove them one at a time rather than editing a fixed slot grid.
import { db, collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy, serverTimestamp } from "./firebase-init.js";

const ADS_COLLECTION = 'ads';

// Storefront: only active ads, newest first. No composite index needed —
// same reasoning as store.js: filter with where(), sort client-side.
export async function getActiveAds() {
  try {
    const q = query(collection(db, ADS_COLLECTION), where('active', '==', true));
    const snap = await getDocs(q);
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => {
        const ta = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
        const tb = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
        return tb - ta;
      });
  } catch (err) {
    console.error('Could not load ads', err);
    return [];
  }
}

// Admin: every ad regardless of active state.
export async function getAllAds() {
  const q = query(collection(db, ADS_COLLECTION), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function createAd(ad) {
  return addDoc(collection(db, ADS_COLLECTION), { ...ad, createdAt: serverTimestamp() });
}

export async function updateAd(id, ad) {
  return updateDoc(doc(db, ADS_COLLECTION, id), ad);
}

export async function deleteAd(id) {
  return deleteDoc(doc(db, ADS_COLLECTION, id));
}
