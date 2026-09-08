import { getCustomer, saveCustomer, clearCustomer } from "./customer-store.js";
import { openAccountModal } from "./account-gate.js";

const card = document.getElementById('profileCard');

function viewHtml(c) {
  return `
    <div class="profile-header">
      <h2 style="margin:0">My Profile</h2>
      <button class="profile-edit-btn" id="editProfileBtn" title="Edit details"><i class="fas fa-pen"></i></button>
    </div>
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
  document.getElementById('editProfileBtn').addEventListener('click', renderEdit);
  document.getElementById('logoutBtn').addEventListener('click', () => {
    clearCustomer();
    window.dispatchEvent(new CustomEvent('sandragon:customer-updated'));
    window.location.href = 'index.html';
  });
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
