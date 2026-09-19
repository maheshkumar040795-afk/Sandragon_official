// SANDRAGON — "Become a Dealer" call-to-action. A highlighted vertical
// tab fixed to the right edge of every customer page. Clicking it opens a
// small form (Name, Mobile, Message); the WhatsApp button drafts a
// ready-to-send message to the business number with those details filled in.
import { business } from "./config.js";

function build() {
  const tab = document.createElement('button');
  tab.type = 'button';
  tab.className = 'dealer-cta-tab';
  tab.innerHTML = `<i class="fas fa-handshake"></i> Become a Dealer`;
  document.body.appendChild(tab);

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
  tab.addEventListener('click', () => overlay.classList.add('open'));
  overlay.querySelector('#dealerCloseBtn').addEventListener('click', closeModal);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

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

document.addEventListener('DOMContentLoaded', build);
