// SANDRAGON Admin — per-product review moderation. Opened via the
// "Reviews" button on each product row (admin-products.js dispatches
// 'sandragon:open-product-reviews' with the productId/productName).
import { fetchReviews, submitReview, deleteReview } from "../../js/reviews.js";

const modal = document.getElementById('reviewsModal');
const listEl = document.getElementById('adminReviewsList');
const nameEl = document.getElementById('reviewsModalProductName');
const idInput = document.getElementById('reviewsModalProductId');
const starInput = document.getElementById('adminReviewStarInput');

let pendingRating = 0;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

function paintStars(n) {
  starInput.querySelectorAll('[data-star]').forEach(s => {
    const active = +s.dataset.star <= n;
    s.className = active ? 'fas fa-star' : 'far fa-star';
  });
}

starInput.querySelectorAll('[data-star]').forEach(star => {
  star.addEventListener('mouseenter', () => paintStars(+star.dataset.star));
  star.addEventListener('click', () => { pendingRating = +star.dataset.star; paintStars(pendingRating); });
});
starInput.addEventListener('mouseleave', () => paintStars(pendingRating));

function reviewRowHtml(r) {
  const date = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  let stars = '';
  for (let i = 1; i <= 5; i++) stars += `<i class="fas fa-star${i <= r.rating ? '' : ' dim'}"></i>`;
  return `
    <div class="review-item" data-review-id="${r.id}" data-rating="${r.rating}">
      <div class="review-item-top">
        <strong>${escapeHtml(r.name)}</strong>
        ${r.byAdmin ? '<span class="admin-review-badge">Store</span>' : ''}
        <span class="review-stars">${stars}</span>
      </div>
      ${r.comment ? `<p class="review-comment">${escapeHtml(r.comment)}</p>` : ''}
      <div class="review-item-bottom">
        <div class="review-date">${date}</div>
        <button type="button" class="btn small danger" data-delete-review="${r.id}"><i class="fas fa-trash"></i> Delete</button>
      </div>
    </div>
  `;
}

async function renderList(productId) {
  listEl.innerHTML = `<div class="spinner"></div>`;
  try {
    const reviews = await fetchReviews(productId);
    if (!reviews.length) {
      listEl.innerHTML = `<div class="empty-state">No reviews yet for this product.</div>`;
      return;
    }
    listEl.innerHTML = reviews.map(reviewRowHtml).join('');
    listEl.querySelectorAll('[data-delete-review]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this review? This cannot be undone.')) return;
        const row = btn.closest('[data-review-id]');
        const reviewId = row.dataset.reviewId;
        const rating = Number(row.dataset.rating) || 0;
        btn.disabled = true;
        try {
          await deleteReview(productId, reviewId, rating);
          renderList(productId);
        } catch (err) {
          console.error(err);
          alert('Could not delete this review. Please try again.');
          btn.disabled = false;
        }
      });
    });
  } catch (err) {
    console.error('Admin reviews failed to load', err);
    listEl.innerHTML = `<div class="empty-state">Couldn't load reviews right now.</div>`;
  }
}

window.addEventListener('sandragon:open-product-reviews', (e) => {
  const { productId, productName } = e.detail;
  idInput.value = productId;
  nameEl.textContent = productName || '';
  document.getElementById('adminReviewName').value = '';
  document.getElementById('adminReviewComment').value = '';
  pendingRating = 0;
  paintStars(0);
  modal.classList.add('open');
  renderList(productId);
});

document.getElementById('closeReviewsModalBtn').addEventListener('click', () => {
  modal.classList.remove('open');
});
modal.addEventListener('click', (e) => {
  if (e.target === modal) modal.classList.remove('open');
});

document.getElementById('adminSubmitReviewBtn').addEventListener('click', async () => {
  const productId = idInput.value;
  const name = document.getElementById('adminReviewName').value.trim();
  const comment = document.getElementById('adminReviewComment').value.trim();
  if (!pendingRating) { alert('Please select a star rating.'); return; }
  if (!name) { alert('Please enter a reviewer name.'); return; }

  const btn = document.getElementById('adminSubmitReviewBtn');
  btn.disabled = true;
  btn.textContent = 'Posting...';
  try {
    await submitReview(productId, { name, rating: pendingRating, comment, byAdmin: true });
    document.getElementById('adminReviewName').value = '';
    document.getElementById('adminReviewComment').value = '';
    pendingRating = 0;
    paintStars(0);
    renderList(productId);
  } catch (err) {
    console.error(err);
    alert('Could not post this review. Please try again.');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Post Review';
  }
});
