import { requireAdmin, setupLogoutButton } from "./admin-auth.js";
import {
  db, collection, getDocs, doc, updateDoc, orderBy, query, serverTimestamp
} from "../../js/firebase-init.js";
import { business } from "../../js/config.js";

requireAdmin(() => loadOrders());
setupLogoutButton();

const tbody = document.getElementById('ordersTableBody');
const modal = document.getElementById('orderModal');
let ordersCache = [];
let currentOrderId = null;

const statusLabels = {
  placed: 'Placed', confirmed: 'Confirmed', packed: 'Packed',
  shipped: 'Shipped', delivered: 'Delivered'
};

async function loadOrders() {
  tbody.innerHTML = `<tr><td colspan="6" class="text-center">Loading...</td></tr>`;
  const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  ordersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  if (!ordersCache.length) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center">No orders yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = ordersCache.map(o => `
    <tr>
      <td>#${o.id.slice(-8).toUpperCase()}</td>
      <td>${o.customer?.name || ''}<br><span class="stock-note">${o.customer?.phone || ''}</span></td>
      <td>₹${Number(o.totalAmount).toLocaleString('en-IN')}</td>
      <td><span class="badge ${o.status}">${statusLabels[o.status] || o.status}</span></td>
      <td>${o.createdAt?.toDate ? o.createdAt.toDate().toLocaleDateString('en-IN') : '—'}</td>
      <td><button class="btn small outline" data-view="${o.id}">View</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-view]').forEach(btn =>
    btn.addEventListener('click', () => openOrder(btn.dataset.view))
  );
}

function buildConfirmMessage(o) {
  const itemLines = o.items.map(i =>
    `• ${i.name}${i.color ? ' (' + i.color : ''}${i.size ? (i.color ? ', ' : ' (') + i.size : ''}${(i.color || i.size) ? ')' : ''} x${i.qty}`
  ).join('\n');
  return `Hi ${o.customer.name}! 🙏 Thank you for shopping with SANDRAGON.\n\nYour order #${o.id.slice(-8).toUpperCase()} has been confirmed:\n${itemLines}\n\nTotal Paid: ₹${Number(o.totalAmount).toLocaleString('en-IN')}\n\nWe're preparing your order now and will share tracking details soon. For any queries, reach us here anytime. 🐉`;
}

function groupItemsByVendor(o) {
  const groups = {};
  o.items.forEach(i => {
    const phone = i.vendorPhone || business.vendorPhone;
    const name = i.vendorName || 'Default Vendor';
    const key = phone;
    if (!groups[key]) groups[key] = { vendorName: name, vendorPhone: phone, items: [] };
    groups[key].items.push(i);
  });
  return Object.values(groups);
}

function buildVendorMessage(o, group) {
  const itemLines = group.items.map(i =>
    `• ${i.name}${i.color ? ' - Color: ' + i.color : ''}${i.size ? ' - Size: ' + i.size : ''} x${i.qty}`
  ).join('\n');
  return `New order to prepare — SANDRAGON #${o.id.slice(-8).toUpperCase()}\n\nItems:\n${itemLines}\n\nShip to:\n${o.customer.name}\n${o.customer.address}\nPincode: ${o.customer.pincode}\nPhone: ${o.customer.phone}\n\nPlease pack and courier at the earliest, and share the AWB/tracking number once dispatched. Thank you!`;
}

function buildDispatchMessage(o) {
  return `Hi ${o.customer.name}! Your SANDRAGON order #${o.id.slice(-8).toUpperCase()} has been shipped. 📦\n\nCourier: ${o.courierName}\nTracking / AWB No: ${o.awbNumber}\n\nThank you for shopping with us! 🐉`;
}

function openOrder(id) {
  const o = ordersCache.find(x => x.id === id);
  if (!o) return;
  currentOrderId = id;

  document.getElementById('modalOrderId').textContent = '#' + o.id.slice(-8).toUpperCase();
  document.getElementById('modalOrderBody').innerHTML = `
    <table style="margin-bottom:16px">
      <thead><tr><th>Item</th><th>Color</th><th>Size</th><th>Qty</th><th>Price</th><th>Vendor</th></tr></thead>
      <tbody>
        ${o.items.map(i => `<tr><td>${i.name}</td><td>${i.color || '—'}</td><td>${i.size || '—'}</td><td>${i.qty}</td><td>₹${i.price}</td><td>${i.vendorName || '—'}${i.vendorPhone ? '<br><span class="stock-note">' + i.vendorPhone + '</span>' : ''}</td></tr>`).join('')}
      </tbody>
    </table>
    <div class="stock-note"><strong>Customer:</strong> ${o.customer.name} · ${o.customer.phone} ${o.customer.email ? '· ' + o.customer.email : ''}</div>
    <div class="stock-note">${o.customer.address}, Pincode ${o.customer.pincode}</div>
    <div class="stock-note">Payment ID: ${o.paymentId}</div>
  `;

  document.getElementById('confirmPreview').textContent = buildConfirmMessage(o);

  const vendorGroups = groupItemsByVendor(o);
  const vendorContainer = document.getElementById('vendorShareContainer');
  vendorContainer.innerHTML = vendorGroups.map((g, gi) => `
    <div style="margin-bottom:14px">
      <div class="stock-note mb-10"><strong>${g.vendorName}</strong> · ${g.vendorPhone}</div>
      <div class="whatsapp-preview">${buildVendorMessage(o, g)}</div>
      <button class="btn small outline" data-vendor-send="${gi}"><i class="fab fa-whatsapp"></i> Share with ${g.vendorName}</button>
    </div>
  `).join('');
  vendorContainer.querySelectorAll('[data-vendor-send]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const g = vendorGroups[+btn.dataset.vendorSend];
      const text = encodeURIComponent(buildVendorMessage(o, g));
      window.open(`https://wa.me/${g.vendorPhone}?text=${text}`, '_blank');
      await updateDoc(doc(db, 'orders', currentOrderId), { vendorShared: true, status: o.status === 'placed' ? 'packed' : o.status });
      await loadOrders();
    });
  });

  document.getElementById('courierNameInput').value = o.courierName || '';
  document.getElementById('awbInput').value = o.awbNumber || '';

  const dispatchPreview = document.getElementById('dispatchPreview');
  const sendDispatchBtn = document.getElementById('sendDispatchWhatsAppBtn');
  if (o.awbNumber) {
    dispatchPreview.textContent = buildDispatchMessage(o);
    dispatchPreview.style.display = 'block';
    sendDispatchBtn.style.display = 'inline-flex';
  } else {
    dispatchPreview.style.display = 'none';
    sendDispatchBtn.style.display = 'none';
  }

  modal.classList.add('open');
}

document.getElementById('closeModalBtn').addEventListener('click', () => modal.classList.remove('open'));

document.getElementById('markConfirmedBtn').addEventListener('click', async () => {
  await updateDoc(doc(db, 'orders', currentOrderId), { status: 'confirmed', confirmedAt: serverTimestamp() });
  await loadOrders();
  openOrder(currentOrderId);
});

document.getElementById('sendConfirmWhatsAppBtn').addEventListener('click', () => {
  const o = ordersCache.find(x => x.id === currentOrderId);
  const text = encodeURIComponent(buildConfirmMessage(o));
  window.open(`https://wa.me/91${o.customer.phone}?text=${text}`, '_blank');
});

document.getElementById('saveDispatchBtn').addEventListener('click', async () => {
  const courierName = document.getElementById('courierNameInput').value.trim();
  const awbNumber = document.getElementById('awbInput').value.trim();
  if (!courierName || !awbNumber) { alert('Enter both courier name and AWB number.'); return; }
  await updateDoc(doc(db, 'orders', currentOrderId), {
    courierName, awbNumber, status: 'shipped', shippedAt: serverTimestamp()
  });
  await loadOrders();
  openOrder(currentOrderId);
});

document.getElementById('sendDispatchWhatsAppBtn').addEventListener('click', () => {
  const o = ordersCache.find(x => x.id === currentOrderId);
  const text = encodeURIComponent(buildDispatchMessage(o));
  window.open(`https://wa.me/91${o.customer.phone}?text=${text}`, '_blank');
});

document.getElementById('markDeliveredBtn').addEventListener('click', async () => {
  await updateDoc(doc(db, 'orders', currentOrderId), { status: 'delivered', deliveredAt: serverTimestamp() });
  await loadOrders();
  openOrder(currentOrderId);
});
