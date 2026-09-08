import { requireAdmin, setupLogoutButton } from "./admin-auth.js";
import {
  db, collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
  orderBy, query, serverTimestamp
} from "../../js/firebase-init.js";
import { cloudinaryConfig } from "../../js/config.js";

requireAdmin(() => loadProducts());
setupLogoutButton();

let uploadedImages = [];
let colors = [];
let sizes = [];
let editingId = null;

const tbody = document.getElementById('productsTableBody');
const modal = document.getElementById('productModal');

async function loadProducts() {
  tbody.innerHTML = `<tr><td colspan="6" class="text-center">Loading...</td></tr>`;
  const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  if (snap.empty) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center">No products yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = '';
  snap.forEach(docSnap => {
    const p = docSnap.data();
    const id = docSnap.id;
    const img = (p.images && p.images[0]) || '';
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><img src="${img}" style="width:44px;height:44px;object-fit:cover;border-radius:6px"></td>
      <td>${p.name}</td>
      <td>₹${Number(p.price).toLocaleString('en-IN')}</td>
      <td>${p.stock ?? '—'}</td>
      <td><span class="badge ${p.active ? 'confirmed' : 'placed'}">${p.active ? 'Live' : 'Hidden'}</span></td>
      <td>
        <button class="btn small outline" data-edit="${id}">Edit</button>
        <button class="btn small danger" data-delete="${id}">Delete</button>
      </td>`;
    tbody.appendChild(row);
  });

  tbody.querySelectorAll('[data-edit]').forEach(btn =>
    btn.addEventListener('click', () => openModal(btn.dataset.edit))
  );
  tbody.querySelectorAll('[data-delete]').forEach(btn =>
    btn.addEventListener('click', () => deleteProduct(btn.dataset.delete))
  );
}

async function deleteProduct(id) {
  if (!confirm('Delete this product? This cannot be undone.')) return;
  await deleteDoc(doc(db, 'products', id));
  loadProducts();
}

function resetModal() {
  editingId = null;
  uploadedImages = [];
  colors = [];
  sizes = [];
  document.getElementById('modalTitle').textContent = 'Add Product';
  document.getElementById('productId').value = '';
  document.getElementById('fName').value = '';
  document.getElementById('fDescription').value = '';
  document.getElementById('fPrice').value = '';
  document.getElementById('fStock').value = '';
  document.getElementById('fActive').checked = true;
  renderImagePreview();
  renderTags('colorTagInput', 'colorInputField', colors);
  renderTags('sizeTagInput', 'sizeInputField', sizes);
}

async function openModal(id) {
  resetModal();
  if (id) {
    editingId = id;
    document.getElementById('modalTitle').textContent = 'Edit Product';
    const snap = await getDocs(query(collection(db, 'products')));
    const target = snap.docs.find(d => d.id === id);
    if (target) {
      const p = target.data();
      document.getElementById('fName').value = p.name || '';
      document.getElementById('fDescription').value = p.description || '';
      document.getElementById('fPrice').value = p.price || '';
      document.getElementById('fStock').value = p.stock ?? '';
      document.getElementById('fActive').checked = !!p.active;
      uploadedImages = p.images || [];
      colors = p.colors || [];
      sizes = p.sizes || [];
      renderImagePreview();
      renderTags('colorTagInput', 'colorInputField', colors);
      renderTags('sizeTagInput', 'sizeInputField', sizes);
    }
  }
  modal.classList.add('open');
}

document.getElementById('addProductBtn').addEventListener('click', () => openModal(null));
document.getElementById('cancelModalBtn').addEventListener('click', () => modal.classList.remove('open'));

// ---- Cloudinary upload widget ----
document.getElementById('uploadImagesBtn').addEventListener('click', () => {
  if (cloudinaryConfig.cloudName === 'YOUR_CLOUDINARY_CLOUD_NAME') {
    alert('Set your Cloudinary cloud name + upload preset in js/config.js first.');
    return;
  }
  const widget = cloudinary.createUploadWidget({
    cloudName: cloudinaryConfig.cloudName,
    uploadPreset: cloudinaryConfig.uploadPreset,
    multiple: true,
    maxFiles: 6,
    sources: ['local', 'camera']
  }, (error, result) => {
    if (!error && result.event === 'success') {
      uploadedImages.push(result.info.secure_url);
      renderImagePreview();
    }
  });
  widget.open();
});

function renderImagePreview() {
  const grid = document.getElementById('imagePreviewGrid');
  grid.innerHTML = uploadedImages.map((url, i) => `
    <div style="position:relative">
      <img src="${url}">
      <button type="button" data-remove-img="${i}" style="position:absolute;top:-6px;right:-6px;background:#c0392b;color:#fff;border:none;border-radius:50%;width:20px;height:20px;cursor:pointer">×</button>
    </div>
  `).join('');
  grid.querySelectorAll('[data-remove-img]').forEach(btn =>
    btn.addEventListener('click', () => {
      uploadedImages.splice(+btn.dataset.removeImg, 1);
      renderImagePreview();
    })
  );
}

// ---- Tag inputs (colors / sizes) ----
function renderTags(containerId, inputId, arr) {
  const container = document.getElementById(containerId);
  const chips = arr.map((val, i) => `
    <span class="tag-chip">${val}<button type="button" data-remove-tag="${i}" data-arr="${containerId}">×</button></span>
  `).join('');
  container.innerHTML = chips + `<input type="text" class="tag-chip-input" id="${inputId}" placeholder="Type & press Enter">`;

  document.getElementById(inputId).addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      e.preventDefault();
      arr.push(e.target.value.trim());
      renderTags(containerId, inputId, arr);
    }
  });
  container.querySelectorAll('[data-remove-tag]').forEach(btn =>
    btn.addEventListener('click', () => {
      arr.splice(+btn.dataset.removeTag, 1);
      renderTags(containerId, inputId, arr);
    })
  );
}

// ---- Save product ----
document.getElementById('saveProductBtn').addEventListener('click', async () => {
  const name = document.getElementById('fName').value.trim();
  const price = Number(document.getElementById('fPrice').value);
  if (!name || !price) { alert('Name and price are required.'); return; }

  const payload = {
    name,
    description: document.getElementById('fDescription').value.trim(),
    price,
    stock: document.getElementById('fStock').value === '' ? null : Number(document.getElementById('fStock').value),
    images: uploadedImages,
    colors,
    sizes,
    active: document.getElementById('fActive').checked
  };

  try {
    if (editingId) {
      await updateDoc(doc(db, 'products', editingId), payload);
    } else {
      await addDoc(collection(db, 'products'), { ...payload, createdAt: serverTimestamp() });
    }
    modal.classList.remove('open');
    loadProducts();
  } catch (err) {
    console.error(err);
    alert('Could not save product. Check console for details.');
  }
});
