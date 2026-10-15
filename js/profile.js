import { getCustomer, saveCustomer, clearCustomer } from "./customer-store.js";
import { openAccountModal } from "./account-gate.js";
import { getPointsConfig, fetchPointsBalance, pointsToRupees, pointsRuleText } from "./points-store.js";
import { inr } from "./pricing.js";

const card = document.getElementById('profileCard');

function viewHtml(c) {
  return `
    <div class="profile-header">
      <h2 style="margin:0">My Profile</h2>
      <button class="profile-edit-btn" id="editProfileBtn" title="Edit details"><i class="fas fa-pen"></i></button>
    </div>
    <div class="points-card" id="pointsCard" hidden></div>
    <div class="profile-field"><label>Full Name</label><div class="value">${c.name}</div></div>
    <div class="profile-field"><label>Mobile Number</label><div class="value">${c.phone}</div></div>
    <div class="profile-field"><label>Email</label><div class="value">${c.email || '—'}</div></div>
    <div class="profile-field"><label>Delivery Address</label><div class="value">${c.address || '—'}</div></div>
    <div class="profile-field"><label>Pincode</label><div class="value">${c.pincode || '—'}</div></div>
    <div class="profile-actions">
      <a href="order-history.html" class="btn outline"><i class="fas fa-receipt"></i> Order History</a>
      <button class="btn danger" id="logoutBtn"><i class="fas fa-right-from-bracket"></i> Logout</button>
    </div>
  `;
}

function editHtml(c) {
  return `
    <div class="profile-header">
      <h2 style="margin:0">Edit Profile</h2>
    </div>
    <div class="form-group"><label>Full Name *</label><input type="text" id="editName" value="${c.name}"></div>
    <div class="form-group"><label>Mobile Number</label><input type="tel" id="editPhone" value="${c.phone}" disabled style="opacity:.5"></div>
    <div class="form-group"><label>Email</label><input type="email" id="editEmail" value="${c.email || ''}"></div>
    <div class="form-group"><label>Delivery Address *</label><textarea id="editAddress" rows="2">${c.address || ''}</textarea></div>
    <div class="form-group"><label>Pincode *</label><input type="text" id="editPincode" maxlength="6" value="${c.pincode || ''}"></div>
    <div class="account-error" id="editError" style="display:none"></div>
    <div class="profile-actions">
      <button class="btn" id="saveProfileBtn">Save Changes</button>
      <button class="btn outline" id="cancelEditBtn">Cancel</button>
    </div>
  `;
}

function renderView() {
  const c = getCustomer();
  if (!c) { renderSignedOut(); return; }
  card.innerHTML = viewHtml(c);
  renderPointsCard(c.phone);
  document.getElementById('editProfileBtn').addEventListener('click', renderEdit);
  document.getElementById('logoutBtn').addEventListener('click', () => {
    clearCustomer();
    window.dispatchEvent(new CustomEvent('sandragon:customer-updated'));
    window.location.href = 'index.html';
  });
}

// "My Points" panel: balance, rupee value and a short guide.
async function renderPointsCard(phone) {
  const [cfg, balance] = await Promise.all([getPointsConfig(), fetchPointsBalance(phone)]);
  const el = document.getElementById('pointsCard');
  if (!el || !cfg.enabled) return;
  el.hidden = false;
  el.innerHTML = `
    <div class="points-card-top">
      <div>
        <div class="points-card-label">My SANDRAGON Points</div>
        <div class="points-card-balance">${balance.toLocaleString('en-IN')} <span>points</span></div>
      </div>
      <div class="points-card-worth">Worth<br><strong>${inr(pointsToRupees(balance, cfg))}</strong></div>
    </div>
    <ul class="points-guide">
      <li><i class="fas fa-coins"></i> 1 point = ₹${cfg.pointValue}</li>
      <li><i class="fas fa-bag-shopping"></i> ${pointsRuleText(cfg).split('. ')[0]}.</li>
      <li><i class="fas fa-circle-check"></i> Points are added when your order is confirmed.</li>
      <li><i class="fas fa-circle-info"></i> Orders that use points or a coupon don't earn new points, and points can't be combined with a coupon.</li>
      <li><i class="fas fa-tag"></i> Redeem them at checkout on products marked "Points OK", for up to ${cfg.maxRedeemPercent}% of those products' price per order.</li>
    </ul>`;
}

function renderEdit() {
  const c = getCustomer();
  card.innerHTML = editHtml(c);
  document.getElementById('cancelEditBtn').addEventListener('click', renderView);
  document.getElementById('saveProfileBtn').addEventListener('click', async () => {
    const name = document.getElementById('editName').value.trim();
    const email = document.getElementById('editEmail').value.trim();
    const address = document.getElementById('editAddress').value.trim();
    const pincode = document.getElementById('editPincode').value.trim();
    if (!name || !address || !pincode) {
      const err = document.getElementById('editError');
      err.textContent = 'Please fill in all required fields.';
      err.style.display = 'block';
      return;
    }
    const btn = document.getElementById('saveProfileBtn');
    btn.disabled = true;
    btn.textContent = 'Saving...';
    try {
      await saveCustomer({ name, phone: c.phone, email, address, pincode });
      window.dispatchEvent(new CustomEvent('sandragon:customer-updated'));
      renderView();
    } catch (err) {
      console.error(err);
      const errEl = document.getElementById('editError');
      errEl.textContent = "Couldn't save your changes. Please try again.";
      errEl.style.display = 'block';
      btn.disabled = false;
      btn.textContent = 'Save Changes';
    }
  });
}

function renderSignedOut() {
  card.innerHTML = `
    <div class="text-center">
      <h2>You're not signed in</h2>
      <p class="account-sub">Sign in to view and manage your profile.</p>
      <button class="btn" id="profileSignInBtn">Sign In</button>
    </div>
  `;
  document.getElementById('profileSignInBtn').addEventListener('click', () => {
    openAccountModal(() => renderView());
  });
}

renderView();
