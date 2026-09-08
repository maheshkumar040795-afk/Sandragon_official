import { getCustomer, saveCustomer, findCustomerByPhone } from "./customer-store.js";

let overlayEl = null;

function ensureOverlay() {
  if (overlayEl) return overlayEl;
  overlayEl = document.createElement('div');
  overlayEl.className = 'modal-overlay account-overlay';
  overlayEl.innerHTML = `
    <div class="modal account-modal">
      <div class="account-tabs">
        <button type="button" class="account-tab active" data-tab="new">New Customer</button>
        <button type="button" class="account-tab" data-tab="existing">Existing Customer</button>
      </div>

      <div class="account-pane" data-pane="new">
        <h3>Create Your Account</h3>
        <p class="account-sub">Just a few details so we can deliver your order.</p>
        <div class="form-group"><label>Full Name *</label><input type="text" id="accName"></div>
        <div class="form-group"><label>Mobile Number *</label><input type="tel" id="accPhone" maxlength="10" placeholder="10-digit number"></div>
        <div class="form-group"><label>Email</label><input type="email" id="accEmail"></div>
        <div class="form-group"><label>Delivery Address *</label><textarea id="accAddress" rows="2"></textarea></div>
        <div class="form-group"><label>Pincode *</label><input type="text" id="accPincode" maxlength="6"></div>
        <div class="account-error" id="accNewError" style="display:none"></div>
        <button class="btn" id="accCreateBtn" style="width:100%">Create Account</button>
      </div>

      <div class="account-pane" data-pane="existing" style="display:none">
        <h3>Welcome Back</h3>
        <p class="account-sub">Enter your mobile number to sign in.</p>
        <div class="form-group"><label>Mobile Number *</label><input type="tel" id="signInPhone" maxlength="10" placeholder="10-digit number"></div>
        <div class="account-error" id="accExistingError" style="display:none"></div>
        <button class="btn" id="accSignInBtn" style="width:100%">Sign In</button>
      </div>

      <button type="button" class="account-close" id="accCloseBtn" aria-label="Close">&times;</button>
    </div>
  `;
  document.body.appendChild(overlayEl);

  overlayEl.querySelectorAll('.account-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      overlayEl.querySelectorAll('.account-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      overlayEl.querySelectorAll('.account-pane').forEach(p => {
        p.style.display = p.dataset.pane === tab.dataset.tab ? 'block' : 'none';
      });
    });
  });

  document.getElementById('accCloseBtn').addEventListener('click', closeModal);

  return overlayEl;
}

function closeModal() {
  overlayEl?.classList.remove('open');
}

function showError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg;
  el.style.display = 'block';
}
function hideError(id) {
  const el = document.getElementById(id);
  el.style.display = 'none';
}

export function showWelcomeToast(name, isReturning) {
  const toast = document.createElement('div');
  toast.className = 'welcome-toast';
  toast.innerHTML = `
    <i class="fas fa-circle-check"></i>
    <div>
      <strong>${isReturning ? 'Welcome back' : 'Welcome'}, ${name}!</strong>
      <div>${isReturning ? "Great to see you again." : "Your account's all set."}</div>
    </div>
  `;
  document.body.appendChild(toast);
  requestAnimationFrame(() => toast.classList.add('show'));
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 400);
  }, 3800);
}

function refreshNavCustomer() {
  window.dispatchEvent(new CustomEvent('sandragon:customer-updated'));
}

// If a customer session already exists, resolves immediately with it.
// Otherwise shows the create/sign-in modal and resolves once the person
// completes either flow. Never rejects — closing the modal without
// completing it just leaves the guest as a guest (caller decides what to
// do by never getting its callback invoked).
export function ensureCustomer(onReady) {
  const existing = getCustomer();
  if (existing) { onReady(existing); return; }
  openAccountModal(onReady);
}

export function openAccountModal(onReady) {
  const el = ensureOverlay();
  // reset fields each time it's opened
  ['accName','accPhone','accEmail','accAddress','accPincode','signInPhone'].forEach(id => {
    const f = document.getElementById(id);
    if (f) f.value = '';
  });
  hideError('accNewError');
  hideError('accExistingError');
  el.classList.add('open');

  const createBtn = document.getElementById('accCreateBtn');
  const signInBtn = document.getElementById('accSignInBtn');

  // Replace to drop any previously-bound listener (this modal is reused
  // across calls, so stale closures would otherwise pile up)
  const newCreateBtn = createBtn.cloneNode(true);
  createBtn.replaceWith(newCreateBtn);
  const newSignInBtn = signInBtn.cloneNode(true);
  signInBtn.replaceWith(newSignInBtn);

  newCreateBtn.addEventListener('click', async () => {
    hideError('accNewError');
    const name = document.getElementById('accName').value.trim();
    const phone = document.getElementById('accPhone').value.trim();
    const email = document.getElementById('accEmail').value.trim();
    const address = document.getElementById('accAddress').value.trim();
    const pincode = document.getElementById('accPincode').value.trim();

    if (!name || !phone || !address || !pincode) {
      showError('accNewError', 'Please fill in all required fields.');
      return;
    }
    if (!/^\d{10}$/.test(phone)) {
      showError('accNewError', 'Enter a valid 10-digit mobile number.');
      return;
    }

    newCreateBtn.disabled = true;
    newCreateBtn.textContent = 'Creating account...';
    try {
      const customer = await saveCustomer({ name, phone, email, address, pincode });
      closeModal();
      showWelcomeToast(customer.name, false);
      refreshNavCustomer();
      // Give the toast a moment on screen before any onReady() navigation
      // tears the page down — otherwise it never gets seen.
      setTimeout(() => onReady(customer), 1100);
    } catch (err) {
      console.error(err);
      showError('accNewError', "Couldn't create your account. Please try again.");
    } finally {
      newCreateBtn.disabled = false;
      newCreateBtn.textContent = 'Create Account';
    }
  });

  newSignInBtn.addEventListener('click', async () => {
    hideError('accExistingError');
    const phone = document.getElementById('signInPhone').value.trim();
    if (!/^\d{10}$/.test(phone)) {
      showError('accExistingError', 'Enter a valid 10-digit mobile number.');
      return;
    }
    newSignInBtn.disabled = true;
    newSignInBtn.textContent = 'Signing in...';
    try {
      const customer = await findCustomerByPhone(phone);
      if (!customer) {
        showError('accExistingError', "No account found for this number — switch to \"New Customer\" to create one.");
        return;
      }
      closeModal();
      showWelcomeToast(customer.name, true);
      refreshNavCustomer();
      setTimeout(() => onReady(customer), 1100);
    } catch (err) {
      console.error(err);
      showError('accExistingError', "Couldn't sign you in. Please try again.");
    } finally {
      newSignInBtn.disabled = false;
      newSignInBtn.textContent = 'Sign In';
    }
  });
}
