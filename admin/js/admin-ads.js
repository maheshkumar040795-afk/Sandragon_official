import { requireAdmin } from "./admin-auth.js";
import { cloudinaryConfig } from "../../js/config.js";
import { getAllAds, createAd, updateAd, deleteAd } from "../../js/ads-store.js";

requireAdmin(() => loadAds());

const tbody = document.getElementById('adsTableBody');
const modal = document.getElementById('adModal');
let adsCache = [];
let editingId = null;
let uploadedImage = '';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

async function loadAds() {
  tbody.innerHTML = `<tr><td colspan="5" class="text-center">Loading...</td></tr>`;
  adsCache = await getAllAds();
  if (!adsCache.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="text-center">No ads posted yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = adsCache.map(ad => `
    <tr>
      <td><img src="${ad.imageUrl}" style="width:70px;height:32px;object-fit:cover;border-radius:6px"></td>
      <td>${ad.title ? escapeHtml(ad.title) : '<span class="stock-note">—</span>'}</td>
      <td>${ad.linkUrl ? `<span class="stock-note">${escapeHtml(ad.linkUrl)}</span>` : '<span class="stock-note">—</span>'}</td>
      <td><span class="badge ${ad.active ? 'confirmed' : 'placed'}">${ad.active ? 'Active' : 'Paused'}</span></td>
      <td>
        <button class="btn small outline" data-edit-ad="${ad.id}">Edit</button>
        <button class="btn small danger" data-delete-ad="${ad.id}">Delete</button>
      </td>
    </tr>
  `).join('');

  tbody.querySelectorAll('[data-edit-ad]').forEach(btn =>
    btn.addEventListener('click', () => openModal(btn.dataset.editAd))
  );
  tbody.querySelectorAll('[data-delete-ad]').forEach(btn =>
    btn.addEventListener('click', () => removeAd(btn.dataset.deleteAd))
  );
}

async function removeAd(id) {
  if (!confirm('Delete this ad? This cannot be undone.')) return;
  await deleteAd(id);
  loadAds();
}

function renderImagePreview() {
  const grid = document.getElementById('adImagePreview');
  grid.innerHTML = uploadedImage
    ? `<div style="position:relative"><img src="${uploadedImage}"><button type="button" id="removeAdImageBtn" style="position:absolute;top:-6px;right:-6px;background:#c0392b;color:#fff;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer">×</button></div>`
    : '';
  document.getElementById('removeAdImageBtn')?.addEventListener('click', () => {
    uploadedImage = '';
    renderImagePreview();
  });
}

function resetModal() {
  editingId = null;
  uploadedImage = '';
  document.getElementById('adModalTitle').textContent = 'Post New Ad';
  document.getElementById('adTitle').value = '';
  document.getElementById('adLink').value = '';
  document.getElementById('adActive').checked = true;
  renderImagePreview();
}

function openModal(id) {
  resetModal();
  if (id) {
    const ad = adsCache.find(a => a.id === id);
    if (ad) {
      editingId = id;
      document.getElementById('adModalTitle').textContent = 'Edit Ad';
      document.getElementById('adTitle').value = ad.title || '';
      document.getElementById('adLink').value = ad.linkUrl || '';
      document.getElementById('adActive').checked = !!ad.active;
      uploadedImage = ad.imageUrl || '';
      renderImagePreview();
    }
  }
  modal.classList.add('open');
}

document.getElementById('addAdBtn').addEventListener('click', () => openModal(null));
document.getElementById('cancelAdModalBtn').addEventListener('click', () => modal.classList.remove('open'));

document.getElementById('uploadAdImageBtn').addEventListener('click', () => {
  if (cloudinaryConfig.cloudName === 'YOUR_CLOUDINARY_CLOUD_NAME') {
    alert('Set your Cloudinary cloud name + upload preset in js/config.js first.');
    return;
  }
  const widget = cloudinary.createUploadWidget({
    cloudName: cloudinaryConfig.cloudName,
    uploadPreset: cloudinaryConfig.uploadPreset,
    multiple: false,
    sources: ['local', 'camera', 'url']
  }, (error, result) => {
    if (!error && result.event === 'success') {
      uploadedImage = result.info.secure_url;
      renderImagePreview();
    }
  });
  widget.open();
});

document.getElementById('saveAdBtn').addEventListener('click', async () => {
  if (!uploadedImage) { alert('Please upload an ad image.'); return; }

  const payload = {
    imageUrl: uploadedImage,
    title: document.getElementById('adTitle').value.trim(),
    linkUrl: document.getElementById('adLink').value.trim(),
    active: document.getElementById('adActive').checked
  };

  const btn = document.getElementById('saveAdBtn');
  btn.disabled = true;
  btn.textContent = 'Saving...';
  try {
    if (editingId) {
      await updateAd(editingId, payload);
    } else {
      await createAd(payload);
    }
    modal.classList.remove('open');
    loadAds();
  } catch (err) {
    console.error(err);
    alert(`Could not save ad: ${err.message || err}\n\nIf this says "permission" or "insufficient", the Firestore rules on your live Firebase project need updating — see firestore.rules in the project files.`);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Save Ad';
  }
});
