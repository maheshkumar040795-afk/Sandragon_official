import { db, collection, addDoc, doc, getDoc, setDoc, updateDoc, increment, serverTimestamp, runTransaction } from "./firebase-init.js";
import { getCart, saveCart, removeFromCart, updateQty, clearCart, cartTotal } from "./cart-store.js";
import { razorpayConfig, paymentServerUrl, paymentGateway, business } from "./config.js";
import { getCustomer, saveCustomer } from "./customer-store.js";
import { toast } from "./toast.js";
import { getShippingConfig, computeShippingCharge, DEFAULT_CONFIG } from "./shipping-store.js";
import { cld, IMG_FALLBACK } from "./img.js";
import { inr, mrpOf } from "./pricing.js";
import { getPointsConfig, fetchPointsBalance, pointsForAmount, pointsToRupees, redeemCapRupees, DEFAULT_POINTS } from "./points-store.js";

// DEMO MODE: while the payment server address in config.js is still a
// placeholder (or, for Razorpay, its Key ID is), checkout skips the real
// payment gateway and creates the order directly, so the full customer →
// admin flow can be tested. Switches off by itself once filled in.
const PAY_URL = String(paymentServerUrl || '').replace(/\/+$/, '');
const GATEWAY = paymentGateway === 'razorpay' ? 'razorpay' : 'cashfree';
const DEMO_MODE = !/^https:\/\//.test(PAY_URL) ||
  (GATEWAY === 'razorpay' && (!razorpayConfig.keyId || razorpayConfig.keyId === "YOUR_RAZORPAY_KEY_ID"));
const PAY_LABEL = '<i class="fas fa-lock"></i> Pay Securely';
const GATEWAY_LABEL = GATEWAY === 'razorpay' ? 'Razorpay' : 'Cashfree';
const SDK_URL = GATEWAY === 'razorpay' ? 'https://checkout.razorpay.com/v1/checkout.js' : 'https://sdk.cashfree.com/js/v3/cashfree.js';
const PENDING_KEY = 'sd_pending_payment';

// Loads the gateway's checkout script once, only on the cart page.
let sdkPromise = null;
function loadPaymentSdk() {
  if (GATEWAY === 'razorpay' && typeof window.Razorpay === 'function') return Promise.resolve();
  if (GATEWAY === 'cashfree' && typeof window.Cashfree === 'function') return Promise.resolve();
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise((resolve, reject) => {
    const tag = document.createElement('script');
    tag.src = SDK_URL;
    tag.async = true;
    tag.onload = () => resolve();
    tag.onerror = () => { sdkPromise = null; reject(new Error('SDK failed to load')); };
    document.head.appendChild(tag);
  });
  return sdkPromise;
}
if (!DEMO_MODE) loadPaymentSdk().catch(() => {});

if (DEMO_MODE) {
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('payBtn');
    if (btn) btn.innerHTML = '<i class="fas fa-flask"></i> Place Order (Demo Mode — No Payment)';
    const note = document.querySelector('.cart-summary .stock-note');
    if (note) note.innerHTML = '⚠️ Demo mode: online payment isn\'t configured yet, so this places a test order with no real payment.';
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
        ${item.returnNotApplicable ? '<div class="no-return-tag"><i class="fas fa-ban"></i> Return not applicable for this product</div>' : ''}
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

// How many points can go on this order: limited by the balance, by the
// admin's max-redeem % of the eligible items' value (5% of ₹449 → ₹22),
// and never more than what's left after the coupon.
function maxRedeemablePoints(subtotal, couponDiscount) {
  if (!pointsConfig.enabled || !pointsConfig.pointValue || pointsBalance <= 0) return 0;
  const cap = Math.min(redeemCapRupees(eligibleSubtotal(), pointsConfig), Math.max(0, subtotal - couponDiscount));
  return Math.max(0, Math.min(pointsBalance, Math.floor(cap / pointsConfig.pointValue)));
}

// Every money figure for the order, computed in one place so the summary,
// the Razorpay amount and the saved order can never disagree.
function computeTotals() {
  const cart = getCart();
  const subtotal = cartTotal();
  const mrpTotal = cart.reduce((s, i) => s + (mrpOf(i) || i.price) * i.qty, 0);
  const discount = computeDiscount(subtotal);
  // Rules: a coupon and points can't be used together, and an order that
  // uses a coupon OR points earns no new points.
  const couponOn = !!appliedCoupon;
  const redeemablePoints = couponOn ? 0 : maxRedeemablePoints(subtotal, discount);
  const pointsUsed = redeemOn && !couponOn ? redeemablePoints : 0;
  const pointsValue = pointsToRupees(pointsUsed, pointsConfig);
  const shippingCharge = currentShippingCharge(subtotal);
  const total = Math.max(0, subtotal - discount - pointsValue + shippingCharge);
  const pointsEarned = (couponOn || pointsUsed > 0) ? 0 : pointsForAmount(subtotal, pointsConfig);
  return { subtotal, mrpTotal, discount, redeemablePoints, pointsUsed, pointsValue, shippingCharge, total, pointsEarned, couponOn };
}

function renderPointsBox(t) {
  const box = document.getElementById('pointsBox');
  if (!box) return;
  const hasEligible = getCart().some(i => i.pointsRedeemable);
  // Hidden unless the programme is on, this shopper has points, and at
  // least one product in the cart allows paying with points.
  const couldRedeem = maxRedeemablePoints(t.subtotal, 0);
  if (!pointsConfig.enabled || !hasEligible || pointsBalance <= 0 || couldRedeem <= 0) {
    box.hidden = true;
    if (redeemOn) redeemOn = false;
    return;
  }
  box.hidden = false;
  // A coupon is applied: explain why points can't be used, no button.
  if (t.couponOn) {
    box.classList.add('is-blocked');
    box.innerHTML = `
      <div class="points-box-text">
        <strong><i class="fas fa-coins"></i> Points not available with a coupon</strong>
        <span>You have <b>${pointsBalance.toLocaleString('en-IN')} points</b>. Points can't be used together with a coupon, and no new points are earned on coupon orders.
          <small>Remove the coupon to use your points instead.</small></span>
      </div>`;
    return;
  }
  box.classList.remove('is-blocked');
  const worth = pointsToRupees(t.redeemablePoints, pointsConfig);
  box.innerHTML = `
    <div class="points-box-text">
      <strong><i class="fas fa-coins"></i> Redeem your points here</strong>
      <span>You have <b>${pointsBalance.toLocaleString('en-IN')} points</b> (${inr(pointsToRupees(pointsBalance, pointsConfig))}).
        ${redeemOn ? `Using <b>${t.redeemablePoints.toLocaleString('en-IN')}</b> points: <b>-${inr(worth)}</b>.`
                   : `Use <b>${t.redeemablePoints.toLocaleString('en-IN')}</b> points to save <b>${inr(worth)}</b> on eligible items.`}
        <small>${redeemOn ? 'No new points are earned on an order paid with points.' : `You can use points for up to ${pointsConfig.maxRedeemPercent}% of eligible items per order. Orders paid with points don't earn new points.`}</small></span>
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

// Lets the shopper take the coupon off again (for example to use points instead).
function addRemoveCouponLink() {
  const el = document.getElementById('couponMsg');
  if (!el) return;
  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'coupon-remove';
  link.textContent = 'Remove coupon';
  link.addEventListener('click', () => {
    appliedCoupon = null;
    el.style.display = 'none';
    const input = document.getElementById('couponInput');
    if (input) input.value = '';
    updateSummary();
  });
  el.appendChild(document.createTextNode(' '));
  el.appendChild(link);
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
    const hadPoints = redeemOn;
    redeemOn = false; // coupon and points can't be combined
    showCouponMsg(`"${code}" applied: ${label}.${hadPoints ? ' Your points were removed, because points and coupons can\'t be used together.' : ''} No points are earned on coupon orders.`, true);
    addRemoveCouponLink();
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
  const resetPayBtn = () => { payBtn.disabled = false; payBtn.innerHTML = PAY_LABEL; };

  try {
    try { await loadPaymentSdk(); } catch (e) {
      throw new UserFacingError('The payment window could not load. Please check your internet connection and try again.');
    }
    // 1. The payment server works out the total again from the live store
    //    prices, coupon, points and delivery settings, and creates the
    //    gateway order for that amount. The browser's figure is never trusted.
    const created = await callPaymentServer('/create-order', {
      items: cart.map(i => ({ productId: i.productId, qty: i.qty })),
      couponCode: appliedCoupon?.code || '',
      redeemPoints: redeemOn && t.pointsUsed > 0,
      phone,
      name,
      email,
      // Where Cashfree sends the shopper back if the payment can't open as a
      // pop-up (some in-app browsers).
      returnUrl: `${location.origin}${location.pathname}?pay_order={order_id}`
    });
    const st = created.totals;
    if (Math.round(st.total) !== Math.round(amount)) {
      // Something changed since the page loaded (a price, delivery charge or
      // points balance). Refresh and let the shopper see the new total first.
      await Promise.all([
        refreshCartFromStore(),
        getPointsConfig().then(c => { pointsConfig = c; }),
        getShippingConfig({ fresh: true }).then(c => { shippingConfig = c; })
      ]);
      if (redeemOn) { pointsBalance = await fetchPointsBalance(phone); pointsBalancePhone = phone; }
      updateSummary();
      throw new UserFacingError(`The order total has been updated to ${inr(st.total)}. Please check it and tap Pay again.`);
    }
    const serverPoints = pointsConfig.enabled ? {
      ...pointsMeta,
      redeemed: st.pointsUsed,
      redeemValue: st.pointsValue,
      earned: st.pointsEarned
    } : pointsMeta;
    const ctx = {
      gateway: created.gateway || GATEWAY,
      gatewayOrderId: created.orderId,
      customer: { name, phone, email, address, pincode },
      cart,
      subtotal: st.subtotal,
      shippingCharge: st.shippingCharge,
      total: st.total,
      couponMeta,
      pointsMeta: serverPoints,
      at: Date.now()
    };

    if (ctx.gateway === 'cashfree') {
      // Kept until the order is saved, so a shopper sent away to pay and
      // back again (or whose tab reloads) still gets their order recorded.
      try { localStorage.setItem(PENDING_KEY, JSON.stringify(ctx)); } catch (e) { /* storage off */ }
      const cashfree = window.Cashfree({ mode: created.mode === 'sandbox' ? 'sandbox' : 'production' });
      const result = await cashfree.checkout({ paymentSessionId: created.paymentSessionId, redirectTarget: '_modal' });
      if (result?.redirect) return; // the gateway is taking the shopper to its own page; handled on return
      payBtn.textContent = 'Confirming payment...';
      // Whether the pop-up reported success, failure or was closed, ask the
      // gateway what actually happened before deciding.
      await confirmAndSaveOrder(ctx, { quietIfUnpaid: !!result?.error, resetPayBtn });
      return;
    }

    // 2. Razorpay Checkout
    const rzp = new window.Razorpay({
      key: created.keyId || razorpayConfig.keyId,
      amount: created.amount,
      currency: created.currency || razorpayConfig.currency,
      name: business.name,
      description: 'Order Payment',
      order_id: created.orderId,
      prefill: { name, email, contact: phone },
      notes: { phone },
      theme: { color: '#c9a227' },
      handler: async function (response) {
        payBtn.textContent = 'Confirming payment...';
        await confirmAndSaveOrder(ctx, { razorpayResponse: response, resetPayBtn });
      },
      modal: { ondismiss: resetPayBtn }
    });
    rzp.on('payment.failed', (resp) => {
      const reason = resp?.error?.description || 'The payment did not go through.';
      toast(`${reason} No money was taken. You can try again.`, 'error', 6000);
    });
    rzp.open();
  } catch (err) {
    console.error(err);
    if (err.code === 'COUPON_INVALID') {
      appliedCoupon = null;
      const msg = document.getElementById('couponMsg');
      if (msg) msg.style.display = 'none';
      updateSummary();
    } else if (err.code === 'ITEM_UNAVAILABLE' || err.code === 'OUT_OF_STOCK') {
      refreshCartFromStore();
    }
    toast(err instanceof UserFacingError ? err.message : 'Something went wrong starting the payment. Please try again.', 'error', 6000);
    resetPayBtn();
  }
}

class UserFacingError extends Error {
  constructor(message, code) { super(message); this.code = code; }
}

// Talks to the payment server (Cloudflare Worker). Errors it explains
// (coupon expired, item out of stock...) are shown to the shopper as is.
async function callPaymentServer(path, body) {
  let res;
  try {
    res = await fetch(PAY_URL + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (err) {
    throw new UserFacingError('Could not reach the payment server. Please check your internet connection and try again.');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 400 && data.error) throw new UserFacingError(data.error, data.code);
    if (data.code === 'NOT_CONFIGURED') throw new UserFacingError(`Online payment is being set up right now. Please message us on WhatsApp (+${business.phonePrimary}) to place your order.`, data.code);
    throw new Error(data.detail || data.error || `Payment server HTTP ${res.status}`);
  }
  return data;
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
      couponExcluded: !!p.couponExcluded,
      returnNotApplicable: !!p.returnNotApplicable
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

async function bumpCouponUsage(code = appliedCoupon?.code) {
  if (!code) return;
  try {
    await updateDoc(doc(db, 'coupons', code), { usageCount: increment(1) });
  } catch (err) {
    console.warn('Could not update coupon usage count', err);
  }
}

// 3. Ask the payment server whether the order was really paid (Cashfree:
//    order status from Cashfree; Razorpay: signature check). If the server
//    can't be reached after a Razorpay success, the money has been taken, so
//    the order is still saved and marked for the admin to check.
async function confirmAndSaveOrder(ctx, { razorpayResponse = null, quietIfUnpaid = false, silentIfUnpaid = false, resetPayBtn = null } = {}) {
  const ref = razorpayResponse?.razorpay_payment_id || ctx.gatewayOrderId;
  let payment = { gateway: ctx.gateway, verified: false };
  let paymentId = razorpayResponse?.razorpay_payment_id || '';
  try {
    const v = await callPaymentServer('/verify', razorpayResponse || { order_id: ctx.gatewayOrderId });
    if (!v.valid) {
      if (ctx.gateway === 'cashfree') {
        if (v.status === 'ACTIVE' && silentIfUnpaid) { /* not paid yet: nothing to say */ }
        else if (v.status === 'ACTIVE' && quietIfUnpaid) toast('Payment was not completed. No money was taken. You can try again.', 'info', 6000);
        else toast('The payment did not go through. No money was taken. You can try again.', 'error', 7000);
        if (v.status !== 'ACTIVE') clearPending();
      } else {
        toast(`We couldn't confirm this payment. If money was taken, please message us on WhatsApp with payment ID ${ref}.`, 'error', 10000);
      }
      resetPayBtn?.();
      return false;
    }
    paymentId = v.paymentId || paymentId || ctx.gatewayOrderId;
    payment = { gateway: ctx.gateway, verified: true, amountPaid: v.amountPaid ?? ctx.total, method: v.method || '', status: v.status || '' };
  } catch (err) {
    if (ctx.gateway === 'cashfree' && silentIfUnpaid) { resetPayBtn?.(); return false; }
    if (ctx.gateway === 'cashfree') {
      // Without confirmation we can't tell if Cashfree took the money, so
      // keep the details and try again rather than saving a maybe-unpaid order.
      console.warn('Could not confirm Cashfree payment yet', err);
      toast(`We couldn't confirm your payment yet. If money was taken, don't pay again: reload this page in a minute, or WhatsApp us with order ID ${ctx.gatewayOrderId}.`, 'error', 12000);
      resetPayBtn?.();
      return false;
    }
    console.warn('Payment verification could not run; saving order for the admin to check', err);
    payment.checkNote = `Not verified at checkout (payment server unreachable). Check in ${GATEWAY_LABEL}.`;
  }

  try {
    // 4. Save order in Firestore — this is what the admin portal reads
    const order = {
      customer: ctx.customer,
      items: ctx.cart,
      subtotal: ctx.subtotal,
      shippingCharge: ctx.shippingCharge,
      coupon: ctx.couponMeta,
      points: ctx.pointsMeta,
      totalAmount: ctx.total,
      paymentId,
      gatewayOrderId: ctx.gatewayOrderId,
      paymentMode: ctx.gateway === 'razorpay' ? 'Online (Razorpay)' : 'Online (Cashfree)',
      payment,
      status: 'placed',
      vendorShared: false,
      awbNumber: '',
      courierName: '',
      createdAt: serverTimestamp()
    };
    if (ctx.gateway === 'razorpay') order.razorpayOrderId = ctx.gatewayOrderId;
    const orderId = await saveOrderWithPoints(order, ctx.customer.phone, { strict: false });
    clearPending();
    await bumpCouponUsage(ctx.couponMeta?.code);
    await decrementStock(ctx.cart);
    clearCart();
    window.location.href = `order-success.html?orderId=${orderId}`;
    return true;
  } catch (err) {
    console.error(err);
    toast(`Payment succeeded but we could not save your order. Please contact us on WhatsApp with payment ID ${paymentId || ref}.`, 'error', 12000);
    return false;
  }
}

function clearPending() {
  try { localStorage.removeItem(PENDING_KEY); } catch (e) { /* storage off */ }
}

// Coming back from the gateway's own payment page (?pay_order=...), or the
// tab reloaded mid-payment: finish saving that order if it was paid.
async function resumePendingPayment() {
  let ctx = null;
  try { ctx = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch (e) { /* ignore */ }
  const returned = new URLSearchParams(location.search).get('pay_order');
  if (returned) history.replaceState(null, '', location.pathname);
  if (!ctx || !ctx.gatewayOrderId || ctx.gateway !== 'cashfree') return;
  if (Date.now() - (ctx.at || 0) > 2 * 24 * 60 * 60 * 1000) { clearPending(); return; }
  if (returned && returned !== ctx.gatewayOrderId) return;
  const payBtn = document.getElementById('payBtn');
  if (payBtn) { payBtn.disabled = true; payBtn.textContent = 'Checking your payment...'; }
  const ok = await confirmAndSaveOrder(ctx, { silentIfUnpaid: !returned, resetPayBtn: () => {
    if (payBtn) { payBtn.disabled = false; payBtn.innerHTML = PAY_LABEL; }
  } });
  if (!ok && !returned && payBtn) { payBtn.disabled = false; payBtn.innerHTML = PAY_LABEL; }
}
if (!DEMO_MODE) resumePendingPayment();

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
