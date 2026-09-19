// SANDRAGON — product ratings & reviews.
// Reviews live in products/{productId}/reviews/{reviewId}. To avoid an
// extra read per product on the grid, the average is denormalized onto
// the parent product doc as ratingSum/ratingCount and kept in sync with
// increment() every time a review is submitted.
import {
  db, collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, orderBy,
  serverTimestamp, increment
} from "./firebase-init.js";

export function ratingAvg(p) {
  const count = Number(p.ratingCount) || 0;
  if (!count) return 0;
  return (Number(p.ratingSum) || 0) / count;
}

// Renders a row of star icons (full/half/empty) plus optional review count.
// size: 'sm' (cards) | 'md' (product detail)
export function starsHtml(avg, count, size = 'sm') {
  if (!count) return `<div class="rating-row rating-${size} no-reviews">No reviews yet</div>`;
  let stars = '';
  for (let i = 1; i <= 5; i++) {
    if (avg >= i - 0.25) stars += '<i class="fas fa-star"></i>';
    else if (avg >= i - 0.75) stars += '<i class="fas fa-star-half-stroke"></i>';
    else stars += '<i class="far fa-star"></i>';
  }
  return `
    <div class="rating-row rating-${size}">
      <span class="rating-stars">${stars}</span>
      <span class="rating-count">${avg.toFixed(1)} (${count})</span>
    </div>`;
}

export async function fetchReviews(productId) {
  const q = query(collection(db, 'products', productId, 'reviews'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

export async function submitReview(productId, { name, rating, comment, byAdmin = false }) {
  await addDoc(collection(db, 'products', productId, 'reviews'), {
    name, rating, comment, createdAt: serverTimestamp(),
    ...(byAdmin ? { byAdmin: true } : {})
  });
  // Best-effort aggregate sync — a failure here just means the card-level
  // average lags slightly; the review itself is already saved above.
  try {
    await updateDoc(doc(db, 'products', productId), {
      ratingCount: increment(1),
      ratingSum: increment(rating)
    });
  } catch (err) {
    console.warn('Could not update rating aggregate', err);
  }
}

// Admin-only: removes a review and rolls back its contribution to the
// denormalized rating aggregate so the average/count stay accurate.
export async function deleteReview(productId, reviewId, rating) {
  await deleteDoc(doc(db, 'products', productId, 'reviews', reviewId));
  try {
    await updateDoc(doc(db, 'products', productId), {
      ratingCount: increment(-1),
      ratingSum: increment(-Number(rating) || 0)
    });
  } catch (err) {
    console.warn('Could not update rating aggregate after delete', err);
  }
}
