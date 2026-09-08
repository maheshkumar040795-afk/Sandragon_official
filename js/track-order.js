import { db, collection, query, where, getDocs, orderBy } from "./firebase-init.js";

const statusLabels = {
  placed: 'Order Placed',
  confirmed: 'Confirmed — Preparing',
  packed: 'Packed',
  shipped: 'Shipped',
  delivered: 'Delivered'
};

async function search(phone) {
  const results = document.getElementById('results');
  results.innerHTML = '<div class="spinner"></div>';
  try {
    const q = query(
      collection(db, 'orders'),
      where('customer.phone', '==', phone),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      results.innerHTML = `<div class="empty-state">No orders found for this number.</div>`;
      return;
    }
    results.innerHTML = '';
    snap.forEach(docSnap => {
      const o = docSnap.data();
      const card = document.createElement('div');
      card.style.cssText = 'background:var(--card);border:1px solid var(--border);border-radius:10px;padding:18px;margin-bottom:14px';
      card.innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <strong>#${docSnap.id.slice(-8).toUpperCase()}</strong>
          <span class="badge ${o.status}">${statusLabels[o.status] || o.status}</span>
        </div>
        <div class="stock-note">${o.items.length} item(s) · ₹${Number(o.totalAmount).toLocaleString('en-IN')}</div>
        ${o.awbNumber ? `<div class="stock-note mt-10">Courier: ${o.courierName || ''} &nbsp; AWB: <span class="gold">${o.awbNumber}</span></div>` : ''}
      `;
      results.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    results.innerHTML = `<div class="empty-state">Couldn't fetch your orders right now.</div>`;
  }
}

document.getElementById('searchBtn').addEventListener('click', () => {
  const phone = document.getElementById('phoneInput').value.trim();
  if (!/^\d{10}$/.test(phone)) { alert('Enter a valid 10-digit number.'); return; }
  search(phone);
});

const params = new URLSearchParams(window.location.search);
const prefillPhone = params.get('phone');
if (prefillPhone) {
  document.getElementById('phoneInput').value = prefillPhone;
  search(prefillPhone);
}
