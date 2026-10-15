import { db, collection, addDoc, doc, getDoc, setDoc, updateDoc, increment, serverTimestamp, runTransaction } from "./firebase-init.js";
import { getCart, saveCart, removeFromCart, updateQty, clearCart, cartTotal } from "./cart-store.js";
import { razorpayConfig, functionsBaseUrl, business } from "./config.js";
import { getCustomer, saveCustomer } from "./customer-store.js";
import { toast } from "./toast.js";
import { getShippingConfig, computeShippingCharge, DEFAULT_CONFIG } from "./shipping-store.js";
import { cld, IMG_FALLBACK } from "./img.js";
import { inr, mrpOf } from "./pricing.js";
import { getPointsConfig, fetchPointsBalance, pointsForAmount, pointsToRupees, DEFAULT_POINTS } from "./points-store.js";

// DEMO MODE: while Razorpay keys are still placeholders, checkout skips the real
// payment gateway and creates the order directly — so the full customer → admin
// flow can be tested before Razorpay is configured. Remove automatically once
// real keys are set in config.js.
const DEMO_MODE = razorpayConfig.keyId === "YOUR_RAZORPAY_KEY_ID" || !razorpayConfig.keyId;

if (DEMO_MODE) {
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('payBtn');
    if (btn) btn.innerHTML = '<i class="fas fa-flask"></i> Place Order (Demo Mode — No Payment)';
    const note = document.querySelector('.cart-summary .stock-note');
    if (note) note.innerHTML = '⚠️ Demo mode: Razorpay isn\'t configured yet, so this places a test order with no real payment.';
  });
}

const cartItemsEl = document.getElementById('cartItems');
const checkoutSection = document.getElementById('checkoutSection');

let appliedCoupon = null; // { code, type, value, discountAmount }
let shippingConfig = DEFAULT_CONFIG; // replaced once the admin's real config loads
let pointsConfig = { ...DEFAULT_POINTS };
let pointsBalance = 0;          // fresh from Firestore for the checkout phone number
let pointsBalancePhone = '';
let redeemOn = false;           // shopper clicked "Redeem"

// Shows every selected option (Color, Size, Flavour, Contains, or any
// custom type the admin added). Falls back to the older color/size-only
// fields for cart items added before the generic options system existed.
function optionsMetaHtml(item) {
  if (item.options && Object.keys(item.options).length) {
    return Object.entries(item.options).map(([k, v]) => `${k}: ${v}`).join(' &nbsp; ');
  }
  const parts = [];
  if (item.color) parts.push('Color: ' + item.color);
  if (item.size) parts.push('Size: ' + item.size);
  return parts.join(' &nbsp; ');
}

function renderCart() {
  const cart = getCart();
  if (!cart.length) {
    cartItemsEl.innerHTML = `<div class="empty-state">Your cart is empty. <a href="index.html" class="gold">Continue shopping →</a></div>`;
    checkoutSection.style.display = 'none';
    return;
  }

  cartItemsEl.innerHTML = `
    <div class="text-center mb-10">
      <a href="index.html" class="btn outline small"><i class="fas fa-plus"></i> Add More Items</a>
    </div>
  ` + cart.map((item, i) => `
    <div class="cart-item">
      <img src="${cld(item.image, 160)}" data-orig="${item.image}" onerror="${IMG_FALLBACK}" alt="" decoding="async">
      <div>
        <div>${item.name}</div>
        <div class="meta">${optionsMetaHtml(item)}</div>
        <div class="remove-link" data-i="${i}">Remove</div>
      </div>
      <div class="qty-row" style="margin:0">
        <button class="qty-btn" data-minus="${i}">−</button>
        <span>${item.qty}</span>
        <button class="qty-btn" data-plus="${i}">+</button>
      </div>
      <div class="cart-line-price">
        <div class="gold" style="font-weight:700">₹${(item.price * item.qty).toLocaleString('en-IN')}</div>
        ${mrpOf(item) ? `<s class="mrp">₹${(mrpOf(item) * item.qty).toLocaleString('en-IN')}</s>` : ''}
        ${item.pointsRedeemable && pointsConfig.enabled ? '<div class="points-tag"><i class="fas fa-coins"></i> Points OK</div>' : ''}
      </div>
    </div>
  `).join('');

  document.querySelectorAll('[data-minus]').forEach(btn =>
    btn.addEventListener('click', () => {
      const i = +btn.dataset.minus;
      const cart = getCart();
      updateQty(i, cart[i].qty - 1);
      renderCart(); updateSummary();
    })
  );
  document.querySelectorAll('[data-plus]').forEach(btn =>
    btn.addEventListener('click', () => {
      const i = +btn.dataset.plus;
      const cart = getCart();
      updateQty(i, cart[i].qty + 1);
      renderCart(); updateSummary();
    })
  );
  document.querySelectorAll('.remove-link').forEach(link =>
    link.addEventListener('click', () => {
      removeFromCart(+link.dataset.i);
      renderCart(); updateSummary();
    })
  );

  checkoutSection.style.display = 'block';
  updateSummary();
}

function computeDiscount(subtotal) {
  if (!appliedCoupon) return 0;
  const raw = appliedCoupon.type === 'percent'
    ? subtotal * (appliedCoupon.value / 100)
    : appliedCoupon.value;
  return Math.min(Math.round(raw), subtotal);
}

function showCouponMsg(msg, ok) {
  const el = document.getElementById('couponMsg');
  el.textContent = msg;
  el.style.display = 'block';
  el.className = `coupon-msg ${ok ? 'ok' : 'err'}`;
}

function currentShippingCharge(subtotal) {
  return computeShippingCharge(subtotal, shippingConfig);
}

// Value of the products the admin marked "Points redeem applicable".
function eligibleSubtotal() {
  return getCart().filter(i => i.pointsRedeemable).reduce((s, i) => s + i.price * i.qty, 0);
}

// How many points can go on this order: limited by the balance, by the value
// of eligible items, and never more than what's left after the coupon.
function maxRedeemablePoints(subtotal, couponDiscount) {
  if (!pointsConfig.enabled || !pointsConfig.pointValue || pointsBalance <= 0) return 0;
  const cap = Math.min(eligibleSubtotal(), Math.max(0, subtotal - couponDiscount));
  return Math.max(0, Math.min(pointsBalance, Math.floor(cap / pointsConfig.pointValue)));
}

// Every money figure for the order, computed in one place so the summary,
// the Razorpay amount and the saved order can never disagree.
function computeTotals() {
  const cart = getCart();
  const subtotal = cartTotal();
  const mrpTotal = cart.reduce((s, i) => s + (mrpOf(i) || i.price) * i.qty, 0);
  const discount = computeDiscount(subtotal);
  const redeemablePoints = maxRedeemablePoints(subtotal, discount);
  const pointsUsed = redeemOn ? redeemablePoints : 0;
  const pointsValue = pointsToRupees(pointsUsed, pointsConfig);
  const shippingCharge = currentShippingCharge(subtotal);
  const total = Math.max(0, subtotal - discount - pointsValue + shippingCharge);
  const pointsEarned = pointsForAmount(subtotal - discount - pointsValue, pointsConfig);
  return { subtotal, mrpTotal, discount, redeemablePoints, pointsUsed, pointsValue, shippingCharge, total, pointsEarned };
}

function renderPointsBox(t) {
  const box = document.getElementById('pointsBox');
  if (!box) return;
  const hasEligible = getCart().some(i => i.pointsRedeemable);
  // Hidden unless the programme is on, this shopper has points, and at
  // least one product in the cart allows paying with points.
  if (!pointsConfig.enabled || !hasEligible || pointsBalance <= 0 || t.redeemablePoints <= 0) {
    box.hidden = true;
    if (redeemOn && t.redeemablePoints <= 0) redeemOn = false;
    return;
  }
  box.hidden = false;
  const worth = pointsToRupees(t.redeemablePoints, pointsConfig);
  box.innerHTML = `
    <div class="points-box-text">
      <strong><i class="fas fa-coins"></i> Redeem your points here</strong>
      <span>You have <b>${pointsBalance.toLocaleString('en-IN')} points</b> (${inr(pointsToRupees(pointsBalance, pointsConfig))}).
        ${redeemOn ? `Using <b>${t.redeemablePoints.toLocaleString('en-IN')}</b> points: <b>-${inr(worth)}</b>.`
                   : `Use <b>${t.redeemablePoints.toLocaleString('en-IN')}</b> points to save <b>${inr(worth)}</b> on eligible items.`}</span>
    </div>
    <button type="button" class="btn small ${redeemOn ? 'outline' : ''}" id="redeemBtn">${redeemOn ? 'Remove' : 'Redeem'}</button>`;
  document.getElementById('redeemBtn').addEventListener('click', () => {
    redeemOn = !redeemOn;
    if (redeemOn) toast(`${t.redeemablePoints} points applied`, 'success');
    updateSummary();
  });
}

function updateSummary() {
  const t = computeTotals();
  const { subtotal, discount, shippingCharge, total } = t;
  renderPointsBox(t);
  const pointsRow = document.getElementById('pointsRow');
  if (pointsRow) {
    pointsRow.style.display = t.pointsValue > 0 ? 'flex' : 'none';
    document.getElementById('pointsVal').textContent = `-${inr(t.pointsValue)} (${t.pointsUsed} pts)`;
  }
  const mrpRow = document.getElementById('mrpRow');
  const mrpSaving = t.mrpTotal - subtotal;
  if (mrpRow) {
    mrpRow.style.display = mrpSaving > 0 ? 'flex' : 'none';
    document.getElementById('mrpVal').textContent = inr(t.mrpTotal);
  }
  const saveNote = document.getElementById('saveNote');
  const totalSaving = mrpSaving + discount + t.pointsValue;
  if (saveNote) {
    saveNote.style.display = totalSaving > 0 ? 'block' : 'none';
    saveNote.innerHTML = `<i class="fas fa-arrow-down"></i> You save ${inr(totalSaving)} on this order`;
  }
  const earnNote = document.getElementById('earnNote');
  if (earnNote) {
    earnNote.style.display = t.pointsEarned > 0 ? 'block' : 'none';
    earnNote.innerHTML = `<i class="fas fa-coins"></i> You'll earn <b>${t.pointsEarned} points</b> (worth ${inr(pointsToRupees(t.pointsEarned, pointsConfig))}) on this order, added once we confirm it.`;
  }
  document.getElementById('subtotalVal').textContent = `₹${subtotal.toLocaleString('en-IN')}`;
  document.getElementById('totalVal').textContent = `₹${total.toLocaleString('en-IN')}`;
  document.getElementById('shippingVal').textContent = shippingCharge > 0
    ? `₹${shippingCharge.toLocaleString('en-IN')}`
    : 'Free';
  const discountRow = document.getElementById('discountRow');
  if (discount > 0) {
    discountRow.style.display = 'flex';
    document.getElementById('discountVal').textContent = `-₹${discount.toLocaleString('en-IN')}`;
  } else {
    discountRow.style.display = 'none';
  }
}

document.getElementById('applyCouponBtn')?.addEventListener('click', applyCoupon);
document.getElementById('couponInput')?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); applyCoupon(); }
});

// If any product currently in the cart is admin-flagged "coupon not
// applicable," coupons can't be applied at all while it's in the cart —
// returns that product's name, or null if every item is eligible.
async function findCouponExcludedItem(cart) {
  const uniqueIds = [...new Set(cart.map(i => i.productId))];
  for (const productId of uniqueIds) {
    try {
      const snap = await getDoc(doc(db, 'products', productId));
      if (snap.exists() && snap.data().couponExcluded) {
        const item = cart.find(i => i.productId === productId);
        return item ? item.name : 'This item';
      }
    } catch (err) {
      console.warn(`Could not check coupon eligibility for product ${productId}`, err);
    }
  }
  return null;
}

async function applyCoupon() {
  const input = document.getElementById('couponInput');
  const code = input.value.trim().toUpperCase();
  if (!code) return;
  const btn = document.getElementById('applyCouponBtn');
  btn.disabled = true;
  try {
    const excludedName = await findCouponExcludedItem(getCart());
    if (excludedName) {
      appliedCoupon = null;
      showCouponMsg(`"${excludedName}" is not applicable for coupon codes. Remove it from your cart to use a coupon.`, false);
      updateSummary();
      return;
    }
    const snap = await getDoc(doc(db, 'coupons', code));
    if (!snap.exists() || snap.data().active === false) {
      appliedCoupon = null;
      showCouponMsg('Invalid or expired coupon code.', false);
      updateSummary();
      return;
    }
    const c = snap.data();
    if (c.expiresAt?.toDate && c.expiresAt.toDate() < new Date()) {
      appliedCoupon = null;
      showCouponMsg('This coupon has expired.', false);
      updateSummary();
      return;
    }
    const subtotal = cartTotal();
    if (c.minOrder && subtotal < Number(c.minOrder)) {
      appliedCoupon = null;
      showCouponMsg(`This coupon needs a minimum order of ₹${Number(c.minOrder).toLocaleString('en-IN')}.`, false);
      updateSummary();
      return;
    }
    appliedCoupon = { code, type: c.type, value: Number(c.value) };
    const label = c.type === 'percent' ? `${c.value}% off` : `₹${Number(c.value).toLocaleString('en-IN')} off`;
    showCouponMsg(`"${code}" applied — ${label}!`, true);
    toast(`Coupon "${code}" applied!`, 'success');
    updateSummary();
  } catch (err) {
    console.error(err);
    showCouponMsg('Could not validate that coupon. Please try again.', false);
  } finally {
    btn.disabled = false;
  }
}

function prefillFromCustomer() {
  const c = getCustomer();
  if (!c) return;
  document.getElementById('custName').value = c.name || '';
  document.getElementById('custPhone').value = c.phone || '';
  document.getElementById('custEmail').value = c.email || '';
  document.getElementById('custAddress').value = c.address || '';
  document.getElementById('custPincode').value = c.pincode || '';
}
prefillFromCustomer();

document.getElementById('payBtn').addEventListener('click', handlePayment);

async function handlePayment() {
  const name = document.getElementById('custName').value.trim();
  const phone = document.getElementById('custPhone').value.trim();
  const email = document.getElementById('custEmail').value.trim();
  const address = document.getElementById('custAddress').value.trim();
  const pincode = document.getElementById('custPincode').value.trim();

  if (!name || !phone || !address || !pincode) {
    toast('Please fill in all required delivery details.', 'error');
    return;
  }
  if (!/^\d{10}$/.test(phone)) {
    toast('Please enter a valid 10-digit phone number.', 'error');
    return;
  }

  const cart = getCart();
  if (!cart.length) return;

  // If they redeemed points, make sure the balance is still there before charging.
  if (redeemOn) {
    pointsBalance = await fetchPointsBalance(phone);
    pointsBalancePhone = phone;
  }
  const t = computeTotals();
  if (redeemOn && t.pointsUsed === 0) redeemOn = false;
  const { subtotal, shippingCharge } = t;
  const discountAmount = t.discount;
  const amount = t.total;
  const couponMeta = appliedCoupon ? { code: appliedCoupon.code, discountAmount } : null;
  const pointsMeta = pointsConfig.enabled ? {
    redeemed: t.pointsUsed,
    redeemValue: t.pointsValue,
    earned: t.pointsEarned,
    credited: false,
    rule: { spendAmount: pointsConfig.spendAmount, earnPoints: pointsConfig.earnPoints, pointValue: pointsConfig.pointValue }
  } : null;

  // Keep the lightweight account record in sync with whatever they just
  // typed at checkout (covers both the normal gated flow and anyone who
  // landed on cart.html directly without going through Add to Cart first).
  try { await saveCustomer({ name, phone, email, address, pincode }); } catch (err) { console.warn('Could not sync customer record', err); }

  const payBtn = document.getElementById('payBtn');
  payBtn.disabled = true;

  if (DEMO_MODE) {
    payBtn.innerHTML = 'Placing demo order...';
    try {
      const orderId = await saveOrderWithPoints({
        customer: { name, phone, email, address, pincode },
        items: cart,
        subtotal,
        shippingCharge,
        coupon: couponMeta,
        points: pointsMeta,
        totalAmount: amount,
        paymentId: 'DEMO_' + Date.now(),
        razorpayOrderId: 'demo_order',
        paymentMode: 'Demo Order',
        status: 'placed',
        vendorShared: false,
        awbNumber: '',
        courierName: '',
        createdAt: serverTimestamp()
      }, phone, { strict: true });
      await bumpCouponUsage();
      await decrementStock(cart);
      clearCart();
      window.location.href = `order-success.html?orderId=${orderId}`;
    } catch (err) {
      console.error(err);
      if (err.message === 'POINTS_CHANGED') {
        redeemOn = false;
        pointsBalance = await fetchPointsBalance(phone);
        updateSummary();
        toast('Your points balance changed. Please check the total and try again.', 'error');
      } else {
        toast('Could not place the demo order. Check the console for details.', 'error');
      }
      payBtn.disabled = false;
      payBtn.innerHTML = '<i class="fas fa-flask"></i> Place Order (Demo Mode — No Payment)';
    }
    return;
  }

  payBtn.textContent = 'Preparing checkout...';

  try {
    // 1. Ask Cloud Function to create a Razorpay order (keeps key_secret server-side)
    const orderRes = await fetch(`${functionsBaseUrl}/createRazorpayOrder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount })
    });
    const orderData = await orderRes.json();
    if (!orderData.id) throw new Error('Could not create payment order');

    // 2. Open Razorpay Checkout
    const rzp = new Razorpay({
      key: razorpayConfig.keyId,
      amount: orderData.amount,
      currency: razorpayConfig.currency,
      name: business.name,
      description: 'Order Payment',
      order_id: orderData.id,
      prefill: { name, email, contact: phone },
      theme: { color: '#c9a227' },
      handler: async function (response) {
        await verifyAndSaveOrder(response, { name, phone, email, address, pincode }, cart, subtotal, shippingCharge, amount, couponMeta, pointsMeta);
      },
      modal: {
        ondismiss: function () {
          payBtn.disabled = false;
          payBtn.innerHTML = '<i class="fas fa-lock"></i> Pay Securely with Razorpay';
        }
      }
    });
    rzp.open();
  } catch (err) {
    console.error(err);
    toast('Something went wrong starting the payment. Please try again.', 'error');
    payBtn.disabled = false;
    payBtn.innerHTML = '<i class="fas fa-lock"></i> Pay Securely with Razorpay';
  }
}

// Saves the order and, if points were redeemed, deducts them from the
// customer's balance in the SAME transaction: either both happen or neither,
// and two orders can't spend the same points twice.
// strict:true (demo/no payment yet) aborts if the balance no longer covers it;
// strict:false (payment already taken) still saves the order, flagged for the admin.
async function saveOrderWithPoints(order, phone, { strict }) {
  const orderRef = doc(collection(db, 'orders'));
  const use = Number(order.points?.redeemed) || 0;
  if (!use) {
    await setDoc(orderRef, order);
    return orderRef.id;
  }
  await runTransaction(db, async (tx) => {
    const custRef = doc(db, 'customers', phone);
    const snap = await tx.get(custRef);
    const balance = snap.exists() ? Number(snap.data().pointsBalance) || 0 : 0;
    if (balance < use) {
      if (strict) throw new Error('POINTS_CHANGED');
      tx.set(orderRef, { ...order, points: { ...order.points, shortfall: use - balance } });
      if (balance > 0) tx.update(custRef, { pointsBalance: 0 });
      return;
    }
    tx.update(custRef, { pointsBalance: balance - use });
    tx.set(orderRef, order);
  });
  return orderRef.id;
}

// Cart prices are saved in the browser when an item is added, so they can be
// days old. Re-read every product from Firestore on the cart page and update
// price, actual price and the coupon / points flags before anyone pays.
async function refreshCartFromStore() {
  const cart = getCart();
  if (!cart.length) return;
  const ids = [...new Set(cart.map(i => i.productId))];
  const fresh = {};
  await Promise.all(ids.map(async id => {
    try {
      const snap = await getDoc(doc(db, 'products', id));
      fresh[id] = snap.exists() ? snap.data() : null;
    } catch (err) {
      console.warn(`Could not refresh product ${id}`, err);
    }
  }));
  let changedPrice = false;
  let removed = 0;
  const next = [];
  for (const item of cart) {
    if (!(item.productId in fresh)) { next.push(item); continue; } // network hiccup: keep as is
    const p = fresh[item.productId];
    if (!p || p.active === false) { removed++; continue; }
    const price = Number(p.price);
    if (price && price !== Number(item.price)) changedPrice = true;
    next.push({
      ...item,
      price: price || item.price,
      mrp: mrpOf(p),
      pointsRedeemable: !!p.pointsRedeemable,
      couponExcluded: !!p.couponExcluded
    });
  }
  const before = JSON.stringify(cart);
  if (JSON.stringify(next) !== before) {
    saveCart(next);
    renderCart();
  }
  if (removed) toast(`${removed} item${removed > 1 ? 's are' : ' is'} no longer available and ${removed > 1 ? 'were' : 'was'} removed from your cart.`, 'info', 5000);
  if (changedPrice) toast('Some prices have been updated to the latest store price.', 'info', 5000);
}

async function refreshPointsBalance() {
  const phone = (document.getElementById('custPhone')?.value || '').trim() || getCustomer()?.phone || '';
  if (!/^\d{10}$/.test(phone)) { pointsBalance = 0; pointsBalancePhone = ''; redeemOn = false; updateSummary(); return; }
  if (phone === pointsBalancePhone) return;
  pointsBalancePhone = phone;
  pointsBalance = await fetchPointsBalance(phone);
  redeemOn = false;
  updateSummary();
}

// Decrements each purchased product's stock by the quantity ordered.
// Products with no stock tracking (stock is undefined/null, meaning
// "unlimited") are skipped. Runs one transaction per product so a stale
// read never overwrites someone else's concurrent purchase, and clamps at
// 0 rather than going negative if two orders race for the last units.
async function decrementStock(cart) {
  const qtyByProduct = {};
  cart.forEach(item => {
    qtyByProduct[item.productId] = (qtyByProduct[item.productId] || 0) + item.qty;
  });

  await Promise.all(Object.entries(qtyByProduct).map(async ([productId, qty]) => {
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, 'products', productId);
        const snap = await tx.get(ref);
        if (!snap.exists()) return;
        const stock = snap.data().stock;
        if (stock === undefined || stock === null) return; // unlimited stock — nothing to track
        const next = Math.max(0, Number(stock) - qty);
        if (next === Number(stock)) return; // rule requires a strict decrease
        tx.update(ref, { stock: next });
      });
    } catch (err) {
      console.warn(`Could not update stock for product ${productId}`, err);
    }
  }));
}

async function bumpCouponUsage() {
  if (!appliedCoupon) return;
  try {
    await updateDoc(doc(db, 'coupons', appliedCoupon.code), { usageCount: increment(1) });
  } catch (err) {
    console.warn('Could not update coupon usage count', err);
  }
}

async function verifyAndSaveOrder(razorpayResponse, customer, cart, subtotal, shippingCharge, amount, couponMeta, pointsMeta) {
  try {
    // 3. Verify payment signature server-side (Cloud Function)
    const verifyRes = await fetch(`${functionsBaseUrl}/verifyRazorpayPayment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(razorpayResponse)
    });
    const verifyData = await verifyRes.json();
    if (!verifyData.valid) throw new Error('Payment verification failed');

    // 4. Save order in Firestore — this is what the admin portal reads
    const orderId = await saveOrderWithPoints({
      customer,
      items: cart,
      subtotal,
      shippingCharge,
      coupon: couponMeta,
      points: pointsMeta,
      totalAmount: amount,
      paymentId: razorpayResponse.razorpay_payment_id,
      razorpayOrderId: razorpayResponse.razorpay_order_id,
      paymentMode: 'Online (Razorpay)',
      status: 'placed',
      vendorShared: false,
      awbNumber: '',
      courierName: '',
      createdAt: serverTimestamp()
    }, customer.phone, { strict: false });

    await bumpCouponUsage();
    await decrementStock(cart);
    clearCart();
    window.location.href = `order-success.html?orderId=${orderId}`;
  } catch (err) {
    console.error(err);
    toast('Payment succeeded but we could not save your order. Please contact us on WhatsApp with your payment ID: ' + razorpayResponse.razorpay_payment_id, 'error', 8000);
  }
}

renderCart();

// Delivery charge is admin-configurable (admin/settings.html); load it once
// and refresh the summary so the correct charge (or "Free") shows without
// waiting on the customer to trigger a re-render themselves.
getShippingConfig().then(cfg => {
  shippingConfig = cfg;
  updateSummary();
});

refreshCartFromStore();
getPointsConfig().then(cfg => {
  pointsConfig = cfg;
  renderCart();
  if (cfg.enabled) refreshPointsBalance();
});
document.getElementById('custPhone')?.addEventListener('change', () => { if (pointsConfig.enabled) refreshPointsBalance(); });
