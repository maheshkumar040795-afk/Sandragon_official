import { requireAdmin, setupLogoutButton } from "./admin-auth.js";
import { db, collection, getDocs } from "../../js/firebase-init.js";
import { exportToExcel, fmtDate } from "./admin-export.js";
import { getPointsConfig, savePointsConfig, pointsForAmount, pointsToRupees, redeemCapRupees } from "../../js/points-store.js";

requireAdmin(() => loadSettings());
setupLogoutButton();

const enabledChk = document.getElementById('pEnabled');
const spendInput = document.getElementById('pSpend');
const earnInput = document.getElementById('pEarn');
const valueInput = document.getElementById('pValue');
const maxPctInput = document.getElementById('pMaxPct');
const preview = document.getElementById('pointsPreview');
const saveStatus = document.getElementById('saveStatus');

function current() {
  return {
    enabled: enabledChk.checked,
    spendAmount: Number(spendInput.value) || 0,
    earnPoints: Number(earnInput.value) || 0,
    pointValue: Number(valueInput.value) || 0,
    maxRedeemPercent: Number(maxPctInput.value) || 0
  };
}

async function loadSettings() {
  const cfg = await getPointsConfig();
  enabledChk.checked = cfg.enabled;
  spendInput.value = cfg.spendAmount;
  earnInput.value = cfg.earnPoints;
  valueInput.value = cfg.pointValue;
  maxPctInput.value = cfg.maxRedeemPercent;
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
  if (!c.spendAmount || !c.earnPoints || !c.pointValue || !c.maxRedeemPercent) {
    preview.innerHTML = `<i class="fas fa-circle-info gold"></i> Fill in all four numbers to see an example.`;
    return;
  }
  const cfg = { ...c, enabled: true };
  const item = 449;
  const capRs = redeemCapRupees(item, cfg);
  const usePts = Math.floor(capRs / c.pointValue);
  const useRs = pointsToRupees(usePts, cfg);
  const pay = item - useRs;
  const earnedNormal = pointsForAmount(item, cfg);
  preview.innerHTML = `<i class="fas fa-circle-check gold"></i> Every <strong>₹${c.spendAmount.toLocaleString('en-IN')}</strong> spent earns <strong>${c.earnPoints} points</strong>, <strong>1 point = ₹${c.pointValue}</strong>, and points can pay for up to <strong>${c.maxRedeemPercent}%</strong> of eligible items.<br>
    Example: buying a ₹${item} product normally earns <strong>${earnedNormal} points</strong>. A customer with 550 points can instead redeem <strong>${usePts} points</strong> (${c.maxRedeemPercent}% of ₹${item}, rounded) and pay <strong>₹${pay}</strong>, and that order earns <strong>no new points</strong>.<br>
    Orders with a coupon can't use points and earn no points.`;
}

[spendInput, earnInput, valueInput, maxPctInput].forEach(el => el.addEventListener('input', renderPreview));
enabledChk.addEventListener('change', renderPreview);

document.getElementById('savePointsBtn').addEventListener('click', async () => {
  const c = current();
  if (c.enabled && (!c.spendAmount || !c.earnPoints || !c.pointValue || !c.maxRedeemPercent)) {
    saveStatus.textContent = 'Fill in all four numbers, or switch the programme off.';
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

// ---- Export Excel: customers and their points ----
document.getElementById('exportCustomersBtn')?.addEventListener('click', async () => {
  const cfg = current();
  const snap = await getDocs(collection(db, 'customers'));
  const rows = snap.docs.map(d => {
    const c = d.data();
    const bal = Number(c.pointsBalance) || 0;
    return {
      'Name': c.name || '',
      'Phone': c.phone || d.id,
      'Email': c.email || '',
      'Address': c.address || '',
      'Pincode': c.pincode || '',
      'Points Balance': bal,
      'Balance Worth (₹)': pointsToRupees(bal, cfg),
      'Total Points Earned': Number(c.pointsEarnedTotal) || 0,
      'Joined': fmtDate(c.createdAt)
    };
  }).sort((a, b) => b['Points Balance'] - a['Points Balance']);
  exportToExcel('sandragon-customers-points', [{ name: 'Customers', rows }]);
});
