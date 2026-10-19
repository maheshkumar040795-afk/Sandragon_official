// SANDRAGON — Razorpay payment server (Cloudflare Worker, free plan).
//
// The website runs on GitHub Pages and Firebase stays on the free Spark plan.
// This small worker is the only piece that runs on a server, because it holds
// the Razorpay Key Secret, which must never be in the website code.
//
//   POST /create-order   Works out the order total from the live Firestore
//                        prices, coupon, points and delivery settings (the
//                        browser's figure is never trusted), then creates the
//                        Razorpay order for that amount.
//   POST /verify         Checks Razorpay's signature after payment, so a fake
//                        "payment succeeded" can't be sent from the browser.
//   GET  /payment?id=    Admin check: asks Razorpay what really happened to a
//                        payment (status, amount, method).
//
// Settings (Cloudflare → this worker → Settings → Variables and Secrets):
//   RAZORPAY_KEY_ID      Text    rzp_test_... or rzp_live_...
//   RAZORPAY_KEY_SECRET  Secret  the Key Secret from the Razorpay dashboard
//   ALLOWED_ORIGINS      Text    optional, comma separated; defaults below
//   FIREBASE_PROJECT_ID  Text    optional; defaults to sandragon-official
//
// The total calculation below mirrors computeTotals() in js/cart.js. If the
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
const DEFAULT_POINTS = { enabled: false, spendAmount: 100, earnPoints: 10, pointValue: 1, maxRedeemPercent: 5 };
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

function normalizePoints(d) {
  if (!d) return { ...DEFAULT_POINTS };
  const pct = d.maxRedeemPercent;
  return {
    enabled: !!d.enabled,
    spendAmount: Math.max(1, Number(d.spendAmount) || DEFAULT_POINTS.spendAmount),
    earnPoints: Math.max(0, Number(d.earnPoints) || 0),
    pointValue: Math.max(0, Number(d.pointValue) || 0),
    maxRedeemPercent: pct === undefined || pct === null || pct === ''
      ? DEFAULT_POINTS.maxRedeemPercent
      : Math.min(100, Math.max(0, Number(pct) || 0))
  };
}

function normalizeShipping(d) {
  if (!d) return { ...DEFAULT_SHIPPING };
  return { freeThreshold: Number(d.freeThreshold) || 0, flatCharge: Number(d.flatCharge) || 0 };
}

// lines: [{ price, qty, pointsRedeemable }]
// coupon: { type, value } | null
function computeTotals({ lines, coupon, pointsCfg, balance, redeem, shippingCfg }) {
  const subtotal = lines.reduce((s, l) => s + l.price * l.qty, 0);
  let discount = 0;
  if (coupon) {
    const raw = coupon.type === 'percent' ? subtotal * (coupon.value / 100) : coupon.value;
    discount = Math.min(Math.round(raw), subtotal);
  }
  const couponOn = !!coupon;
  const eligible = lines.filter(l => l.pointsRedeemable).reduce((s, l) => s + l.price * l.qty, 0);
  let redeemablePoints = 0;
  if (!couponOn && pointsCfg.enabled && pointsCfg.pointValue && balance > 0) {
    const capRupees = Math.max(0, Math.round(eligible * pointsCfg.maxRedeemPercent / 100));
    const cap = Math.min(capRupees, Math.max(0, subtotal - discount));
    redeemablePoints = Math.max(0, Math.min(balance, Math.floor(cap / pointsCfg.pointValue)));
  }
  const pointsUsed = redeem && !couponOn ? redeemablePoints : 0;
  const pointsValue = Math.round(pointsUsed * (pointsCfg.pointValue || 0));
  const shippingCharge = shippingCfg.freeThreshold > 0 && subtotal >= shippingCfg.freeThreshold ? 0 : shippingCfg.flatCharge;
  const total = Math.max(0, subtotal - discount - pointsValue + shippingCharge);
  const pointsEarned = (couponOn || pointsUsed > 0 || !pointsCfg.enabled || !pointsCfg.earnPoints)
    ? 0
    : Math.floor(Math.max(0, subtotal) / pointsCfg.spendAmount) * pointsCfg.earnPoints;
  return { subtotal, discount, pointsUsed, pointsValue, shippingCharge, total, pointsEarned };
}

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
    lines.push({ id, name: p.name || '', price, qty: qtyById[id], pointsRedeemable: !!p.pointsRedeemable, couponExcluded: !!p.couponExcluded });
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

  const [pointsDoc, shippingDoc] = await Promise.all([
    getDocument(env, 'settings/points'),
    getDocument(env, 'settings/shipping')
  ]);
  const pointsCfg = normalizePoints(pointsDoc);
  const shippingCfg = normalizeShipping(shippingDoc);

  const phone = String(body.phone || '');
  if (!/^\d{10}$/.test(phone)) throw new UserError('Please enter a valid 10-digit phone number.');
  let balance = 0;
  const redeem = !!body.redeemPoints && !coupon && pointsCfg.enabled;
  if (redeem) {
    const cust = await getDocument(env, `customers/${phone}`);
    balance = cust ? Math.max(0, Number(cust.pointsBalance) || 0) : 0;
  }

  const totals = computeTotals({ lines, coupon, pointsCfg, balance, redeem, shippingCfg });
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
  return { keyId: env.RAZORPAY_KEY_ID, orderId: order.id, amount: order.amount, currency: order.currency, totals };
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

    if (!env.RAZORPAY_KEY_ID || !env.RAZORPAY_KEY_SECRET) {
      return json({ error: 'Payment server is not set up yet (Razorpay keys missing).', code: 'NOT_CONFIGURED' }, 500, cors);
    }
    try {
      if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
        return json({ ok: true, mode: env.RAZORPAY_KEY_ID.startsWith('rzp_live_') ? 'live' : 'test' }, 200, cors);
      }
      if (request.method === 'GET' && url.pathname === '/payment') {
        return json(await paymentStatus(env, url), 200, cors);
      }
      if (request.method === 'POST' && (url.pathname === '/create-order' || url.pathname === '/verify')) {
        const body = await request.json().catch(() => null);
        if (!body || typeof body !== 'object') throw new UserError('Invalid request.');
        const result = url.pathname === '/create-order' ? await createOrder(env, body) : await verifyPayment(env, body);
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
