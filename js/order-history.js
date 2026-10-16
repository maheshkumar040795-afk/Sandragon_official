import { db, collection, getDocs, getDoc, doc, updateDoc, query, where, serverTimestamp, runTransaction } from "./firebase-init.js";
import { business } from "./config.js";
import { getCustomer } from "./customer-store.js";
import { ensureCustomer } from "./account-gate.js";
import { submitReview } from "./reviews.js";
import { toast } from "./toast.js";
import { cld, IMG_FALLBACK } from "./img.js";

const STEPS = ['placed', 'confirmed', 'packed', 'shipped', 'delivered'];
const STEP_LABELS = {
  placed: 'Order Placed',
  confirmed: 'Confirmed',
  packed: 'Packed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled'
};

// Customers can cancel until the order is shipped.
const CANCELLABLE = ['placed', 'confirmed', 'packed'];
// Return requests are allowed for this many days after delivery.
const RETURN_DAYS = 3;
const RETURN_REASONS = ['Damaged product', 'Incorrect colour', 'Incorrect size', 'Other'];
const CANCEL_REASONS = ['Ordered by mistake', 'Changed my mind', 'Delivery is taking too long', 'Want to change size / colour', 'Other'];

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
      ${o.points?.redeemed > 0 ? `<div><span>Points redeemed (${o.points.redeemed})</span><span class="gold">-₹${Number(o.points.redeemValue).toLocaleString('en-IN')}</span></div>` : ''}
      <div><span>Delivery</span><span>${shipping > 0 ? '₹' + shipping.toLocaleString('en-IN') : 'Free'}</span></div>
      <div class="order-totals-final"><span>Total Paid</span><span>₹${Number(o.totalAmount).toLocaleString('en-IN')}</span></div>
      ${o.points?.earned > 0 ? `<div class="order-points"><i class="fas fa-coins"></i> ${o.points.credited ? `Earned ${o.points.earned} points` : `${o.points.earned} points will be added when this order is confirmed`}</div>` : ''}
    </div>
  `;
}

function itemVariantLabel(i) {
  if (i.options && Object.keys(i.options).length) {
    return Object.values(i.options).filter(Boolean).join(' / ');
  }
  return [i.color, i.size].filter(Boolean).join(' / ');
}

// Delivered date + RETURN_DAYS, or null if this order can't be returned.
function returnDeadline(o) {
  if (o.status !== 'delivered' || !o.deliveredAt?.toMillis) return null;
  return new Date(o.deliveredAt.toMillis() + RETURN_DAYS * 24 * 60 * 60 * 1000);
}

function returnControlHtml(orderId, o, i, idx) {
  const req = o.returns?.[idx];
  if (req) {
    const label = req.status === 'accepted' ? 'Return accepted' : req.status === 'rejected' ? 'Return not accepted' : 'Return requested';
    return `<div class="return-status ${req.status || ''}"><i class="fas fa-rotate-left"></i> ${label}: ${escapeHtml(req.reason)}${req.note ? ` (${escapeHtml(req.note)})` : ''}${Number(req.pointsRemoved) && req.status !== 'rejected' ? ` · ${req.pointsRemoved} points removed` : ''}</div>`;
  }
  if (o.status !== 'delivered') return '';
  if (i.returnNotApplicable) return `<div class="return-status muted"><i class="fas fa-ban"></i> Return not applicable for this product</div>`;
  const deadline = returnDeadline(o);
  if (!deadline || Date.now() > deadline.getTime()) return ''; // window closed: no option
  const until = deadline.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  return `<button type="button" class="btn small outline return-btn" data-order="${orderId}" data-idx="${idx}">
      <i class="fas fa-rotate-left"></i> Return
    </button>
    <span class="return-until">Return available until ${until}</span>`;
}

function itemLineHtml(i, idx, orderId, o) {
  const variant = itemVariantLabel(i);
  const controls = orderId ? returnControlHtml(orderId, o, i, idx) : '';
  return `
    <div class="order-item-line">
      <img src="${cld(i.image || 'assets/logo.jpeg', 120)}" data-orig="${i.image || 'assets/logo.jpeg'}" onerror="${IMG_FALLBACK}" alt="${escapeHtml(i.name)}" loading="lazy" decoding="async">
      <div class="order-item-line-info">
        <div>${escapeHtml(i.name)}</div>
        <div class="meta">${variant ? escapeHtml(variant) + ' &nbsp;·&nbsp; ' : ''}Qty: ${i.qty} &nbsp;·&nbsp; ₹${Number(i.price).toLocaleString('en-IN')}</div>
        ${controls ? `<div class="item-actions">${controls}</div>` : ''}
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
        ${(o.items || []).map((i, idx) => itemLineHtml(i, idx, id, o)).join('')}
      </div>
      ${orderTotalsHtml(o)}
      ${o.status === 'cancelled' ? `<div class="cancel-note"><i class="fas fa-circle-xmark"></i> Cancelled${o.cancelledAt?.toDate ? ' on ' + formatDate(o.cancelledAt) : ''}${o.cancelReason ? ': ' + escapeHtml(o.cancelReason) : ''}.${cancelRefundNote(o)}</div>` : ''}
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn small outline view-tracking-btn" data-id="${id}">
          <i class="fas fa-truck"></i> View Tracking Status
        </button>
        ${CANCELLABLE.includes(o.status) ? `
        <button class="btn small outline cancel-order-btn" data-id="${id}">
          <i class="fas fa-xmark"></i> Cancel Order
        </button>` : ''}
        ${o.status === 'delivered' ? `
        <button class="btn small write-review-btn" data-id="${id}">
          <i class="fas fa-star"></i> Write a Review
        </button>` : ''}
      </div>
    </div>
  `;
}

function stepperHtml(status) {
  if (status === 'cancelled') return '';
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
      ${o.status === 'cancelled' ? `<div class="cancel-note mt-20"><i class="fas fa-circle-xmark"></i> This order was cancelled.</div>` : ''}
      <div class="order-items-list mt-20">
        ${(o.items || []).map(i => itemLineHtml(i)).join('')}
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

function cancelRefundNote(o) {
  const parts = [];
  const paidOnline = o.paymentMode && !/demo/i.test(o.paymentMode) && !/cash|cod/i.test(o.paymentMode);
  if (paidOnline) parts.push(' Your refund will go back to your original payment method.');
  if (Number(o.points?.redeemed) > 0) parts.push(` Your ${o.points.redeemed} points will be returned to your balance.`);
  return parts.join('');
}

function ensureOverlay(id) {
  let overlay = document.getElementById(id);
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = id;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); });
  }
  return overlay;
}

function waLink(text) {
  return `https://wa.me/${business.phonePrimary}?text=${encodeURIComponent(text)}`;
}

/* ---------------- Cancel (until shipped) ---------------- */

function openCancelModal(id, o, customer, onDone) {
  const overlay = ensureOverlay('cancelOverlay');
  overlay.innerHTML = `
    <div class="modal">
      <h3>Cancel order #${id.slice(-8).toUpperCase()}?</h3>
      <p class="account-sub">You can cancel any time before your order is shipped.</p>
      <div class="order-items-list">${(o.items || []).map(i => itemLineHtml(i)).join('')}</div>
      <div class="form-group mt-10">
        <label for="cancelReason">Reason (optional)</label>
        <select id="cancelReason">
          <option value="">Choose a reason</option>
          ${CANCEL_REASONS.map(r => `<option>${r}</option>`).join('')}
        </select>
      </div>
      <div class="account-error" id="cancelError" style="display:none"></div>
      <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap">
        <button class="btn danger" id="confirmCancelBtn"><i class="fas fa-xmark"></i> Yes, cancel order</button>
        <button class="btn outline" id="keepOrderBtn">Keep order</button>
      </div>
    </div>`;
  overlay.classList.add('open');
  document.getElementById('keepOrderBtn').addEventListener('click', () => overlay.classList.remove('open'));
  document.getElementById('confirmCancelBtn').addEventListener('click', async () => {
    const btn = document.getElementById('confirmCancelBtn');
    const errEl = document.getElementById('cancelError');
    const reason = document.getElementById('cancelReason').value;
    const msg = `Hi SANDRAGON, please cancel my order #${id.slice(-8).toUpperCase()}.\n\n` +
      `Items:\n${(o.items || []).map(i => `- ${i.name}${itemVariantLabel(i) ? ' (' + itemVariantLabel(i) + ')' : ''} x${i.qty}`).join('\n')}\n` +
      `Total: Rs.${Number(o.totalAmount).toLocaleString('en-IN')}` +
      (reason ? `\nReason: ${reason}` : '') +
      `\n\nName: ${customer?.name || o.customer?.name || ''}\nPhone: ${o.customer?.phone || ''}`;
    // Open WhatsApp straight away, while this is still the shopper's tap
    // (browsers block pop-ups opened after waiting on the network). The
    // store gets the request even if saving the cancellation fails.
    window.open(waLink(msg), '_blank', 'noopener');
    btn.disabled = true;
    btn.textContent = 'Cancelling...';
    let outcome;
    try {
      outcome = await cancelOrderWithPoints(id, reason);
    } catch (err) {
      console.error('Cancel failed', err);
      outcome = { ok: false, code: err?.code || '' };
    }
    if (outcome.ok) {
      overlay.querySelector('.modal').innerHTML = `
        <h3><i class="fas fa-circle-check" style="color:var(--success)"></i> Order cancelled</h3>
        <p class="account-sub">Order #${id.slice(-8).toUpperCase()} has been cancelled and SANDRAGON has been sent the details on WhatsApp.${outcome.pointsRemoved ? ` The ${outcome.pointsRemoved} points earned on this order have been removed from your balance.` : ''}${cancelRefundNote(o)}</p>
        <a class="btn outline" href="${waLink(msg)}" target="_blank" rel="noopener" style="width:100%"><i class="fab fa-whatsapp"></i> Open WhatsApp again</a>
        <button class="btn mt-10" id="closeCancelBtn" style="width:100%">Close</button>`;
      document.getElementById('closeCancelBtn').addEventListener('click', () => overlay.classList.remove('open'));
      toast('Your order has been cancelled.', 'success');
      onDone();
      return;
    }
    if (outcome.reason === 'shipped') {
      errEl.textContent = 'This order has already been shipped, so it can no longer be cancelled online. Your message has been sent to SANDRAGON on WhatsApp.';
    } else {
      // Most often: the store's database rules don't allow online cancel yet.
      // The WhatsApp request already went out, so the store can cancel it.
      overlay.querySelector('.modal').innerHTML = `
        <h3><i class="fab fa-whatsapp" style="color:#25D366"></i> Cancellation request sent</h3>
        <p class="account-sub">We couldn't cancel order #${id.slice(-8).toUpperCase()} automatically, so your cancellation request has been sent to SANDRAGON on WhatsApp. They will cancel it and confirm with you.</p>
        <a class="btn outline" href="${waLink(msg)}" target="_blank" rel="noopener" style="width:100%"><i class="fab fa-whatsapp"></i> Open WhatsApp again</a>
        <button class="btn mt-10" id="closeCancelBtn" style="width:100%">Close</button>`;
      document.getElementById('closeCancelBtn').addEventListener('click', () => overlay.classList.remove('open'));
      return;
    }
    errEl.style.display = 'block';
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-xmark"></i> Yes, cancel order';
  });
}

// Cancels the order and takes back the points it earned, in one transaction:
// either both happen or neither. Redeemed points are given back by the
// admin when the cancellation is settled (a shopper can never add points).
async function cancelOrderWithPoints(id, reason) {
  const orderRef = doc(db, 'orders', id);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists()) return { ok: false, reason: 'missing' };
    const o = snap.data();
    if (!CANCELLABLE.includes(o.status)) return { ok: false, reason: o.status === 'shipped' || o.status === 'delivered' ? 'shipped' : 'closed' };
    const earned = o.points?.credited ? Number(o.points.earned) || 0 : 0;
    const remove = Math.max(0, earned - (Number(o.pointsReversed) || 0));
    let removed = 0;
    if (remove > 0 && o.customer?.phone) {
      const custRef = doc(db, 'customers', o.customer.phone);
      const cust = await tx.get(custRef);
      const bal = cust.exists() ? Number(cust.data().pointsBalance) || 0 : 0;
      removed = Math.min(bal, remove);
      if (removed > 0) tx.update(custRef, { pointsBalance: bal - removed });
    }
    tx.update(orderRef, {
      status: 'cancelled',
      cancelledAt: serverTimestamp(),
      cancelledBy: 'customer',
      cancelReason: reason,
      pointsReversed: (Number(o.pointsReversed) || 0) + removed
    });
    return { ok: true, pointsRemoved: removed };
  });
}

/* ---------------- Return request (within 3 days of delivery) ---------------- */

function openReturnModal(id, o, idx, customer, onDone) {
  const item = o.items[idx];
  const overlay = ensureOverlay('returnOverlay');
  overlay.innerHTML = `
    <div class="modal">
      <h3>Return item</h3>
      <p class="account-sub">Order #${id.slice(-8).toUpperCase()}. Tell us what's wrong and we'll arrange the return.</p>
      <div class="order-items-list">${itemLineHtml(item)}</div>
      <div class="form-group mt-10">
        <label for="returnReason">Reason for return *</label>
        <select id="returnReason">
          <option value="">Select a reason</option>
          ${RETURN_REASONS.map(r => `<option>${r}</option>`).join('')}
        </select>
      </div>
      <div class="form-group" id="returnNoteWrap" hidden>
        <label for="returnNote">Please describe the problem *</label>
        <textarea id="returnNote" rows="3" maxlength="300" placeholder="e.g. Bottle seal was broken"></textarea>
      </div>
      <p class="stock-note">Tapping Send opens WhatsApp with your request ready to send to SANDRAGON. You can attach photos there.</p>
      <div class="account-error" id="returnError" style="display:none"></div>
      <div style="display:flex;gap:10px;margin-top:10px;flex-wrap:wrap">
        <button class="btn" id="sendReturnBtn"><i class="fab fa-whatsapp"></i> Send</button>
        <button class="btn outline" id="cancelReturnBtn">Cancel</button>
      </div>
    </div>`;
  overlay.classList.add('open');
  const reasonSel = document.getElementById('returnReason');
  const noteWrap = document.getElementById('returnNoteWrap');
  reasonSel.addEventListener('change', () => {
    noteWrap.hidden = reasonSel.value !== 'Other';
    document.getElementById('returnError').style.display = 'none';
  });
  document.getElementById('cancelReturnBtn').addEventListener('click', () => overlay.classList.remove('open'));
  document.getElementById('sendReturnBtn').addEventListener('click', async () => {
    const reason = reasonSel.value;
    const note = document.getElementById('returnNote').value.trim();
    const errEl = document.getElementById('returnError');
    if (!reason) { errEl.textContent = 'Please choose a reason.'; errEl.style.display = 'block'; return; }
    if (reason === 'Other' && !note) { errEl.textContent = 'Please describe the problem.'; errEl.style.display = 'block'; return; }
    const deadline = returnDeadline(o);
    if (!deadline || Date.now() > deadline.getTime()) { errEl.textContent = 'The 3-day return window for this order has closed.'; errEl.style.display = 'block'; return; }
    const variant = itemVariantLabel(item);
    const msg = `Hi SANDRAGON, I'd like to return a product.\n\n` +
      `Order: #${id.slice(-8).toUpperCase()}\n` +
      `Product: ${item.name}${variant ? ' (' + variant + ')' : ''}\n` +
      `Qty: ${item.qty}\n` +
      `Reason: ${reason}${note ? ' - ' + note : ''}\n\n` +
      `Name: ${customer?.name || o.customer?.name || ''}\nPhone: ${o.customer?.phone || ''}`;
    // Open WhatsApp first, while this still counts as the shopper's tap
    // (browsers block pop-ups opened after waiting on the network).
    window.open(waLink(msg), '_blank', 'noopener');
    let removed = 0;
    try {
      removed = await requestReturnWithPoints(id, idx, { reason, note, productId: item.productId || '', name: item.name, qty: item.qty });
    } catch (err) {
      console.warn('Return request saved to WhatsApp only', err);
    }
    overlay.classList.remove('open');
    toast(`Return request sent. We will reply on WhatsApp.${removed ? ` ${removed} points earned on this item were removed.` : ''}`, 'success', 5000);
    onDone();
  });
}

// The points an item earned: its share of the order's earned points.
function itemEarnedShare(o, item) {
  const earned = o.points?.credited ? Number(o.points.earned) || 0 : 0;
  const subtotal = Number(o.subtotal) || (o.items || []).reduce((s, i) => s + i.price * i.qty, 0);
  if (!earned || !subtotal) return 0;
  return Math.floor(earned * (item.price * item.qty) / subtotal);
}

// Saves the return request and takes back the points that item earned,
// together. Never removes more than the order earned in total.
async function requestReturnWithPoints(id, idx, request) {
  const orderRef = doc(db, 'orders', id);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(orderRef);
    if (!snap.exists()) return 0;
    const o = snap.data();
    if (o.returns?.[idx]) return 0; // already requested
    const item = o.items[idx];
    const earned = o.points?.credited ? Number(o.points.earned) || 0 : 0;
    const alreadyRemoved = Object.values(o.returns || {}).reduce((s, r) => s + (Number(r.pointsRemoved) || 0), 0) + (Number(o.pointsReversed) || 0);
    let remove = Math.min(itemEarnedShare(o, item), Math.max(0, earned - alreadyRemoved));
    if (remove > 0 && o.customer?.phone) {
      const custRef = doc(db, 'customers', o.customer.phone);
      const cust = await tx.get(custRef);
      const bal = cust.exists() ? Number(cust.data().pointsBalance) || 0 : 0;
      remove = Math.min(bal, remove);
      if (remove > 0) tx.update(custRef, { pointsBalance: bal - remove });
    } else {
      remove = 0;
    }
    tx.update(orderRef, {
      returns: { ...(o.returns || {}), [idx]: { ...request, status: 'requested', pointsRemoved: remove, requestedAt: serverTimestamp() } }
    });
    return remove;
  });
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
              <img src="${cld(i.image || 'assets/logo.jpeg', 120)}" data-orig="${i.image || 'assets/logo.jpeg'}" onerror="${IMG_FALLBACK}" alt="${escapeHtml(i.name)}" loading="lazy" decoding="async">
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

let renderedOnce = false;

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
    // After a cancel/return the list is redrawn: show it at once, no fade-in again.
    if (renderedOnce) listEl.querySelectorAll('.order-card').forEach(c => c.classList.add('reveal', 'in-view'));
    renderedOnce = true;
    listEl.querySelectorAll('.view-tracking-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const docSnap = docs.find(d => d.id === btn.dataset.id);
        openTrackingModal(btn.dataset.id, docSnap.data());
      });
    });
    listEl.querySelectorAll('.cancel-order-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const docSnap = docs.find(d => d.id === btn.dataset.id);
        openCancelModal(btn.dataset.id, docSnap.data(), customer, loadOrders);
      });
    });
    listEl.querySelectorAll('.return-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const docSnap = docs.find(d => d.id === btn.dataset.order);
        openReturnModal(btn.dataset.order, docSnap.data(), +btn.dataset.idx, customer, loadOrders);
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
