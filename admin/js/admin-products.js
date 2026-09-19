import { requireAdmin, setupLogoutButton } from "./admin-auth.js";
import {
  db, collection, getDocs, addDoc, updateDoc, deleteDoc, doc,
  orderBy, query, serverTimestamp
} from "../../js/firebase-init.js";
import { cloudinaryConfig } from "../../js/config.js";
import { CATEGORIES, categoryName } from "../../js/categories.js";

requireAdmin(() => loadProducts());
setupLogoutButton();

const categorySelect = document.getElementById('fCategory');
if (categorySelect) {
  categorySelect.innerHTML = `<option value="">Select a category…</option>` +
    CATEGORIES.map(c => `<option value="${c.id}">${c.name}</option>`).join('');
}

let uploadedImages = [];
let options = []; // [{ name: 'Color', values: ['Black','Red'] }, ...]
let editingId = null;

const tbody = document.getElementById('productsTableBody');
const modal = document.getElementById('productModal');

async function loadProducts() {
  tbody.innerHTML = `<tr><td colspan="8" class="text-center">Loading...</td></tr>`;
  const q = query(collection(db, 'products'), orderBy('createdAt', 'desc'));
  const snap = await getDocs(q);
  if (snap.empty) {
    tbody.innerHTML = `<tr><td colspan="8" class="text-center">No products yet.</td></tr>`;
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
      <td>${p.category ? categoryName(p.category) || p.category : '—'}</td>
      <td>₹${Number(p.price).toLocaleString('en-IN')}</td>
      <td>${p.stock ?? '—'}</td>
      <td><span class="badge ${p.active ? 'confirmed' : 'placed'}">${p.active ? 'Live' : 'Hidden'}</span></td>
      <td>
        <button class="btn small outline" data-edit="${id}">Edit</button>
        <button class="btn small danger" data-delete="${id}">Delete</button>
      </td>
      <td>
        <button class="btn small outline" data-reviews="${id}" data-name="${(p.name || '').replace(/"/g,'&quot;')}"><i class="fas fa-star"></i> Reviews</button>
      </td>`;
    tbody.appendChild(row);
  });

  tbody.querySelectorAll('[data-edit]').forEach(btn =>
    btn.addEventListener('click', () => openModal(btn.dataset.edit))
  );
  tbody.querySelectorAll('[data-delete]').forEach(btn =>
    btn.addEventListener('click', () => deleteProduct(btn.dataset.delete))
  );
  tbody.querySelectorAll('[data-reviews]').forEach(btn =>
    btn.addEventListener('click', () => {
      window.dispatchEvent(new CustomEvent('sandragon:open-product-reviews', {
        detail: { productId: btn.dataset.reviews, productName: btn.dataset.name }
      }));
    })
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
  options = [];
  document.getElementById('modalTitle').textContent = 'Add Product';
  document.getElementById('productId').value = '';
  document.getElementById('fName').value = '';
  document.getElementById('fDescription').value = '';
  if (categorySelect) categorySelect.value = '';
  document.getElementById('fPrice').value = '';
  document.getElementById('fStock').value = '';
  document.getElementById('fVendorName').value = '';
  document.getElementById('fVendorPhone').value = '';
  document.getElementById('fActive').checked = true;
  document.getElementById('fCouponExcluded').checked = false;
  renderImagePreview();
  renderOptionGroups();
}

// Products saved before the generic "options" system existed still only
// have `colors`/`sizes` arrays — surface those as regular option groups so
// editing an old product doesn't wipe them; saving migrates it to `options`.
function optionsFromProduct(p) {
  if (Array.isArray(p.options) && p.options.length) {
    return p.options.map(o => ({ name: o.name, values: [...(o.values || [])] }));
  }
  const legacy = [];
  if (p.colors?.length) legacy.push({ name: 'Color', values: [...p.colors] });
  if (p.sizes?.length) legacy.push({ name: 'Size', values: [...p.sizes] });
  return legacy;
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
      if (categorySelect) categorySelect.value = p.category || '';
      document.getElementById('fPrice').value = p.price || '';
      document.getElementById('fStock').value = p.stock ?? '';
      document.getElementById('fVendorName').value = p.vendorName || '';
      document.getElementById('fVendorPhone').value = p.vendorPhone || '';
      document.getElementById('fActive').checked = !!p.active;
      document.getElementById('fCouponExcluded').checked = !!p.couponExcluded;
      uploadedImages = p.images || [];
      options = optionsFromProduct(p);
      renderImagePreview();
      renderOptionGroups();
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

// ---- Product options (Color / Size / Flavour / Contains / custom…) ----
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

function renderOptionGroups() {
  const wrap = document.getElementById('optionGroups');
  if (!wrap) return;
  wrap.innerHTML = options.map((opt, gi) => `
    <div class="option-group-admin" data-group="${gi}">
      <div class="option-group-admin-top">
        <strong>${escapeHtml(opt.name)}</strong>
        <button type="button" class="option-group-remove" data-remove-group="${gi}" aria-label="Remove ${escapeHtml(opt.name)}"><i class="fas fa-times"></i></button>
      </div>
      <div class="multi-tag-input" data-values="${gi}"></div>
    </div>
  `).join('');

  options.forEach((opt, gi) => {
    renderOptionValues(wrap.querySelector(`[data-values="${gi}"]`), opt);
  });

  wrap.querySelectorAll('[data-remove-group]').forEach(btn =>
    btn.addEventListener('click', () => {
      options.splice(+btn.dataset.removeGroup, 1);
      renderOptionGroups();
    })
  );
}

function renderOptionValues(container, opt) {
  if (!container) return;
  const chips = opt.values.map((val, i) => `
    <span class="tag-chip">${escapeHtml(val)}<button type="button" data-remove-val="${i}">×</button></span>
  `).join('');
  container.innerHTML = chips + `<input type="text" class="tag-chip-input" placeholder="Type a value & press Enter">`;

  container.querySelector('input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.value.trim()) {
      e.preventDefault();
      opt.values.push(e.target.value.trim());
      renderOptionValues(container, opt);
    }
  });
  container.querySelectorAll('[data-remove-val]').forEach(btn =>
    btn.addEventListener('click', () => {
      opt.values.splice(+btn.dataset.removeVal, 1);
      renderOptionValues(container, opt);
    })
  );
}

document.getElementById('addOptionTypeBtn').addEventListener('click', () => {
  const select = document.getElementById('newOptionType');
  let typeName = select.value;
  if (typeName === '__custom') {
    typeName = (prompt('Enter a custom option type name (e.g. Fragrance, Weight):') || '').trim();
    if (!typeName) return;
  }
  if (!typeName) { alert('Please select or enter an option type.'); return; }
  if (options.some(o => o.name.toLowerCase() === typeName.toLowerCase())) {
    alert(`"${typeName}" is already added.`);
    return;
  }
  options.push({ name: typeName, values: [] });
  renderOptionGroups();
  select.value = '';
});

// ---- Save product ----
document.getElementById('saveProductBtn').addEventListener('click', async () => {
  // Auto-commit any text still sitting in an option's value input that the
  // admin typed but never pressed Enter for — otherwise it's silently lost.
  document.querySelectorAll('#optionGroups [data-values] input').forEach(input => {
    const val = input.value.trim();
    if (!val) return;
    const gi = +input.closest('[data-values]').dataset.values;
    options[gi]?.values.push(val);
  });
  renderOptionGroups();

  const name = document.getElementById('fName').value.trim();
  const price = Number(document.getElementById('fPrice').value);
  const category = categorySelect ? categorySelect.value : '';
  if (!name || !price) { alert('Name and price are required.'); return; }
  if (!category) { alert('Please select a category.'); return; }

  const payload = {
    name,
    description: document.getElementById('fDescription').value.trim(),
    category,
    price,
    stock: document.getElementById('fStock').value === '' ? null : Number(document.getElementById('fStock').value),
    vendorName: document.getElementById('fVendorName').value.trim(),
    vendorPhone: document.getElementById('fVendorPhone').value.trim(),
    images: uploadedImages,
    options: options.filter(o => o.values.length > 0),
    active: document.getElementById('fActive').checked,
    couponExcluded: document.getElementById('fCouponExcluded').checked
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
