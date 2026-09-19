import { db, doc, getDoc, collection, getDocs, query, where } from "./firebase-init.js";
import { addToCart } from "./cart-store.js";
import { categoryName } from "./categories.js";
import { ensureCustomer } from "./account-gate.js";
import { toggleWishlist, isWishlisted } from "./wishlist-store.js";
import { ratingAvg, starsHtml, fetchReviews, submitReview } from "./reviews.js";
import { trackView, renderRecentlyViewed } from "./recently-viewed.js";
import { toast } from "./toast.js";
import { openLightbox } from "./image-lightbox.js";

const container = document.getElementById('pdContainer');
const relatedSection = document.getElementById('relatedSection');
const reviewsSection = document.getElementById('reviewsSection');
const recentSection = document.getElementById('recentlyViewedSection');
const params = new URLSearchParams(window.location.search);
const productId = params.get('id');

let selectedOptions = {}; // { 'Color': 'Black', 'Size': 'M', 'Flavour': 'Mango', ... }
let productData = null;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

// Products saved before the generic "options" system existed only have
// `colors`/`sizes` arrays — treat those as regular option groups so old
// listings keep working exactly as before.
function normalizeOptions(p) {
  if (Array.isArray(p.options) && p.options.length) return p.options;
  const legacy = [];
  if (p.colors?.length) legacy.push({ name: 'Color', values: p.colors });
  if (p.sizes?.length) legacy.push({ name: 'Size', values: p.sizes });
  return legacy;
}

async function loadProduct() {
  if (!productId) {
    container.innerHTML = `<div class="empty-state">Product not found.</div>`;
    return;
  }
  try {
    const snap = await getDoc(doc(db, 'products', productId));
    if (!snap.exists()) {
      container.innerHTML = `<div class="empty-state">This product is no longer available.</div>`;
      return;
    }
    productData = snap.data();
    render();
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="empty-state">Couldn't load this product.</div>`;
  }
}

function render() {
  const p = productData;
  const images = (p.images && p.images.length) ? p.images : ['assets/logo.jpeg'];
  const options = normalizeOptions(p);
  selectedOptions = {};
  const stock = p.stock;
  const inStock = (stock === undefined || stock === null) || Number(stock) > 0;
  const lowStock = inStock && stock !== undefined && stock !== null && Number(stock) <= 5;
  const wished = isWishlisted(productId);
  const avg = ratingAvg(p);

  container.innerHTML = `
    <div class="pd-wrap">
      <div class="pd-gallery">
        <div class="main-img">
          <img id="mainImg" src="${images[0]}" alt="${escapeHtml(p.name)}" style="cursor:zoom-in">
          <button type="button" class="wishlist-heart pd-heart ${wished ? 'active' : ''}" id="pdWishBtn" aria-label="${wished ? 'Remove from' : 'Add to'} wishlist">
            <i class="fa-heart ${wished ? 'fas' : 'far'}"></i>
          </button>
          <button type="button" class="zoom-hint-btn" id="pdZoomBtn" aria-label="View full size"><i class="fas fa-expand"></i></button>
        </div>
        <div class="thumb-row" id="thumbRow">
          ${images.map((img, i) => `<img src="${img}" data-i="${i}" class="${i === 0 ? 'active' : ''}">`).join('')}
        </div>
      </div>
      <div class="pd-info">
        ${p.category ? `<div class="cat-tag" style="position:static;display:inline-flex;margin-bottom:12px">${categoryName(p.category) || p.category}</div>` : ''}
        <h1>${escapeHtml(p.name)}</h1>
        ${starsHtml(avg, Number(p.ratingCount) || 0, 'md')}
        <div class="pd-price">₹${Number(p.price).toLocaleString('en-IN')}</div>
        <p class="pd-desc">${escapeHtml(p.description || '')}</p>

        ${options.map((opt, gi) => `
        <div class="option-group">
          <label>${escapeHtml(opt.name)}</label>
          <div class="option-pills" data-opt-group="${gi}">
            ${opt.values.map(v => `<div class="pill" data-opt-value="${escapeHtml(v)}">${escapeHtml(v)}</div>`).join('')}
          </div>
        </div>`).join('')}

        <div class="option-group">
          <label>Quantity</label>
          <div class="qty-row">
            <button class="qty-btn" id="qtyMinus">−</button>
            <span id="qtyVal">1</span>
            <button class="qty-btn" id="qtyPlus">+</button>
          </div>
          <div class="stock-note ${!inStock ? 'out' : lowStock ? 'low' : ''}" id="stockNote">
            ${!inStock ? 'Out of stock' : lowStock ? `Only ${stock} left — order soon!` : (stock !== undefined && stock !== null ? `${stock} in stock` : '')}
          </div>
        </div>

        <div style="display:flex;gap:10px">
          <button class="btn" id="addToCartBtn" ${inStock ? '' : 'disabled'} style="width:100%">
            <i class="fas fa-shopping-bag"></i> Add to Cart
          </button>
        </div>
      </div>
    </div>
  `;

  // Gallery thumbnail switching
  let currentImgIndex = 0;
  document.querySelectorAll('#thumbRow img').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('#thumbRow img').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.getElementById('mainImg').src = t.src;
      currentImgIndex = +t.dataset.i;
    });
  });

  // Click the main image (or the zoom hint) to open the full-screen,
  // zoomable lightbox — matches the Flipkart-style viewer requested.
  const openGalleryLightbox = () => openLightbox(images, currentImgIndex);
  document.getElementById('mainImg').addEventListener('click', openGalleryLightbox);
  document.getElementById('pdZoomBtn').addEventListener('click', openGalleryLightbox);

  // Wishlist
  document.getElementById('pdWishBtn').addEventListener('click', () => {
    const btn = document.getElementById('pdWishBtn');
    const added = toggleWishlist({ productId, id: productId, name: p.name, image: images[0], price: Number(p.price) });
    btn.classList.toggle('active', added);
    btn.querySelector('i').className = `fa-heart ${added ? 'fas' : 'far'}`;
    toast(added ? `Added "${p.name}" to your wishlist` : `Removed "${p.name}" from your wishlist`, 'wishlist');
  });

  // Option selection (Color, Size, Flavour, Contains, or any custom type
  // the admin added) — one pill group per option, one selection each.
  options.forEach((opt, gi) => {
    const pills = document.querySelectorAll(`[data-opt-group="${gi}"] .pill`);
    pills.forEach(pill => {
      pill.addEventListener('click', () => {
        pills.forEach(pp => pp.classList.remove('active'));
        pill.classList.add('active');
        selectedOptions[opt.name] = pill.dataset.optValue;
      });
    });
    if (opt.values.length === 1) pills[0]?.click();
  });

  // Quantity
  let qty = 1;
  document.getElementById('qtyMinus').addEventListener('click', () => {
    qty = Math.max(1, qty - 1);
    document.getElementById('qtyVal').textContent = qty;
  });
  document.getElementById('qtyPlus').addEventListener('click', () => {
    qty = qty + 1;
    document.getElementById('qtyVal').textContent = qty;
  });

  // Add to cart
  document.getElementById('addToCartBtn').addEventListener('click', () => {
    for (const opt of options) {
      if (!selectedOptions[opt.name]) {
        toast(`Please select a ${opt.name.toLowerCase()}.`, 'error');
        return;
      }
    }
    addToCart({
      productId,
      name: p.name,
      image: images[0],
      price: Number(p.price),
      // Kept for backward compatibility with older cart/order display code
      // that reads these two fields directly; `options` carries everything.
      color: selectedOptions['Color'] || null,
      size: selectedOptions['Size'] || null,
      options: { ...selectedOptions },
      qty,
      vendorName: p.vendorName || '',
      vendorPhone: p.vendorPhone || ''
    });
    toast(`Added "${p.name}" to your cart`, 'success');
    // Gate on identity right after adding — guests get a quick
    // create-account/sign-in step, returning customers sail straight
    // through since ensureCustomer() resolves immediately for them.
    ensureCustomer(() => {
      window.location.href = 'cart.html';
    });
  });

  trackView({ id: productId, name: p.name, image: images[0], price: Number(p.price) });
  if (recentSection) renderRecentlyViewed(recentSection, productId);

  loadRelated(p);
  loadReviews();
}

async function loadRelated(p) {
  if (!relatedSection) return;
  if (!p.category) { relatedSection.innerHTML = ''; return; }
  try {
    const q = query(
      collection(db, 'products'),
      where('active', '==', true),
      where('category', '==', p.category)
    );
    const snap = await getDocs(q);
    const items = snap.docs
      .filter(d => d.id !== productId)
      .slice(0, 4);

    if (!items.length) { relatedSection.innerHTML = ''; return; }

    relatedSection.innerHTML = `
      <h2 class="section-title">You May Also Like</h2>
      <div class="product-grid" id="relatedGrid"></div>
    `;
    const relatedGrid = document.getElementById('relatedGrid');
    items.forEach(docSnap => {
      const rp = docSnap.data();
      const rid = docSnap.id;
      const img = (rp.images && rp.images[0]) || 'assets/logo.jpeg';
      const rAvg = ratingAvg(rp);
      const card = document.createElement('a');
      card.href = `product.html?id=${rid}`;
      card.className = 'product-card';
      card.innerHTML = `
        ${rp.category ? `<span class="cat-tag">${escapeHtml(categoryName(rp.category) || rp.category)}</span>` : ''}
        <div class="img-wrap"><img src="${img}" alt="${escapeHtml(rp.name)}" loading="lazy"></div>
        <div class="info">
          <div class="name">${escapeHtml(rp.name)}</div>
          ${starsHtml(rAvg, Number(rp.ratingCount) || 0, 'sm')}
          <div class="price">₹${Number(rp.price).toLocaleString('en-IN')}</div>
        </div>`;
      relatedGrid.appendChild(card);
    });
  } catch (err) {
    console.error('Related products failed to load', err);
    relatedSection.innerHTML = '';
  }
}

let pendingRating = 0;

function reviewItemHtml(r) {
  const date = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  let stars = '';
  for (let i = 1; i <= 5; i++) stars += `<i class="fas fa-star${i <= r.rating ? '' : ' dim'}"></i>`;
  return `
    <div class="review-item">
      <div class="review-item-top">
        <strong>${escapeHtml(r.name)}</strong>
        ${r.byAdmin ? '<span class="admin-review-badge">Store</span>' : ''}
        <span class="review-stars">${stars}</span>
      </div>
      ${r.comment ? `<p class="review-comment">${escapeHtml(r.comment)}</p>` : ''}
      <div class="review-date">${date}</div>
    </div>
  `;
}

async function loadReviews() {
  if (!reviewsSection) return;
  reviewsSection.innerHTML = `
    <h2 class="section-title">Ratings &amp; Reviews</h2>
    <div class="review-form-card">
      <label>Your Rating</label>
      <div class="review-star-input" id="reviewStarInput">
        ${[1,2,3,4,5].map(i => `<i class="far fa-star" data-star="${i}"></i>`).join('')}
      </div>
      <div class="form-group mt-10"><input type="text" id="reviewName" placeholder="Your name" maxlength="60"></div>
      <div class="form-group"><textarea id="reviewComment" rows="3" placeholder="Share your experience with this product (optional)" maxlength="600"></textarea></div>
      <button class="btn small" id="submitReviewBtn">Submit Review</button>
    </div>
    <div id="reviewsList" class="mt-20"><div class="spinner"></div></div>
  `;

  const starInput = document.getElementById('reviewStarInput');
  pendingRating = 0;
  starInput.querySelectorAll('[data-star]').forEach(star => {
    star.addEventListener('mouseenter', () => paintStars(+star.dataset.star));
    star.addEventListener('click', () => { pendingRating = +star.dataset.star; paintStars(pendingRating); });
  });
  starInput.addEventListener('mouseleave', () => paintStars(pendingRating));

  function paintStars(n) {
    starInput.querySelectorAll('[data-star]').forEach(s => {
      const active = +s.dataset.star <= n;
      s.className = active ? 'fas fa-star' : 'far fa-star';
    });
  }

  document.getElementById('submitReviewBtn').addEventListener('click', async () => {
    const name = document.getElementById('reviewName').value.trim();
    const comment = document.getElementById('reviewComment').value.trim();
    if (!pendingRating) { toast('Please select a star rating.', 'error'); return; }
    if (!name) { toast('Please enter your name.', 'error'); return; }
    const btn = document.getElementById('submitReviewBtn');
    btn.disabled = true;
    btn.textContent = 'Submitting...';
    const ratingGiven = pendingRating;
    try {
      await submitReview(productId, { name, rating: ratingGiven, comment });
      toast('Thanks for your review!', 'success');
      document.getElementById('reviewName').value = '';
      document.getElementById('reviewComment').value = '';
      pendingRating = 0;
      paintStars(0);
      // Refresh both the review list and the on-page average.
      productData.ratingCount = (Number(productData.ratingCount) || 0) + 1;
      productData.ratingSum = (Number(productData.ratingSum) || 0) + ratingGiven;
      const headerRating = document.querySelector('.pd-info .rating-row');
      if (headerRating) headerRating.outerHTML = starsHtml(ratingAvg(productData), productData.ratingCount, 'md');
      renderReviewsList();
    } catch (err) {
      console.error(err);
      toast('Could not submit your review. Please try again.', 'error');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Submit Review';
    }
  });

  renderReviewsList();
}

async function renderReviewsList() {
  const listEl = document.getElementById('reviewsList');
  if (!listEl) return;
  try {
    const reviews = await fetchReviews(productId);
    if (!reviews.length) {
      listEl.innerHTML = `<div class="empty-state">No reviews yet — be the first to share your experience!</div>`;
      return;
    }
    listEl.innerHTML = reviews.map(reviewItemHtml).join('');
  } catch (err) {
    console.error('Reviews failed to load', err);
    listEl.innerHTML = `<div class="empty-state">Couldn't load reviews right now.</div>`;
  }
}

loadProduct();
