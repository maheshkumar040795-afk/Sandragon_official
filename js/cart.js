import { db, collection, addDoc, doc, getDoc, updateDoc, increment, serverTimestamp, runTransaction } from "./firebase-init.js";
import { getCart, saveCart, removeFromCart, updateQty, clearCart, cartTotal } from "./cart-store.js";
import { razorpayConfig, functionsBaseUrl, business } from "./config.js";
import { getCustomer, saveCustomer } from "./customer-store.js";
import { toast } from "./toast.js";
import { getShippingConfig, computeShippingCharge, DEFAULT_CONFIG } from "./shipping-store.js";

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
      <img src="${item.image}" alt="${item.name}">
      <div>
        <div>${item.name}</div>
        <div class="meta">${item.color ? 'Color: ' + item.color + ' &nbsp;' : ''}${item.size ? 'Size: ' + item.size : ''}</div>
        <div class="remove-link" data-i="${i}">Remove</div>
      </div>
      <div class="qty-row" style="margin:0">
        <button class="qty-btn" data-minus="${i}">−</button>
        <span>${item.qty}</span>
        <button class="qty-btn" data-plus="${i}">+</button>
      </div>
      <div class="gold" style="font-weight:700">₹${(item.price * item.qty).toLocaleString('en-IN')}</div>
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

function updateSummary() {
  const subtotal = cartTotal();
  const discount = computeDiscount(subtotal);
  const shippingCharge = currentShippingCharge(subtotal);
  const total = Math.max(0, subtotal - discount + shippingCharge);
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

async function applyCoupon() {
  const input = document.getElementById('couponInput');
  const code = input.value.trim().toUpperCase();
  if (!code) return;
  const btn = document.getElementById('applyCouponBtn');
  btn.disabled = true;
  try {
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
  const subtotal = cartTotal();
  const discountAmount = computeDiscount(subtotal);
  const shippingCharge = currentShippingCharge(subtotal);
  const amount = Math.max(0, subtotal - discountAmount + shippingCharge);
  const couponMeta = appliedCoupon ? { code: appliedCoupon.code, discountAmount } : null;

  // Keep the lightweight account record in sync with whatever they just
  // typed at checkout (covers both the normal gated flow and anyone who
  // landed on cart.html directly without going through Add to Cart first).
  try { await saveCustomer({ name, phone, email, address, pincode }); } catch (err) { console.warn('Could not sync customer record', err); }

  const payBtn = document.getElementById('payBtn');
  payBtn.disabled = true;

  if (DEMO_MODE) {
    payBtn.innerHTML = 'Placing demo order...';
    try {
      const orderDoc = await addDoc(collection(db, 'orders'), {
        customer: { name, phone, email, address, pincode },
        items: cart,
        subtotal,
        shippingCharge,
        coupon: couponMeta,
        totalAmount: amount,
        paymentId: 'DEMO_' + Date.now(),
        razorpayOrderId: 'demo_order',
        paymentMode: 'Demo Order',
        status: 'placed',
        vendorShared: false,
        awbNumber: '',
        courierName: '',
        createdAt: serverTimestamp()
      });
      await bumpCouponUsage();
      await decrementStock(cart);
      clearCart();
      window.location.href = `order-success.html?orderId=${orderDoc.id}`;
    } catch (err) {
      console.error(err);
      toast('Could not place the demo order. Check the console for details.', 'error');
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
        await verifyAndSaveOrder(response, { name, phone, email, address, pincode }, cart, subtotal, shippingCharge, amount, couponMeta);
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

async function verifyAndSaveOrder(razorpayResponse, customer, cart, subtotal, shippingCharge, amount, couponMeta) {
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
    const orderDoc = await addDoc(collection(db, 'orders'), {
      customer,
      items: cart,
      subtotal,
      shippingCharge,
      coupon: couponMeta,
      totalAmount: amount,
      paymentId: razorpayResponse.razorpay_payment_id,
      razorpayOrderId: razorpayResponse.razorpay_order_id,
      paymentMode: 'Online (Razorpay)',
      status: 'placed',
      vendorShared: false,
      awbNumber: '',
      courierName: '',
      createdAt: serverTimestamp()
    });

    await bumpCouponUsage();
    await decrementStock(cart);
    clearCart();
    window.location.href = `order-success.html?orderId=${orderDoc.id}`;
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
