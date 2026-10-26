// SANDRAGON — payment server (Cloudflare Worker, free plan).
// Works with Cashfree (used when its keys are set) or Razorpay.
//
// The website runs on GitHub Pages and Firebase stays on the free Spark plan.
// This small worker is the only piece that runs on a server, because it holds
// the payment gateway's secret key, which must never be in the website code.
//
//   POST /create-order   Works out the order total from the live Firestore
//                        prices, coupon, points and delivery settings (the
//                        browser's figure is never trusted), then creates the
//                        gateway order for that amount.
//   POST /verify         Confirms with the gateway that the order was really
//                        paid, so a fake "payment succeeded" can't be sent
//                        from the browser.
//   GET  /payment?id=    Admin check: asks the gateway what really happened
//        /payment?order=  (status, amount, method, refunds).
//
// Settings (Cloudflare → this worker → Settings → Variables and Secrets):
//   Cashfree:
//   CASHFREE_APP_ID      Text    App ID from Cashfree → Developers → API Keys
//   CASHFREE_SECRET_KEY  Secret  Secret Key from the same page
//   CASHFREE_ENV         Text    "production" (default) or "sandbox" for test keys
//   Razorpay (only if Cashfree keys are not set):
//   RAZORPAY_KEY_ID      Text    rzp_test_... or rzp_live_...
//   RAZORPAY_KEY_SECRET  Secret  the Key Secret from the Razorpay dashboard
//   Both:
//   ALLOWED_ORIGINS      Text    optional, comma separated; defaults below
//   FIREBASE_PROJECT_ID  Text    optional; defaults to sandragon-official
//
// The total calculation below mirrors computeTotals() in js/cart.js
// (points are set per product: earnPoints / redeemPoints, 1 point = ₹1). If the
// pricing rules change there, change them here too.

const DEFAULT_ORIGINS = [
  'https://sandragon.in',
  'https://www.sandragon.in',
  'https://maheshkumar040795-afk.github.io',
  'http://localhost:8000',
  'http://127.0.0.1:8000',
  'http://localhost:5500',
  'http://127.0.0.1:5500'
];
const DEFAULT_SHIPPING = { freeThreshold: 499, flatCharge: 50 };
const MAX_ITEMS = 50;

class UserError extends Error {
  constructor(message, code) { super(message); this.code = code || 'BAD_REQUEST'; }
}

// ---------- Firestore (public read via REST) ----------

function decodeValue(v) {
  if (!v || typeof v !== 'object') return null;
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return { __ts: Date.parse(v.timestampValue) };
  if ('nullValue' in v) return null;
  if ('mapValue' in v) return decodeFields(v.mapValue.fields || {});
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(decodeValue);
  return null;
}

function decodeFields(fields) {
  const out = {};
  for (const k of Object.keys(fields || {})) out[k] = decodeValue(fields[k]);
  return out;
}

async function getDocument(env, path) {
  const project = env.FIREBASE_PROJECT_ID || 'sandragon-official';
  const url = `https://firestore.googleapis.com/v1/projects/${project}/databases/(default)/documents/${path}`;
  const res = await fetch(url);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Firestore ${path}: HTTP ${res.status}`);
  const body = await res.json();
  return decodeFields(body.fields || {});
}

// ---------- Pricing (mirror of js/cart.js computeTotals) ----------

function normalizeShipping(d) {
  if (!d) return { ...DEFAULT_SHIPPING };
  return { freeThreshold: Number(d.freeThreshold) || 0, flatCharge: Number(d.flatCharge) || 0 };
}

// lines: [{ price, qty, earnPoints, redeemPoints }]  (points are per item; 1 point = ₹1)
// coupon: { type, value } | null
function computeTotals({ lines, coupon, balance, redeem, shippingCfg }) {
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  let discount = 0;
  if (coupon) {
    const raw = coupon.type === 'percent' ? subtotal * (coupon.value / 100) : coupon.value;
    discount = Math.min(Math.round(raw), subtotal);
  }
  const couponOn = !!coupon;
  const redeemCap = lines.reduce((s, l) => s + l.redeemPoints * l.qty, 0);
  let redeemablePoints = 0;
  if (!couponOn && balance > 0) {
    const cap = Math.min(redeemCap, Math.max(0, subtotal - discount));
    redeemablePoints = Math.max(0, Math.min(balance, cap));
  }
  const pointsUsed = redeem && !couponOn ? redeemablePoints : 0;
  const pointsValue = pointsUsed;
  const shippingCharge = shippingCfg.freeThreshold > 0 && subtotal >= shippingCfg.freeThreshold ? 0 : shippingCfg.flatCharge;
  const total = Math.max(0, subtotal - discount - pointsValue + shippingCharge);
  const pointsEarned = (couponOn || pointsUsed > 0) ? 0 : lines.reduce((s, l) => s + l.earnPoints * l.qty, 0);
  return { subtotal, discount, pointsUsed, pointsValue, shippingCharge, total, pointsEarned };
}

const wholePts = (v) => { const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; };

async function priceOrder(env, body) {
  const items = Array.isArray(body.items) ? body.items : [];
  if (!items.length) throw new UserError('Your cart is empty.');
  if (items.length > MAX_ITEMS) throw new UserError('Too many items in one order.');

  // Same product can appear twice with different options; read each product once.
  const qtyById = {};
  for (const it of items) {
    const id = String(it.productId || '');
    const qty = Math.floor(Number(it.qty));
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id) || !(qty >= 1 && qty <= 999)) throw new UserError('Invalid item in cart.');
    qtyById[id] = (qtyById[id] || 0) + qty;
  }
  const ids = Object.keys(qtyById);
  const products = {};
  await Promise.all(ids.map(async id => { products[id] = await getDocument(env, `products/${id}`); }));

  const lines = [];
  for (const id of ids) {
    const p = products[id];
    if (!p || p.active === false) throw new UserError('An item in your cart is no longer available. Please refresh your cart.', 'ITEM_UNAVAILABLE');
    const price = Number(p.price);
    if (!(price > 0)) throw new UserError(`"${p.name || 'An item'}" has no price set.`, 'ITEM_UNAVAILABLE');
    if (p.stock !== undefined && p.stock !== null && Number(p.stock) < qtyById[id]) {
      throw new UserError(`Only ${Math.max(0, Number(p.stock))} of "${p.name || 'an item'}" left in stock.`, 'OUT_OF_STOCK');
    }
    lines.push({ id, name: p.name || '', price, qty: qtyById[id], earnPoints: wholePts(p.earnPoints), redeemPoints: wholePts(p.redeemPoints), couponExcluded: !!p.couponExcluded });
  }

  // Coupon: same checks as the cart page's "Apply".
  let coupon = null;
  const code = String(body.couponCode || '').trim().toUpperCase();
  if (code) {
    if (!/^[A-Z0-9_-]{1,40}$/.test(code)) throw new UserError('Invalid coupon code.', 'COUPON_INVALID');
    const excluded = lines.find(l => l.couponExcluded);
    if (excluded) throw new UserError(`"${excluded.name}" is not applicable for coupon codes.`, 'COUPON_INVALID');
    const c = await getDocument(env, `coupons/${code}`);
    if (!c || c.active === false) throw new UserError('Invalid or expired coupon code.', 'COUPON_INVALID');
    if (c.expiresAt && c.expiresAt.__ts && c.expiresAt.__ts < Date.now()) throw new UserError('This coupon has expired.', 'COUPON_INVALID');
    const subtotalNow = lines.reduce((s, l) => s + l.price * l.qty, 0);
    if (c.minOrder && subtotalNow < Number(c.minOrder)) throw new UserError('This coupon needs a higher order value.', 'COUPON_INVALID');
    coupon = { code, type: c.type, value: Number(c.value) || 0 };
  }

  const shippingCfg = normalizeShipping(await getDocument(env, 'settings/shipping'));

  const phone = String(body.phone || '');
  if (!/^\d{10}$/.test(phone)) throw new UserError('Please enter a valid 10-digit phone number.');
  let balance = 0;
  const redeem = !!body.redeemPoints && !coupon;
  if (redeem) {
    const cust = await getDocument(env, `customers/${phone}`);
    balance = cust ? Math.max(0, Number(cust.pointsBalance) || 0) : 0;
  }

  const totals = computeTotals({ lines, coupon, balance, redeem, shippingCfg });
  return { totals, lines, coupon, phone };
}

// ---------- Razorpay ----------

function rzpAuth(env) {
  return 'Basic ' + btoa(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`);
}

async function rzp(env, method, path, body) {
  const res = await fetch(`https://api.razorpay.com/v1/${path}`, {
    method,
    headers: { Authorization: rzpAuth(env), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = data?.error?.description || `HTTP ${res.status}`;
    const err = new Error(`Razorpay: ${msg}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

async function hmacHex(secret, message) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const clip = (s, n) => String(s || '').slice(0, n);

async function createOrder(env, body) {
  const { totals, lines, coupon, phone } = await priceOrder(env, body);
  if (totals.total < 1) throw new UserError('This order total is too low for online payment.');
  const order = await rzp(env, 'POST', 'orders', {
    amount: Math.round(totals.total * 100), // paise
    currency: 'INR',
    receipt: `sd_${Date.now()}`,
    // Shown in the Razorpay dashboard, so a payment can always be matched
    // to a customer even if the browser closed before the order was saved.
    notes: {
      customer_name: clip(body.name, 100),
      phone,
      items: clip(lines.map(l => `${l.qty}x ${l.name}`).join(', '), 250),
      coupon: coupon ? coupon.code : '',
      points_used: String(totals.pointsUsed)
    }
  });
  return { gateway: 'razorpay', keyId: env.RAZORPAY_KEY_ID, orderId: order.id, amount: order.amount, currency: order.currency, totals };
}

async function verifyPayment(env, body) {
  const orderId = String(body.razorpay_order_id || '');
  const paymentId = String(body.razorpay_payment_id || '');
  const signature = String(body.razorpay_signature || '');
  if (!orderId || !paymentId || !signature) throw new UserError('Missing payment details.');
  const expected = await hmacHex(env.RAZORPAY_KEY_SECRET, `${orderId}|${paymentId}`);
  if (!safeEqual(expected, signature)) return { valid: false };
  let payment = null;
  try { payment = await rzp(env, 'GET', `payments/${encodeURIComponent(paymentId)}`); } catch (e) { /* signature already proves it */ }
  return {
    valid: true,
    paymentId,
    orderId,
    amountPaid: payment ? payment.amount / 100 : null,
    status: payment ? payment.status : null,
    method: payment ? payment.method : null
  };
}

async function paymentStatus(env, url) {
  const id = url.searchParams.get('id') || '';
  if (!/^pay_[A-Za-z0-9]{6,40}$/.test(id)) throw new UserError('Not a Razorpay payment ID.', 'NOT_RAZORPAY');
  try {
    const p = await rzp(env, 'GET', `payments/${id}`);
    return {
      found: true,
      status: p.status,            // created | authorized | captured | refunded | failed
      amount: p.amount / 100,
      amountRefunded: (p.amount_refunded || 0) / 100,
      method: p.method,
      orderId: p.order_id,
      createdAt: p.created_at
    };
  } catch (e) {
    if (e.status === 400 || e.status === 404) return { found: false };
    throw e;
  }
}

// ---------- Cashfree ----------

const CF_API_VERSION = '2025-01-01';
const useCashfree = (env) => !!(env.CASHFREE_APP_ID && env.CASHFREE_SECRET_KEY);
const cfSandbox = (env) => String(env.CASHFREE_ENV || 'production').toLowerCase() === 'sandbox';
const cfBase = (env) => cfSandbox(env) ? 'https://sandbox.cashfree.com/pg' : 'https://api.cashfree.com/pg';

async function cf(env, method, path, body) {
  const res = await fetch(`${cfBase(env)}/${path}`, {
    method,
    headers: {
      'x-client-id': env.CASHFREE_APP_ID,
      'x-client-secret': env.CASHFREE_SECRET_KEY,
      'x-api-version': CF_API_VERSION,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`Cashfree: ${data?.message || 'HTTP ' + res.status}`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// Cashfree's simple payment type for display ("upi", "credit_card" → "card"...)
function cfMethod(p) {
  const g = String(p?.payment_group || '');
  if (g.includes('upi')) return 'upi';
  if (g.includes('card')) return 'card';
  if (g === 'net_banking') return 'netbanking';
  return g || '';
}

async function cfCreateOrder(env, body) {
  const { totals, lines, coupon, phone } = await priceOrder(env, body);
  if (totals.total < 1) throw new UserError('This order total is too low for online payment.');
  const orderId = `SD${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  const name = clip(String(body.name || '').replace(/[^\p{L}\p{N} .'-]/gu, ''), 100);
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(body.email || '')) ? clip(body.email, 100) : undefined;
  const returnUrl = /^https:\/\/[^\s]+$/.test(String(body.returnUrl || '')) ? clip(body.returnUrl, 200) : undefined;
  const order = await cf(env, 'POST', 'orders', {
    order_id: orderId,
    order_amount: Number(totals.total.toFixed(2)),
    order_currency: 'INR',
    customer_details: {
      customer_id: `C${phone}`,
      customer_phone: phone,
      ...(name.length >= 3 ? { customer_name: name } : {}),
      ...(email ? { customer_email: email } : {})
    },
    order_meta: returnUrl ? { return_url: returnUrl.replace('{order_id}', orderId) } : undefined,
    order_note: clip(lines.map(l => `${l.qty}x ${l.name}`).join(', '), 200).padEnd(3, '.'),
    // Shown in the Cashfree dashboard, so a payment can always be matched to
    // a customer even if the browser closed before the order was saved.
    order_tags: {
      phone,
      customer_name: clip(name || '-', 100),
      items: clip(lines.map(l => `${l.qty}x ${l.name}`).join(', '), 250) || '-',
      coupon: coupon ? coupon.code : '-',
      points_used: String(totals.pointsUsed)
    }
  });
  return {
    gateway: 'cashfree',
    mode: cfSandbox(env) ? 'sandbox' : 'production',
    orderId: order.order_id,
    paymentSessionId: order.payment_session_id,
    amount: Math.round(totals.total * 100),
    currency: 'INR',
    totals
  };
}

async function cfOrderReport(env, orderId) {
  const order = await cf(env, 'GET', `orders/${encodeURIComponent(orderId)}`);
  let payments = [];
  try { payments = await cf(env, 'GET', `orders/${encodeURIComponent(orderId)}/payments`); } catch (e) { /* keep going */ }
  let refunded = 0;
  try {
    const refunds = await cf(env, 'GET', `orders/${encodeURIComponent(orderId)}/refunds`);
    if (Array.isArray(refunds)) refunded = refunds.filter(r => r.refund_status === 'SUCCESS').reduce((s, r) => s + (Number(r.refund_amount) || 0), 0);
  } catch (e) { /* no refunds */ }
  const paid = Array.isArray(payments) ? payments.find(p => p.payment_status === 'SUCCESS') : null;
  return { order, paid, refunded };
}

async function cfVerify(env, body) {
  const orderId = String(body.order_id || body.orderId || '');
  if (!/^[A-Za-z0-9_-]{3,45}$/.test(orderId)) throw new UserError('Missing payment details.');
  const { order, paid } = await cfOrderReport(env, orderId);
  if (order.order_status !== 'PAID') return { valid: false, status: order.order_status, orderId };
  return {
    valid: true,
    gateway: 'cashfree',
    orderId,
    paymentId: paid ? String(paid.cf_payment_id) : '',
    amountPaid: Number(order.order_amount),
    status: 'captured',
    method: cfMethod(paid)
  };
}

async function cfPaymentStatus(env, url) {
  const orderId = url.searchParams.get('order') || '';
  if (!/^[A-Za-z0-9_-]{3,45}$/.test(orderId)) throw new UserError('Not a Cashfree order ID.', 'NOT_CASHFREE');
  try {
    const { order, paid, refunded } = await cfOrderReport(env, orderId);
    const amount = Number(order.order_amount) || 0;
    let status = 'created';
    if (order.order_status === 'PAID') status = refunded >= amount && amount > 0 ? 'refunded' : 'captured';
    else if (order.order_status === 'EXPIRED' || order.order_status === 'TERMINATED') status = 'failed';
    return {
      found: true,
      status,
      amount,
      amountRefunded: refunded,
      method: cfMethod(paid),
      orderId,
      paymentId: paid ? String(paid.cf_payment_id) : ''
    };
  } catch (e) {
    if (e.status === 404 || e.status === 400) return { found: false };
    throw e;
  }
}

// ---------- HTTP ----------

function corsHeaders(env, request) {
  const allowed = (env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean) : DEFAULT_ORIGINS);
  const origin = request.headers.get('Origin') || '';
  const h = {
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin'
  };
  if (allowed.includes(origin)) h['Access-Control-Allow-Origin'] = origin;
  return h;
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(env, request);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(request.url);

    const cashfree = useCashfree(env);
    if (!cashfree && !(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET)) {
      return json({ error: 'Payment server is not set up yet (payment gateway keys missing).', code: 'NOT_CONFIGURED' }, 500, cors);
    }
    try {
      if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
        return json(cashfree
          ? { ok: true, gateway: 'cashfree', mode: cfSandbox(env) ? 'sandbox' : 'production' }
          : { ok: true, gateway: 'razorpay', mode: env.RAZORPAY_KEY_ID.startsWith('rzp_live_') ? 'live' : 'test' }, 200, cors);
      }
      if (request.method === 'GET' && url.pathname === '/payment') {
        if (url.searchParams.get('order') && cashfree) return json(await cfPaymentStatus(env, url), 200, cors);
        return json(await paymentStatus(env, url), 200, cors);
      }
      if (request.method === 'POST' && (url.pathname === '/create-order' || url.pathname === '/verify')) {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== 'object') throw new UserError('Invalid request.');
        let result;
        if (url.pathname === '/create-order') result = cashfree ? await cfCreateOrder(env, body) : await createOrder(env, body);
        else result = (cashfree && !body.razorpay_payment_id) ? await cfVerify(env, body) : await verifyPayment(env, body);
        return json(result, 200, cors);
      }
      return json({ error: 'Not found' }, 404, cors);
    } catch (err) {
      if (err instanceof UserError) return json({ error: err.message, code: err.code }, 400, cors);
      console.error(err);
      return json({ error: 'Payment server error. Please try again.', code: 'SERVER_ERROR', detail: String(err.message || err) }, 502, cors);
    }
  }
};
