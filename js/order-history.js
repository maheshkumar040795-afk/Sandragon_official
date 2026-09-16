import { db, collection, getDocs, query, where } from "./firebase-init.js";
import { getCustomer } from "./customer-store.js";
import { ensureCustomer } from "./account-gate.js";
import { submitReview } from "./reviews.js";
import { toast } from "./toast.js";

const STEPS = ['placed', 'confirmed', 'packed', 'shipped', 'delivered'];
const STEP_LABELS = {
  placed: 'Order Placed',
  confirmed: 'Confirmed',
  packed: 'Packed',
  shipped: 'Shipped',
  delivered: 'Delivered'
};
const STEP_ICONS = {
  placed: 'fa-receipt',
  confirmed: 'fa-check',
  packed: 'fa-box',
  shipped: 'fa-truck-fast',
  delivered: 'fa-house-circle-check'
};

const listEl = document.getElementById('orderList');
const REVIEWED_KEY = 'sandragon_reviewed_items';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

function formatDate(ts) {
  if (!ts?.toDate) return '—';
  return ts.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function paymentModeLabel(o) {
  if (o.paymentMode) return o.paymentMode;
  if (o.paymentId?.startsWith('DEMO_')) return 'Demo Order';
  return 'Online (Razorpay)';
}

function orderTotalsHtml(o) {
  // Older orders (placed before this update) won't have these breakdown
  // fields — fall back to just the total in that case rather than showing
  // a misleading ₹0 subtotal/shipping.
  if (o.subtotal === undefined) return '';
  const hasDiscount = o.coupon && o.coupon.discountAmount > 0;
  const shipping = Number(o.shippingCharge) || 0;
  return `
    <div class="order-totals">
      <div><span>Subtotal</span><span>₹${Number(o.subtotal).toLocaleString('en-IN')}</span></div>
      ${hasDiscount ? `<div><span>Coupon (${escapeHtml(o.coupon.code)})</span><span class="gold">-₹${Number(o.coupon.discountAmount).toLocaleString('en-IN')}</span></div>` : ''}
      <div><span>Delivery</span><span>${shipping > 0 ? '₹' + shipping.toLocaleString('en-IN') : 'Free'}</span></div>
      <div class="order-totals-final"><span>Total Paid</span><span>₹${Number(o.totalAmount).toLocaleString('en-IN')}</span></div>
    </div>
  `;
}

function itemLineHtml(i) {
  const variant = [i.color, i.size].filter(Boolean).join(' / ');
  return `
    <div class="order-item-line">
      <img src="${i.image || 'assets/logo.jpeg'}" alt="${escapeHtml(i.name)}">
      <div class="order-item-line-info">
        <div>${escapeHtml(i.name)}</div>
        <div class="meta">${variant ? escapeHtml(variant) + ' &nbsp;·&nbsp; ' : ''}Qty: ${i.qty} &nbsp;·&nbsp; ₹${Number(i.price).toLocaleString('en-IN')}</div>
      </div>
    </div>
  `;
}

function orderCardHtml(id, o) {
  return `
    <div class="order-card" data-id="${id}">
      <div class="order-card-top">
        <strong>#${id.slice(-8).toUpperCase()}</strong>
        <span class="badge ${o.status}">${STEP_LABELS[o.status] || o.status}</span>
      </div>
      <div class="order-card-meta">
        <span>Date: <strong>${formatDate(o.createdAt)}</strong></span>
        <span>Payment: <strong>${paymentModeLabel(o)}</strong></span>
        <span>Items: <strong>${(o.items || []).length}</strong></span>
        <span>Total: <strong>₹${Number(o.totalAmount).toLocaleString('en-IN')}</strong></span>
      </div>
      <div class="order-items-list">
        ${(o.items || []).map(itemLineHtml).join('')}
      </div>
      ${orderTotalsHtml(o)}
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn small outline view-tracking-btn" data-id="${id}">
          <i class="fas fa-truck"></i> View Tracking Status
        </button>
        ${o.status === 'delivered' ? `
        <button class="btn small write-review-btn" data-id="${id}">
          <i class="fas fa-star"></i> Write a Review
        </button>` : ''}
      </div>
    </div>
  `;
}

function stepperHtml(status) {
  const currentIndex = STEPS.indexOf(status);
  return `
    <div class="track-stepper">
      ${STEPS.map((s, i) => `
        <div class="step ${i < currentIndex ? 'done' : ''} ${i === currentIndex ? 'done current' : ''}">
          <div class="dot"><i class="fas ${STEP_ICONS[s]}"></i></div>
          <div class="label">${STEP_LABELS[s]}</div>
        </div>
      `).join('')}
    </div>
  `;
}

function openTrackingModal(id, o) {
  let overlay = document.getElementById('trackingOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'trackingOverlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div class="modal">
      <h3>Order #${id.slice(-8).toUpperCase()}</h3>
      ${stepperHtml(o.status)}
      <div class="order-items-list mt-20">
        ${(o.items || []).map(itemLineHtml).join('')}
      </div>
      ${orderTotalsHtml(o)}
      ${o.awbNumber ? `<div class="stock-note mt-20">Courier: ${o.courierName || ''} &nbsp; AWB: <span class="gold">${o.awbNumber}</span></div>` : ''}
      <div class="stock-note mt-10">Placed on ${formatDate(o.createdAt)} · ${paymentModeLabel(o)}</div>
      <button class="btn outline mt-20" id="closeTrackingBtn" style="width:100%">Close</button>
    </div>
  `;
  overlay.classList.add('open');
  document.getElementById('closeTrackingBtn').addEventListener('click', () => overlay.classList.remove('open'));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); });
}

/* ---------------- Post-delivery review flow ---------------- */

function getReviewedSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem(REVIEWED_KEY)) || []);
  } catch {
    return new Set();
  }
}
function markReviewed(orderId, productId) {
  const set = getReviewedSet();
  set.add(`${orderId}:${productId}`);
  localStorage.setItem(REVIEWED_KEY, JSON.stringify([...set]));
}

function openReviewModal(id, o, customerName) {
  let overlay = document.getElementById('reviewOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'reviewOverlay';
    document.body.appendChild(overlay);
  }
  const reviewedSet = getReviewedSet();
  const items = o.items || [];

  overlay.innerHTML = `
    <div class="modal">
      <h3>Review Your Order</h3>
      <p class="stock-sub mt-10" style="color:var(--muted);font-size:.85rem;margin-bottom:16px">Order #${id.slice(-8).toUpperCase()} — let others know what you thought.</p>
      <div id="reviewItemsWrap">
        ${items.map((i, idx) => {
          const already = reviewedSet.has(`${id}:${i.productId}`);
          return `
          <div class="review-order-item" data-idx="${idx}" data-product="${i.productId}">
            <div class="order-item-line">
              <img src="${i.image || 'assets/logo.jpeg'}" alt="${escapeHtml(i.name)}">
              <div class="order-item-line-info"><div>${escapeHtml(i.name)}</div></div>
            </div>
            ${already ? `<div class="stock-note" style="color:var(--success)"><i class="fas fa-circle-check"></i> Reviewed — thank you!</div>` : `
            <div class="review-star-input small" data-star-input="${idx}">
              ${[1,2,3,4,5].map(n => `<i class="far fa-star" data-star="${n}"></i>`).join('')}
            </div>
            <textarea rows="2" placeholder="Say something about this product (optional)" data-comment="${idx}"></textarea>
            <button class="btn small mt-10" data-submit-review="${idx}">Submit Review</button>
            `}
          </div>`;
        }).join('')}
      </div>
      <button class="btn outline mt-20" id="closeReviewBtn" style="width:100%">Close</button>
    </div>
  `;
  overlay.classList.add('open');
  document.getElementById('closeReviewBtn').addEventListener('click', () => overlay.classList.remove('open'));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); });

  const ratings = {};
  overlay.querySelectorAll('[data-star-input]').forEach(starWrap => {
    const idx = starWrap.dataset.starInput;
    ratings[idx] = 0;
    const paint = (n) => {
      starWrap.querySelectorAll('[data-star]').forEach(s => {
        s.className = (+s.dataset.star <= n) ? 'fas fa-star' : 'far fa-star';
      });
    };
    starWrap.querySelectorAll('[data-star]').forEach(star => {
      star.addEventListener('mouseenter', () => paint(+star.dataset.star));
      star.addEventListener('click', () => { ratings[idx] = +star.dataset.star; paint(ratings[idx]); });
    });
    starWrap.addEventListener('mouseleave', () => paint(ratings[idx]));
  });

  overlay.querySelectorAll('[data-submit-review]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const idx = btn.dataset.submitReview;
      const item = items[idx];
      const rating = ratings[idx];
      if (!rating) { toast('Please select a star rating.', 'error'); return; }
      const comment = overlay.querySelector(`[data-comment="${idx}"]`).value.trim();
      btn.disabled = true;
      btn.textContent = 'Submitting...';
      try {
        await submitReview(item.productId, { name: customerName || 'SANDRAGON Customer', rating, comment });
        markReviewed(id, item.productId);
        toast(`Thanks for reviewing "${item.name}"!`, 'success');
        const wrap = overlay.querySelector(`.review-order-item[data-idx="${idx}"]`);
        wrap.innerHTML = wrap.querySelector('.order-item-line').outerHTML +
          `<div class="stock-note" style="color:var(--success)"><i class="fas fa-circle-check"></i> Reviewed — thank you!</div>`;
      } catch (err) {
        console.error(err);
        toast('Could not submit your review. Please try again.', 'error');
        btn.disabled = false;
        btn.textContent = 'Submit Review';
      }
    });
  });
}

async function loadOrders() {
  const customer = getCustomer();
  if (!customer) return;
  listEl.innerHTML = '<div class="spinner"></div>';
  try {
    const q = query(collection(db, 'orders'), where('customer.phone', '==', customer.phone));
    const snap = await getDocs(q);
    if (snap.empty) {
      listEl.innerHTML = `<div class="empty-state">No orders yet. <a href="index.html" class="gold">Start shopping →</a></div>`;
      return;
    }
    const docs = snap.docs.slice().sort((a, b) => {
      const ta = a.data().createdAt?.toMillis ? a.data().createdAt.toMillis() : 0;
      const tb = b.data().createdAt?.toMillis ? b.data().createdAt.toMillis() : 0;
      return tb - ta;
    });
    listEl.innerHTML = docs.map(d => orderCardHtml(d.id, d.data())).join('');
    listEl.querySelectorAll('.view-tracking-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const docSnap = docs.find(d => d.id === btn.dataset.id);
        openTrackingModal(btn.dataset.id, docSnap.data());
      });
    });
    listEl.querySelectorAll('.write-review-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const docSnap = docs.find(d => d.id === btn.dataset.id);
        openReviewModal(btn.dataset.id, docSnap.data(), customer.name);
      });
    });
  } catch (err) {
    console.error(err);
    listEl.innerHTML = `<div class="empty-state">Couldn't load your orders right now.</div>`;
  }
}

ensureCustomer(loadOrders);
