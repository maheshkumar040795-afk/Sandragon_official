import { db, collection, getDocs, query, where } from "./firebase-init.js";
import { getCustomer } from "./customer-store.js";
import { ensureCustomer } from "./account-gate.js";

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

function formatDate(ts) {
  if (!ts?.toDate) return '—';
  return ts.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function paymentModeLabel(o) {
  if (o.paymentMode) return o.paymentMode;
  if (o.paymentId?.startsWith('DEMO_')) return 'Demo Order';
  return 'Online (Razorpay)';
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
      <button class="btn small outline view-tracking-btn" data-id="${id}">
        <i class="fas fa-truck"></i> View Tracking Status
      </button>
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
      ${o.awbNumber ? `<div class="stock-note mt-20">Courier: ${o.courierName || ''} &nbsp; AWB: <span class="gold">${o.awbNumber}</span></div>` : ''}
      <div class="stock-note mt-10">Placed on ${formatDate(o.createdAt)} · ${paymentModeLabel(o)}</div>
      <button class="btn outline mt-20" id="closeTrackingBtn" style="width:100%">Close</button>
    </div>
  `;
  overlay.classList.add('open');
  document.getElementById('closeTrackingBtn').addEventListener('click', () => overlay.classList.remove('open'));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.remove('open'); });
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
  } catch (err) {
    console.error(err);
    listEl.innerHTML = `<div class="empty-state">Couldn't load your orders right now.</div>`;
  }
}

ensureCustomer(loadOrders);
