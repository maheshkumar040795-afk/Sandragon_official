import { requireAdmin, setupLogoutButton } from "./admin-auth.js";
import {
  db, collection, getDocs, doc, updateDoc, orderBy, query, serverTimestamp, runTransaction
} from "../../js/firebase-init.js";
import { business } from "../../js/config.js";
import { getPointsConfig, pointsForAmount, pointsToRupees } from "../../js/points-store.js";

let pointsConfig = null;
getPointsConfig().then(cfg => {
  pointsConfig = cfg;
  if (currentOrderId && modal.classList.contains('open')) openOrder(currentOrderId);
});

// Points this order earns, worked out here from the order's own amounts and
// the CURRENT admin settings (never from a number the shopper's browser sent).
function earnedPointsFor(o) {
  if (!pointsConfig?.enabled) return 0;
  const coupon = Number(o.coupon?.discountAmount) || 0;
  const redeemed = Number(o.points?.redeemValue) || 0;
  const itemsPaid = (Number(o.subtotal) || 0) - coupon - redeemed;
  return pointsForAmount(itemsPaid, pointsConfig);
}

function pointsLines(o) {
  const p = o.points;
  if (!p?.credited || !(p.earned > 0)) return '';
  const value = pointsConfig?.pointValue ?? 1;
  return `\n\n🪙 You earned *${p.earned} SANDRAGON points* on this order (worth ₹${pointsToRupees(p.earned, { pointValue: value }).toLocaleString('en-IN')}).` +
    (typeof p.balanceAfter === 'number' ? `\nYour points balance: *${p.balanceAfter} points* = ₹${pointsToRupees(p.balanceAfter, { pointValue: value }).toLocaleString('en-IN')}.` : '') +
    `\n1 point = ₹${value}. Use your points at checkout on your next order.`;
}

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

// Shows every selected option (Color, Size, Flavour, Contains, or any
// custom type the admin added). Falls back to the older color/size-only
// fields for orders placed before the generic options system existed.
function itemVariantLabel(i) {
  if (i.options && Object.keys(i.options).length) {
    return Object.entries(i.options).map(([k, v]) => `${k}: ${v}`).join(', ');
  }
  const parts = [];
  if (i.color) parts.push('Color: ' + i.color);
  if (i.size) parts.push('Size: ' + i.size);
  return parts.join(', ');
}

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
  const itemLines = o.items.map(i => {
    const variant = itemVariantLabel(i);
    return `• ${i.name}${variant ? ' (' + variant + ')' : ''} x${i.qty}`;
  }).join('\n');
  const redeemedLine = o.points?.redeemed > 0 ? `\nPoints redeemed: ${o.points.redeemed} (-₹${Number(o.points.redeemValue).toLocaleString('en-IN')})` : '';
  return `Hi ${o.customer.name}! 🙏 Thank you for shopping with SANDRAGON.\n\nYour order #${o.id.slice(-8).toUpperCase()} has been confirmed:\n${itemLines}${redeemedLine}\n\nTotal Paid: ₹${Number(o.totalAmount).toLocaleString('en-IN')}${pointsLines(o)}\n\nWe're preparing your order now and will share tracking details soon. For any queries, reach us here anytime. 🐉`;
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
  const itemLines = group.items.map(i => {
    const variant = itemVariantLabel(i);
    return `• ${i.name}${variant ? ' - ' + variant : ''} x${i.qty}`;
  }).join('\n');
  return `New order to prepare — SANDRAGON #${o.id.slice(-8).toUpperCase()}\n\nItems:\n${itemLines}\n\nShip to:\n${o.customer.name}\n${o.customer.address}\nPincode: ${o.customer.pincode}\nPhone: ${o.customer.phone}\n\nPlease pack and courier at the earliest, and share the AWB/tracking number once dispatched. Thank you!`;
}

function buildDispatchMessage(o) {
  return `Hi ${o.customer.name}! Your SANDRAGON order #${o.id.slice(-8).toUpperCase()} has been shipped. 📦\n\nCourier: ${o.courierName}\nTracking / AWB No: ${o.awbNumber}\n\nThank you for shopping with us! 🐉`;
}

// Points already added to the customer's balance for this order.
function creditedSoFar(o) {
  return o.points?.credited ? Number(o.points.earned) || 0 : 0;
}

function pointsStatusHtml(o) {
  if (!pointsConfig) return '';
  if (!pointsConfig.enabled) {
    return `<div class="coupon-msg err mt-10" style="display:block"><i class="fas fa-triangle-exclamation"></i> The points programme is switched <strong>OFF</strong>, so confirming this order adds no points. Turn it on in <a href="points.html" style="text-decoration:underline">Admin → Points</a>, then come back and click <strong>Add Points</strong>.</div>`;
  }
  const warn = o.points?.shortfall ? `<div class="coupon-msg err" style="display:block">Customer was ${o.points.shortfall} points short when this paid order was saved. Check before confirming.</div>` : '';
  const due = earnedPointsFor(o);
  const done = creditedSoFar(o);
  const missing = Math.max(0, due - done);
  if (done > 0 && missing === 0) {
    return `${warn}<div class="settings-preview mt-10"><i class="fas fa-coins gold"></i> <strong>${done} points</strong> credited to ${o.customer.phone}${typeof o.points.balanceAfter === 'number' ? ` (balance now ${o.points.balanceAfter})` : ''}.</div>`;
  }
  if (due === 0) {
    return `${warn}<div class="settings-preview mt-10"><i class="fas fa-coins gold"></i> This order earns no points.</div>`;
  }
  // Confirmed earlier without points (e.g. while the programme was off): offer to add them now.
  if (o.status !== 'placed') {
    return `${warn}<div class="settings-preview mt-10"><i class="fas fa-coins gold"></i> <strong>${missing} points</strong> have not been added to ${o.customer.phone} yet.
      <button type="button" class="btn small" id="addMissingPointsBtn" style="margin-left:8px"><i class="fas fa-plus"></i> Add Points</button></div>`;
  }
  return `${warn}<div class="settings-preview mt-10"><i class="fas fa-coins gold"></i> <strong>${due} points</strong> will be added to the customer's balance when you click <strong>Mark as Confirmed</strong>.</div>`;
}

// Adds the earned points to the customer's balance. Safe to click more than
// once: it only ever adds the difference between what this order earns and
// what was already added, so points are never given twice. If the programme
// is off it confirms the order but adds nothing and does NOT lock the order,
// so the points can still be added after the programme is switched on.
async function creditPoints(orderId) {
  const o = ordersCache.find(x => x.id === orderId);
  if (!o?.customer?.phone) return;
  const earned = earnedPointsFor(o);
  const orderRef = doc(db, 'orders', orderId);
  const custRef = doc(db, 'customers', o.customer.phone);
  await runTransaction(db, async (tx) => {
    const orderSnap = await tx.get(orderRef);
    const custSnap = await tx.get(custRef);
    const current = orderSnap.data() || {};
    const already = current.points?.credited ? Number(current.points.earned) || 0 : 0;
    const delta = earned - already;
    const statusUpdate = current.status === 'placed' || !current.status
      ? { status: 'confirmed', confirmedAt: serverTimestamp() }
      : {};

    if (!pointsConfig?.enabled || delta <= 0) {
      if (Object.keys(statusUpdate).length) tx.update(orderRef, statusUpdate);
      return;
    }

    const balance = custSnap.exists() ? Number(custSnap.data().pointsBalance) || 0 : 0;
    const earnedTotal = custSnap.exists() ? Number(custSnap.data().pointsEarnedTotal) || 0 : 0;
    const balanceAfter = balance + delta;
    if (custSnap.exists()) {
      tx.update(custRef, { pointsBalance: balanceAfter, pointsEarnedTotal: earnedTotal + delta });
    } else {
      tx.set(custRef, { phone: o.customer.phone, name: o.customer.name || '', pointsBalance: balanceAfter, pointsEarnedTotal: delta, createdAt: serverTimestamp() });
    }
    tx.update(orderRef, {
      ...statusUpdate,
      points: { ...(current.points || {}), earned, credited: true, balanceAfter, creditedAt: serverTimestamp() }
    });
  });
}

async function runCredit(btn) {
  if (btn) btn.disabled = true;
  try {
    pointsConfig = await getPointsConfig(); // always use the latest setting
    await creditPoints(currentOrderId);
  } catch (err) {
    console.error(err);
    alert('Could not confirm the order / add points. Check the console for details.');
  } finally {
    if (btn) btn.disabled = false;
  }
  await loadOrders();
  openOrder(currentOrderId);
}

function openOrder(id) {
  const o = ordersCache.find(x => x.id === id);
  if (!o) return;
  currentOrderId = id;

  document.getElementById('modalOrderId').textContent = '#' + o.id.slice(-8).toUpperCase();
  const hasBreakdown = o.subtotal !== undefined;
  const hasDiscount = o.coupon && o.coupon.discountAmount > 0;
  const shipping = Number(o.shippingCharge) || 0;

  document.getElementById('modalOrderBody').innerHTML = `
    <table style="margin-bottom:16px">
      <thead><tr><th>Item</th><th>Options</th><th>Qty</th><th>Price</th><th>Vendor</th></tr></thead>
      <tbody>
        ${o.items.map(i => `<tr><td>${i.name}</td><td>${itemVariantLabel(i) || '—'}</td><td>${i.qty}</td><td>₹${i.price}</td><td>${i.vendorName || '—'}${i.vendorPhone ? '<br><span class="stock-note">' + i.vendorPhone + '</span>' : ''}</td></tr>`).join('')}
      </tbody>
    </table>
    ${hasBreakdown ? `
    <div class="order-totals mb-10">
      <div><span>Subtotal</span><span>₹${Number(o.subtotal).toLocaleString('en-IN')}</span></div>
      ${hasDiscount ? `<div><span>Coupon (${o.coupon.code})</span><span class="gold">-₹${Number(o.coupon.discountAmount).toLocaleString('en-IN')}</span></div>` : ''}
      ${o.points?.redeemed > 0 ? `<div><span>Points redeemed (${o.points.redeemed})</span><span class="gold">-₹${Number(o.points.redeemValue).toLocaleString('en-IN')}</span></div>` : ''}
      <div><span>Delivery</span><span>${shipping > 0 ? '₹' + shipping.toLocaleString('en-IN') : 'Free'}</span></div>
      <div class="order-totals-final"><span>Total Paid</span><span>₹${Number(o.totalAmount).toLocaleString('en-IN')}</span></div>
    </div>` : ''}
    <div class="stock-note"><strong>Customer:</strong> ${o.customer.name} · ${o.customer.phone} ${o.customer.email ? '· ' + o.customer.email : ''}</div>
    <div class="stock-note">${o.customer.address}, Pincode ${o.customer.pincode}</div>
    <div class="stock-note">Payment ID: ${o.paymentId}</div>
    ${pointsStatusHtml(o)}
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

document.getElementById('markConfirmedBtn').addEventListener('click', (e) => runCredit(e.currentTarget));

// "Add Points" lives inside the order body, which is re-rendered each time.
document.getElementById('modalOrderBody').addEventListener('click', (e) => {
  const btn = e.target.closest('#addMissingPointsBtn');
  if (btn) runCredit(btn);
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
