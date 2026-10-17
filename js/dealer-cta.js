// SANDRAGON — side call-to-action tabs fixed to the right edge of every
// customer page:
//   • "Request a Product" — for items the store doesn't list yet but can
//     source from a vendor. A short form drafts a WhatsApp message.
//   • "Become a Dealer" — dealer enquiry form, also sent on WhatsApp.
// Nothing is saved on the website; each form only drafts a WhatsApp message
// to the business number with the details filled in.
import { business } from "./config.js";

function build() {
  const stack = document.createElement('div');
  stack.className = 'side-cta-stack';
  document.body.appendChild(stack);
  buildRequestProduct(stack);

  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'dealer-cta-tab';
  tab.innerHTML = `<i class="fas fa-handshake"></i> Become a Dealer`;
  stack.appendChild(tab);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay dealer-overlay';
  overlay.innerHTML = `
    <div class="modal dealer-modal">
      <button type="button" class="account-close" id="dealerCloseBtn" aria-label="Close">&times;</button>
      <h3><i class="fas fa-handshake gold"></i> Become a SANDRAGON Dealer</h3>
      <p class="account-sub">Tell us a bit about yourself and we'll get back to you on WhatsApp.</p>
      <div class="form-group"><label>Your Name *</label><input type="text" id="dealerName" placeholder="Full name"></div>
      <div class="form-group"><label>Mobile Number *</label><input type="tel" id="dealerPhone" maxlength="10" placeholder="10-digit mobile number"></div>
      <div class="form-group"><label>Message</label><textarea id="dealerMessage" rows="3" placeholder="City, business type, expected order volume, etc. (optional)"></textarea></div>
      <div class="account-error" id="dealerError" style="display:none"></div>
      <button class="btn" id="dealerWhatsappBtn" style="width:100%;background:linear-gradient(135deg,#25D366,#1ebe5d);color:#fff">
        <i class="fab fa-whatsapp"></i> Send via WhatsApp
      </button>
    </div>
  `;
  document.body.appendChild(overlay);

  const closeModal = () => overlay.classList.remove('open');
  const openModal = (e) => { e?.preventDefault(); overlay.classList.add('open'); };
  tab.addEventListener('click', openModal);
  overlay.querySelector('#dealerCloseBtn').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

  // Any other element on the page (e.g. a footer "Become a Dealer" link)
  // can open this same modal without duplicating the form — just give it
  // this id or a [data-open-dealer] attribute.
  document.querySelectorAll('#footerDealerLink, [data-open-dealer]').forEach(el => {
    el.addEventListener('click', openModal);
  });

  overlay.querySelector('#dealerWhatsappBtn').addEventListener('click', () => {
    const name = document.getElementById('dealerName').value.trim();
    const phone = document.getElementById('dealerPhone').value.trim();
    const message = document.getElementById('dealerMessage').value.trim();
    const errorEl = document.getElementById('dealerError');
    errorEl.style.display = 'none';

    if (!name) { errorEl.textContent = 'Please enter your name.'; errorEl.style.display = 'block'; return; }
    if (!/^\d{10}$/.test(phone)) { errorEl.textContent = 'Please enter a valid 10-digit mobile number.'; errorEl.style.display = 'block'; return; }

    const lines = [
      `Hi SANDRAGON, I'm interested in becoming a dealer.`,
      `Name: ${name}`,
      `Mobile: ${phone}`,
    ];
    if (message) lines.push(`Message: ${message}`);
    const text = encodeURIComponent(lines.join('\n'));
    window.open(`https://wa.me/${business.phonePrimary}?text=${text}`, '_blank');
    closeModal();
  });
}

// ---------- Request a Product ----------
function buildRequestProduct(stack) {
  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'request-cta-tab';
  tab.innerHTML = `<i class="fas fa-box-open"></i> Request a Product`;
  stack.appendChild(tab);

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay dealer-overlay';
  overlay.innerHTML = `
    <div class="modal dealer-modal request-modal" role="dialog" aria-modal="true" aria-labelledby="reqTitle">
      <button type="button" class="account-close" id="reqCloseBtn" aria-label="Close">&times;</button>
      <h3 id="reqTitle"><i class="fas fa-box-open gold"></i> Can't find what you need?</h3>
      <p class="account-sub">Tell us the product and we'll source it from our trusted vendors. We'll reply on WhatsApp with the price and availability.</p>
      <div class="form-group"><label>Product you're looking for *</label><input type="text" id="reqProduct" placeholder="e.g. SG Test leg guard, ON Gold Standard Whey 2 lb"></div>
      <div class="req-grid">
        <div class="form-group"><label>Brand / model</label><input type="text" id="reqBrand" placeholder="Optional"></div>
        <div class="form-group"><label>Size / colour / flavour</label><input type="text" id="reqVariant" placeholder="Optional"></div>
      </div>
      <div class="req-grid">
        <div class="form-group"><label>Quantity</label><input type="number" id="reqQty" min="1" value="1" inputmode="numeric"></div>
        <div class="form-group"><label>Budget (₹)</label><input type="number" id="reqBudget" min="0" placeholder="Optional" inputmode="numeric"></div>
      </div>
      <div class="form-group"><label>Product link or more details</label><textarea id="reqNotes" rows="2" placeholder="Paste a link or describe it (optional)"></textarea></div>
      <div class="req-grid">
        <div class="form-group"><label>Your name *</label><input type="text" id="reqName" placeholder="Full name" autocomplete="name"></div>
        <div class="form-group"><label>Mobile number *</label><input type="tel" id="reqPhone" maxlength="10" placeholder="10-digit mobile" autocomplete="tel-national" inputmode="numeric"></div>
      </div>
      <div class="form-group"><label>City / pincode</label><input type="text" id="reqCity" placeholder="Where should we deliver? (optional)"></div>
      <div class="account-error" id="reqError" style="display:none"></div>
      <button class="btn" id="reqWhatsappBtn" style="width:100%;background:linear-gradient(135deg,#25D366,#1ebe5d);color:#fff">
        <i class="fab fa-whatsapp"></i> Send request on WhatsApp
      </button>
    </div>
  `;
  document.body.appendChild(overlay);

  // Pre-fill name/mobile/pincode if the shopper is signed in.
  const prefill = () => {
    try {
      const c = JSON.parse(localStorage.getItem('sandragon_customer') || 'null');
      if (!c) return;
      const set = (id, v) => { const el = overlay.querySelector(id); if (el && !el.value && v) el.value = v; };
      set('#reqName', c.name); set('#reqPhone', c.phone); set('#reqCity', c.pincode);
    } catch (e) { /* storage unavailable */ }
  };
  const closeModal = () => overlay.classList.remove('open');
  const openModal = (e) => {
    e?.preventDefault();
    prefill();
    overlay.classList.add('open');
    setTimeout(() => overlay.querySelector('#reqProduct')?.focus(), 50);
  };
  tab.addEventListener('click', openModal);
  overlay.querySelector('#reqCloseBtn').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && overlay.classList.contains('open')) closeModal(); });
  // Other links can open it too, e.g. <a data-open-request>.
  document.querySelectorAll('[data-open-request]').forEach(el => el.addEventListener('click', openModal));

  overlay.querySelector('#reqWhatsappBtn').addEventListener('click', () => {
    const v = (id) => overlay.querySelector(id).value.trim();
    const product = v('#reqProduct'), brand = v('#reqBrand'), variant = v('#reqVariant');
    const qty = Math.max(1, parseInt(v('#reqQty'), 10) || 1), budget = v('#reqBudget');
    const notes = v('#reqNotes'), name = v('#reqName'), phone = v('#reqPhone').replace(/\D/g, ''), city = v('#reqCity');
    const errorEl = overlay.querySelector('#reqError');
    errorEl.style.display = 'none';
    const fail = (msg, id) => { errorEl.textContent = msg; errorEl.style.display = 'block'; overlay.querySelector(id)?.focus(); };
    if (!product) return fail('Please tell us which product you need.', '#reqProduct');
    if (!name) return fail('Please enter your name.', '#reqName');
    if (!/^\d{10}$/.test(phone)) return fail('Please enter a valid 10-digit mobile number.', '#reqPhone');

    const lines = [
      `Hi SANDRAGON, I'd like to request a product that isn't on the website.`,
      ``,
      `Product: ${product}`
    ];
    if (brand) lines.push(`Brand / model: ${brand}`);
    if (variant) lines.push(`Size / colour / flavour: ${variant}`);
    lines.push(`Quantity: ${qty}`);
    if (budget) lines.push(`Budget: ₹${budget}`);
    if (notes) lines.push(`Details: ${notes}`);
    lines.push(``, `Name: ${name}`, `Mobile: ${phone}`);
    if (city) lines.push(`City / pincode: ${city}`);
    window.open(`https://wa.me/${business.phonePrimary}?text=${encodeURIComponent(lines.join('\n'))}`, '_blank');
    closeModal();
  });
}

document.addEventListener('DOMContentLoaded', build);
