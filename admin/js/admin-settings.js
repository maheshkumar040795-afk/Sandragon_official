import { requireAdmin, setupLogoutButton } from "./admin-auth.js";
import { getShippingConfig, saveShippingConfig } from "../../js/shipping-store.js";

requireAdmin(() => loadSettings());
setupLogoutButton();

const thresholdInput = document.getElementById('fThreshold');
const chargeInput = document.getElementById('fCharge');
const freeAllChk = document.getElementById('fFreeAll');
const preview = document.getElementById('settingsPreview');
const saveStatus = document.getElementById('saveStatus');

async function loadSettings() {
  const cfg = await getShippingConfig();
  thresholdInput.value = cfg.freeThreshold || '';
  chargeInput.value = cfg.flatCharge || '';
  freeAllChk.checked = Number(cfg.flatCharge) === 0;
  syncFreeAllState();
  renderPreview();
}

function syncFreeAllState() {
  const isFree = freeAllChk.checked;
  chargeInput.disabled = isFree;
  chargeInput.style.opacity = isFree ? .5 : 1;
}

function renderPreview() {
  const isFree = freeAllChk.checked;
  const threshold = Number(thresholdInput.value) || 0;
  const charge = isFree ? 0 : (Number(chargeInput.value) || 0);
  if (isFree || charge === 0) {
    preview.innerHTML = `<i class="fas fa-circle-check gold"></i> All orders currently ship free.`;
  } else {
    preview.innerHTML = `<i class="fas fa-circle-info gold"></i> Orders under <strong>₹${threshold.toLocaleString('en-IN')}</strong> pay a <strong>₹${charge.toLocaleString('en-IN')}</strong> delivery charge. <strong>₹${threshold.toLocaleString('en-IN')}</strong> and above ships free.`;
  }
}

[thresholdInput, chargeInput].forEach(el => el.addEventListener('input', renderPreview));
freeAllChk.addEventListener('change', () => { syncFreeAllState(); renderPreview(); });

document.getElementById('saveSettingsBtn').addEventListener('click', async () => {
  const isFree = freeAllChk.checked;
  const freeThreshold = Number(thresholdInput.value) || 0;
  const flatCharge = isFree ? 0 : (Number(chargeInput.value) || 0);

  if (!isFree && !freeThreshold) {
    saveStatus.textContent = 'Set a free-delivery threshold, or tick "Always free delivery".';
    saveStatus.style.color = 'var(--danger)';
    return;
  }

  const btn = document.getElementById('saveSettingsBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    await saveShippingConfig({ freeThreshold, flatCharge });
    saveStatus.textContent = 'Saved!';
    saveStatus.style.color = 'var(--success)';
    renderPreview();
  } catch (err) {
    console.error(err);
    saveStatus.textContent = 'Could not save. Check console for details.';
    saveStatus.style.color = 'var(--danger)';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Delivery Settings';
    setTimeout(() => { saveStatus.textContent = ''; }, 3500);
  }
});
