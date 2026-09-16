import { requireAdmin, setupLogoutButton } from "./admin-auth.js";
import {
  db, collection, getDocs, doc, setDoc, deleteDoc, updateDoc, Timestamp
} from "../../js/firebase-init.js";

requireAdmin(() => loadCoupons());
setupLogoutButton();

const tbody = document.getElementById('couponsTableBody');
const modal = document.getElementById('couponModal');
let editingCode = null;

function formatDate(ts) {
  if (!ts?.toDate) return '—';
  return ts.toDate().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

async function loadCoupons() {
  tbody.innerHTML = `<tr><td colspan="7" class="text-center">Loading...</td></tr>`;
  const snap = await getDocs(collection(db, 'coupons'));
  if (snap.empty) {
    tbody.innerHTML = `<tr><td colspan="7" class="text-center">No coupons yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = '';
  snap.forEach(docSnap => {
    const c = docSnap.data();
    const code = docSnap.id;
    const discount = c.type === 'percent' ? `${c.value}%` : `₹${Number(c.value).toLocaleString('en-IN')}`;
    const expired = c.expiresAt?.toDate && c.expiresAt.toDate() < new Date();
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><strong>${code}</strong></td>
      <td>${discount}</td>
      <td>${c.minOrder ? '₹' + Number(c.minOrder).toLocaleString('en-IN') : '—'}</td>
      <td>${c.usageCount || 0}</td>
      <td>${c.expiresAt ? formatDate(c.expiresAt) : 'Never'}</td>
      <td><span class="badge ${c.active && !expired ? 'confirmed' : 'placed'}">${expired ? 'Expired' : (c.active ? 'Active' : 'Disabled')}</span></td>
      <td>
        <button class="btn small outline" data-edit="${code}">Edit</button>
        <button class="btn small danger" data-delete="${code}">Delete</button>
      </td>`;
    tbody.appendChild(row);
  });

  tbody.querySelectorAll('[data-edit]').forEach(btn =>
    btn.addEventListener('click', () => openModal(btn.dataset.edit, snap.docs.find(d => d.id === btn.dataset.edit).data()))
  );
  tbody.querySelectorAll('[data-delete]').forEach(btn =>
    btn.addEventListener('click', () => deleteCoupon(btn.dataset.delete))
  );
}

async function deleteCoupon(code) {
  if (!confirm(`Delete coupon "${code}"? This cannot be undone.`)) return;
  await deleteDoc(doc(db, 'coupons', code));
  loadCoupons();
}

function resetModal() {
  editingCode = null;
  document.getElementById('modalTitle').textContent = 'New Coupon';
  document.getElementById('fCode').value = '';
  document.getElementById('fCode').disabled = false;
  document.getElementById('fType').value = 'percent';
  document.getElementById('fValue').value = '';
  document.getElementById('fMinOrder').value = '';
  document.getElementById('fExpiry').value = '';
  document.getElementById('fActive').checked = true;
}

function openModal(code, data) {
  resetModal();
  if (code) {
    editingCode = code;
    document.getElementById('modalTitle').textContent = 'Edit Coupon';
    document.getElementById('fCode').value = code;
    document.getElementById('fCode').disabled = true; // code is the doc ID — don't allow changing it in place
    document.getElementById('fType').value = data.type || 'percent';
    document.getElementById('fValue').value = data.value || '';
    document.getElementById('fMinOrder').value = data.minOrder || '';
    if (data.expiresAt?.toDate) {
      document.getElementById('fExpiry').value = data.expiresAt.toDate().toISOString().slice(0, 10);
    }
    document.getElementById('fActive').checked = !!data.active;
  }
  modal.classList.add('open');
}

document.getElementById('addCouponBtn').addEventListener('click', () => openModal(null));
document.getElementById('cancelModalBtn').addEventListener('click', () => modal.classList.remove('open'));

document.getElementById('saveCouponBtn').addEventListener('click', async () => {
  const code = document.getElementById('fCode').value.trim().toUpperCase();
  const value = Number(document.getElementById('fValue').value);
  if (!code) { alert('Coupon code is required.'); return; }
  if (!value || value <= 0) { alert('Enter a valid discount value.'); return; }

  const expiryStr = document.getElementById('fExpiry').value;
  const payload = {
    code,
    type: document.getElementById('fType').value,
    value,
    minOrder: document.getElementById('fMinOrder').value === '' ? 0 : Number(document.getElementById('fMinOrder').value),
    expiresAt: expiryStr ? Timestamp.fromDate(new Date(expiryStr + 'T23:59:59')) : null,
    active: document.getElementById('fActive').checked,
    usageCount: 0
  };

  try {
    if (editingCode) {
      // Preserve usageCount on edit rather than resetting it.
      const { usageCount, ...rest } = payload;
      await updateDoc(doc(db, 'coupons', editingCode), rest);
    } else {
      await setDoc(doc(db, 'coupons', code), payload);
    }
    modal.classList.remove('open');
    loadCoupons();
  } catch (err) {
    console.error(err);
    alert('Could not save coupon. Check console for details.');
  }
});
