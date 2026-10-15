import { requireAdmin, setupLogoutButton } from "./admin-auth.js";
import { getPointsConfig, savePointsConfig, pointsForAmount, pointsToRupees } from "../../js/points-store.js";

requireAdmin(() => loadSettings());
setupLogoutButton();

const enabledChk = document.getElementById('pEnabled');
const spendInput = document.getElementById('pSpend');
const earnInput = document.getElementById('pEarn');
const valueInput = document.getElementById('pValue');
const preview = document.getElementById('pointsPreview');
const saveStatus = document.getElementById('saveStatus');

function current() {
  return {
    enabled: enabledChk.checked,
    spendAmount: Number(spendInput.value) || 0,
    earnPoints: Number(earnInput.value) || 0,
    pointValue: Number(valueInput.value) || 0
  };
}

async function loadSettings() {
  const cfg = await getPointsConfig();
  enabledChk.checked = cfg.enabled;
  spendInput.value = cfg.spendAmount;
  earnInput.value = cfg.earnPoints;
  valueInput.value = cfg.pointValue;
  renderPreview();
}

function renderPreview() {
  const c = current();
  const label = document.getElementById('pEnabledLabel');
  if (label) { label.textContent = c.enabled ? 'ON' : 'OFF'; label.style.color = c.enabled ? 'var(--success)' : 'var(--danger)'; }
  if (!c.enabled) {
    preview.innerHTML = `<i class="fas fa-circle-pause gold"></i> Points are switched off. Customers won't earn or redeem points, and nothing about points is shown in the store.`;
    return;
  }
  if (!c.spendAmount || !c.earnPoints || !c.pointValue) {
    preview.innerHTML = `<i class="fas fa-circle-info gold"></i> Fill in all three numbers to see an example.`;
    return;
  }
  const example = 1250;
  const earned = pointsForAmount(example, { ...c });
  preview.innerHTML = `<i class="fas fa-circle-check gold"></i> Every <strong>₹${c.spendAmount.toLocaleString('en-IN')}</strong> spent earns <strong>${c.earnPoints} points</strong>, and <strong>1 point = ₹${c.pointValue}</strong>.<br>
    Example: an order of ₹${example.toLocaleString('en-IN')} earns <strong>${earned} points</strong>, worth <strong>₹${pointsToRupees(earned, c).toLocaleString('en-IN')}</strong> off a later order.`;
}

[spendInput, earnInput, valueInput].forEach(el => el.addEventListener('input', renderPreview));
enabledChk.addEventListener('change', renderPreview);

document.getElementById('savePointsBtn').addEventListener('click', async () => {
  const c = current();
  if (c.enabled && (!c.spendAmount || !c.earnPoints || !c.pointValue)) {
    saveStatus.textContent = 'Fill in all three numbers, or switch the programme off.';
    saveStatus.style.color = 'var(--danger)';
    return;
  }
  if (!c.enabled && !confirm('The points programme is OFF.\n\nCustomers will NOT earn or redeem points while it is off.\n\nSave with points switched OFF?')) return;
  const btn = document.getElementById('savePointsBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    await savePointsConfig(c);
    saveStatus.textContent = c.enabled ? 'Saved! Points are ON.' : 'Saved. Points are OFF.';
    saveStatus.style.color = 'var(--success)';
  } catch (err) {
    console.error(err);
    saveStatus.textContent = 'Could not save. Check console for details.';
    saveStatus.style.color = 'var(--danger)';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Points Settings';
    setTimeout(() => { saveStatus.textContent = ''; }, 3500);
  }
});
