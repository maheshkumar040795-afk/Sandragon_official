import { requireAdmin, setupLogoutButton } from "./admin-auth.js";
import {
  db, collection, getDocs, doc, updateDoc, deleteDoc, orderBy, query, serverTimestamp, runTransaction
} from "../../js/firebase-init.js";
import { exportToExcel, fmtDate } from "./admin-export.js";
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
  // No new points on orders that used points or a coupon.
  if (earnBlockedReason(o)) return 0;
  const coupon = Number(o.coupon?.discountAmount) || 0;
  const redeemed = Number(o.points?.redeemValue) || 0;
  const itemsPaid = (Number(o.subtotal) || 0) - coupon - redeemed;
  return pointsForAmount(itemsPaid, pointsConfig);
}

function earnBlockedReason(o) {
  if (Number(o.points?.redeemed) > 0) return 'it was paid partly with points';
  if (o.coupon?.code || Number(o.coupon?.discountAmount) > 0) return 'a coupon was used';
  return '';
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
  shipped: 'Shipped', delivered: 'Delivered', cancelled: 'Cancelled'
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

// Tabs: New = just placed, Confirmed = confirmed / packed / shipped, Delivered.
const TAB_STATUSES = {
  new: ['placed'],
  confirmed: ['confirmed', 'packed', 'shipped'],
  delivered: ['delivered'],
  cancelled: ['cancelled']
};
let activeTab = 'new';
const selected = new Set();

function tabOf(o) {
  const st = o.status || 'placed';
  return Object.keys(TAB_STATUSES).find(t => TAB_STATUSES[t].includes(st)) || 'new';
}

function ordersInTab(tab = activeTab) {
  return ordersCache.filter(o => tabOf(o) === tab);
}

async function loadOrders() {
  tbody.innerHTML = `<tr><td colspan="7" class="text-center">Loading...</td></tr>`;
  const q = query(collection(db, 'orders'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  ordersCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  // Forget selections for orders that no longer exist.
  [...selected].forEach(id => { if (!ordersCache.some(o => o.id === id)) selected.delete(id); });
  renderOrders();
}

function renderOrders() {
  document.getElementById('countNew').textContent = ordersInTab('new').length;
  document.getElementById('countConfirmed').textContent = ordersInTab('confirmed').length;
  document.getElementById('countDelivered').textContent = ordersInTab('delivered').length;
  document.getElementById('countCancelled').textContent = ordersInTab('cancelled').length;
  document.querySelectorAll('#orderTabs .admin-tab').forEach(t => {
    const on = t.dataset.tab === activeTab;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', on ? 'true' : 'false');
  });

  const rows = ordersInTab();
  if (!rows.length) {
    const label = { new: 'new', confirmed: 'confirmed', delivered: 'delivered', cancelled: 'cancelled' }[activeTab];
    tbody.innerHTML = `<tr><td colspan="7" class="text-center">No ${label} orders.</td></tr>`;
    updateSelectionUi();
    return;
  }

  tbody.innerHTML = rows.map(o => `
    <tr class="${selected.has(o.id) ? 'row-selected' : ''}">
      <td><input type="checkbox" class="order-check" data-id="${o.id}" ${selected.has(o.id) ? 'checked' : ''} aria-label="Select order #${o.id.slice(-8).toUpperCase()}" style="width:auto"></td>
      <td>#${o.id.slice(-8).toUpperCase()}</td>
      <td>${o.customer?.name || ''}<br><span class="stock-note">${o.customer?.phone || ''}</span></td>
      <td>₹${Number(o.totalAmount).toLocaleString('en-IN')}</td>
      <td><span class="badge ${o.status}">${statusLabels[o.status] || o.status}</span>${o.returns && Object.keys(o.returns).length ? `<br><span class="badge returned"><i class="fas fa-rotate-left"></i> Return requested (${Object.keys(o.returns).length})</span>` : ''}${o.status === 'cancelled' && !o.cancelSettled ? '<br><span class="stock-note" style="color:var(--danger)">Needs settling</span>' : ''}</td>
      <td>${o.createdAt?.toDate ? o.createdAt.toDate().toLocaleDateString('en-IN') : '—'}</td>
      <td><button class="btn small outline" data-view="${o.id}">View</button></td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-view]').forEach(btn =>
    btn.addEventListener('click', () => openOrder(btn.dataset.view))
  );
  tbody.querySelectorAll('.order-check').forEach(chk =>
    chk.addEventListener('change', () => {
      if (chk.checked) selected.add(chk.dataset.id); else selected.delete(chk.dataset.id);
      chk.closest('tr').classList.toggle('row-selected', chk.checked);
      updateSelectionUi();
    })
  );
  updateSelectionUi();
}

function updateSelectionUi() {
  const inTab = ordersInTab().map(o => o.id);
  const chosen = inTab.filter(id => selected.has(id));
  const btn = document.getElementById('deleteSelectedBtn');
  btn.disabled = chosen.length === 0;
  btn.innerHTML = `<i class="fas fa-trash"></i> Delete Selected${chosen.length ? ` (${chosen.length})` : ''}`;
  const all = document.getElementById('selectAllOrders');
  all.checked = inTab.length > 0 && chosen.length === inTab.length;
  all.indeterminate = chosen.length > 0 && chosen.length < inTab.length;
}

document.getElementById('orderTabs').addEventListener('click', (e) => {
  const tab = e.target.closest('.admin-tab');
  if (!tab) return;
  activeTab = tab.dataset.tab;
  selected.clear(); // a delete only ever affects what you can see in this tab
  renderOrders();
});

document.getElementById('selectAllOrders').addEventListener('change', (e) => {
  ordersInTab().forEach(o => (e.target.checked ? selected.add(o.id) : selected.delete(o.id)));
  renderOrders();
});

document.getElementById('deleteSelectedBtn').addEventListener('click', async () => {
  const ids = ordersInTab().map(o => o.id).filter(id => selected.has(id));
  if (!ids.length) return;
  const credited = ordersCache.filter(o => ids.includes(o.id) && o.points?.credited && o.points.earned > 0).length;
  const msg = `Delete ${ids.length} order${ids.length > 1 ? 's' : ''}? This cannot be undone.` +
    (credited ? `\n\n${credited} of them already gave points to the customer. Deleting the order does not take those points back.` : '') +
    `\n\nTip: click "Export Excel" first if you want a copy.`;
  if (!confirm(msg)) return;
  const btn = document.getElementById('deleteSelectedBtn');
  btn.disabled = true;
  btn.innerHTML = 'Deleting...';
  const failed = [];
  for (const id of ids) {
    try {
      await deleteDoc(doc(db, 'orders', id));
      selected.delete(id);
    } catch (err) {
      console.error('Delete failed for', id, err);
      failed.push(id);
    }
  }
  if (failed.length) alert(`${failed.length} order(s) could not be deleted. Check the console for details.`);
  await loadOrders();
});

function orderRow(o) {
  return {
    'Order ID': '#' + o.id.slice(-8).toUpperCase(),
    'Placed On': fmtDate(o.createdAt),
    'Status': statusLabels[o.status] || o.status || '',
    'Customer': o.customer?.name || '',
    'Phone': o.customer?.phone || '',
    'Email': o.customer?.email || '',
    'Address': o.customer?.address || '',
    'Pincode': o.customer?.pincode || '',
    'Items': (o.items || []).map(i => `${i.name}${itemVariantLabel(i) ? ' (' + itemVariantLabel(i) + ')' : ''} x${i.qty}`).join('; '),
    'Subtotal (₹)': Number(o.subtotal) || 0,
    'Coupon': o.coupon?.code || '',
    'Coupon Discount (₹)': Number(o.coupon?.discountAmount) || 0,
    'Points Redeemed': Number(o.points?.redeemed) || 0,
    'Points Discount (₹)': Number(o.points?.redeemValue) || 0,
    'Delivery (₹)': Number(o.shippingCharge) || 0,
    'Total Paid (₹)': Number(o.totalAmount) || 0,
    'Points Earned': o.points?.credited ? Number(o.points.earned) || 0 : 0,
    'Payment Mode': o.paymentMode || '',
    'Payment ID': o.paymentId || '',
    'Cancelled By': o.cancelledBy || '',
    'Cancel Reason': o.cancelReason || '',
    'Return Requests': o.returns ? Object.values(o.returns).map(r => `${r.name}: ${r.reason}${r.note ? ' - ' + r.note : ''}`).join('; ') : '',
    'Courier': o.courierName || '',
    'AWB / Tracking': o.awbNumber || ''
  };
}

function itemRows(list) {
  return list.flatMap(o => (o.items || []).map(i => ({
    'Order ID': '#' + o.id.slice(-8).toUpperCase(),
    'Placed On': fmtDate(o.createdAt),
    'Product': i.name,
    'Options': itemVariantLabel(i),
    'Qty': Number(i.qty) || 0,
    'Price (₹)': Number(i.price) || 0,
    'Line Total (₹)': (Number(i.price) || 0) * (Number(i.qty) || 0),
    'Vendor': i.vendorName || '',
    'Customer': o.customer?.name || '',
    'Phone': o.customer?.phone || ''
  })));
}

document.getElementById('exportOrdersBtn').addEventListener('click', () => {
  // Selected orders if any are ticked, otherwise every order in the current tab.
  const inTab = ordersInTab();
  const chosen = inTab.filter(o => selected.has(o.id));
  const list = chosen.length ? chosen : inTab;
  const tabName = { new: 'New', confirmed: 'Confirmed', delivered: 'Delivered', cancelled: 'Cancelled' }[activeTab];
  exportToExcel(`sandragon-orders-${activeTab}`, [
    { name: `${tabName} Orders`, rows: list.map(orderRow) },
    { name: 'Order Items', rows: itemRows(list) }
  ]);
});

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
    const why = earnBlockedReason(o);
    return `${warn}<div class="settings-preview mt-10"><i class="fas fa-coins gold"></i> This order earns no points${why ? ` because ${why}` : ''}.</div>`;
  }
  // Confirmed earlier without points (e.g. while the programme was off): offer to add them now.
  if (o.status !== 'placed') {
    return `${warn}<div class="settings-preview mt-10"><i class="fas fa-coins gold"></i> <strong>${missing} points</strong> have not been added to ${o.customer.phone} yet.
      <button type="button" class="btn small" id="addMissingPointsBtn" style="margin-left:8px"><i class="fas fa-plus"></i> Add Points</button></div>`;
  }
  return `${warn}<div class="settings-preview mt-10"><i class="fas fa-coins gold"></i> <strong>${due} points</strong> will be added to the customer's balance when you click <strong>Mark as Confirmed</strong>.</div>`;
}

function returnsPanelHtml(o) {
  const list = o.returns ? Object.entries(o.returns) : [];
  if (!list.length) return '';
  return `<div class="settings-preview mt-10"><strong><i class="fas fa-rotate-left gold"></i> Return requests</strong>
    ${list.map(([, r]) => `<div class="mt-10">• <strong>${r.name}</strong> x${r.qty}: ${r.reason}${r.note ? ` (${r.note})` : ''}${r.requestedAt?.toDate ? ` <span class="stock-note">· ${r.requestedAt.toDate().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>` : ''}</div>`).join('')}
    <div class="stock-note mt-10">The customer was sent to WhatsApp with these details. Reply there to arrange pickup.</div></div>`;
}

function cancelPanelHtml(o) {
  const by = o.cancelledBy === 'customer' ? 'the customer' : 'admin';
  const when = o.cancelledAt?.toDate ? o.cancelledAt.toDate().toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const redeemed = Number(o.points?.redeemed) || 0;
  const earned = o.points?.credited ? Number(o.points.earned) || 0 : 0;
  const todo = [
    'put the items back in stock',
    redeemed ? `return ${redeemed} redeemed points to the customer` : '',
    earned ? `take back the ${earned} points earned on this order` : ''
  ].filter(Boolean).join(', ');
  return `<div class="coupon-msg err mt-10" style="display:block"><i class="fas fa-circle-xmark"></i> Cancelled by ${by}${when ? ' on ' + when : ''}${o.cancelReason ? `. Reason: ${o.cancelReason}` : ''}.</div>
    ${o.cancelSettled
      ? `<div class="settings-preview mt-10"><i class="fas fa-circle-check gold"></i> Settled: stock restored${redeemed ? `, ${redeemed} points returned` : ''}${earned ? `, ${earned} earned points removed` : ''}.</div>`
      : `<div class="settings-preview mt-10">Settle this cancellation to ${todo}.
          <div class="mt-10"><button type="button" class="btn small" id="settleCancelBtn"><i class="fas fa-rotate"></i> Settle Cancellation</button></div></div>`}`;
}

// Undo a cancelled order's effects exactly once: restock its items, give back
// redeemed points and take back points it earned (never below zero).
async function settleCancellation(orderId) {
  const o = ordersCache.find(x => x.id === orderId);
  if (!o) return;
  const orderRef = doc(db, 'orders', orderId);
  const qtyByProduct = {};
  (o.items || []).forEach(i => { if (i.productId) qtyByProduct[i.productId] = (qtyByProduct[i.productId] || 0) + (Number(i.qty) || 0); });
  const productRefs = Object.keys(qtyByProduct).map(id => [id, doc(db, 'products', id)]);
  const custRef = o.customer?.phone ? doc(db, 'customers', o.customer.phone) : null;
  await runTransaction(db, async (tx) => {
    const orderSnap = await tx.get(orderRef);
    const current = orderSnap.data() || {};
    if (current.cancelSettled || current.status !== 'cancelled') return;
    const productSnaps = [];
    for (const [id, ref] of productRefs) productSnaps.push([id, ref, await tx.get(ref)]);
    const custSnap = custRef ? await tx.get(custRef) : null;

    for (const [id, ref, snap] of productSnaps) {
      if (!snap.exists()) continue;
      const stock = snap.data().stock;
      if (stock === undefined || stock === null) continue; // unlimited stock
      tx.update(ref, { stock: Number(stock) + qtyByProduct[id] });
    }
    const redeemed = Number(current.points?.redeemed) || 0;
    const earned = current.points?.credited ? Number(current.points.earned) || 0 : 0;
    if (custSnap?.exists() && (redeemed || earned)) {
      const bal = Number(custSnap.data().pointsBalance) || 0;
      tx.update(custRef, { pointsBalance: Math.max(0, bal + redeemed - earned) });
    }
    tx.update(orderRef, { cancelSettled: true, cancelSettledAt: serverTimestamp() });
  });
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
    ${o.status === 'cancelled' ? cancelPanelHtml(o) : pointsStatusHtml(o)}
    ${returnsPanelHtml(o)}
  `;
  // A cancelled order has nothing left to confirm, pack or ship.
  document.getElementById('orderSteps').hidden = o.status === 'cancelled';

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

// "Add Points" / "Settle Cancellation" live inside the order body, which is re-rendered each time.
document.getElementById('modalOrderBody').addEventListener('click', async (e) => {
  const btn = e.target.closest('#addMissingPointsBtn');
  if (btn) { runCredit(btn); return; }
  const settle = e.target.closest('#settleCancelBtn');
  if (settle) {
    settle.disabled = true;
    try {
      await settleCancellation(currentOrderId);
    } catch (err) {
      console.error(err);
      alert('Could not settle this cancellation. Check the console for details.');
    }
    await loadOrders();
    openOrder(currentOrderId);
  }
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
