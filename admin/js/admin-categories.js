import { requireAdmin, setupLogoutButton } from "./admin-auth.js";
import {
  db, collection, getDocs, setDoc, updateDoc, deleteDoc, doc,
  orderBy, query, serverTimestamp
} from "../../js/firebase-init.js";

requireAdmin(() => loadCategories());
setupLogoutButton();

const tbody = document.getElementById('categoriesTableBody');
const modal = document.getElementById('categoryModal');
let editingId = null;

// The categories this storefront originally shipped with — used as a
// one-time seed so switching from the old hardcoded list to this
// Firestore-managed one doesn't orphan any existing product's category.
const SEED_CATEGORIES = [
  { id: 'bats',        name: 'Bats',           icon: 'fa-baseball-bat-ball' },
  { id: 'balls',       name: 'Balls',          icon: 'fa-baseball' },
  { id: 'gloves',      name: 'Gloves',         icon: 'fa-mitten' },
  { id: 'pads-guards', name: 'Pads & Guards',  icon: 'fa-shield-halved' },
  { id: 'helmets',     name: 'Helmets',        icon: 'fa-hard-hat' },
  { id: 'apparel',     name: 'Apparel',        icon: 'fa-shirt' },
  { id: 'shoes',       name: 'Shoes',          icon: 'fa-shoe-prints' },
  { id: 'kit-bags',    name: 'Kit Bags',       icon: 'fa-suitcase-rolling' },
  { id: 'accessories', name: 'Accessories',    icon: 'fa-toolbox' },
];

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'category';
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

async function seedIfEmpty() {
  const snap = await getDocs(collection(db, 'categories'));
  if (!snap.empty) return;
  await Promise.all(SEED_CATEGORIES.map((c, i) =>
    setDoc(doc(db, 'categories', c.id), { name: c.name, icon: c.icon, createdAt: serverTimestamp() })
  ));
}

async function loadCategories() {
  tbody.innerHTML = `<tr><td colspan="4" class="text-center">Loading...</td></tr>`;
  await seedIfEmpty();
  const q = query(collection(db, 'categories'), orderBy('createdAt', 'asc'));
  const snap = await getDocs(q);
  if (snap.empty) {
    tbody.innerHTML = `<tr><td colspan="4" class="text-center">No categories yet.</td></tr>`;
    return;
  }
  tbody.innerHTML = '';
  snap.forEach(docSnap => {
    const c = docSnap.data();
    const id = docSnap.id;
    const row = document.createElement('tr');
    row.innerHTML = `
      <td><i class="fas ${c.icon || 'fa-tag'}" style="font-size:1.2rem;color:var(--gold)"></i></td>
      <td>${escapeHtml(c.name)}</td>
      <td><code>${escapeHtml(id)}</code></td>
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
    btn.addEventListener('click', () => deleteCategory(btn.dataset.delete))
  );
}

async function deleteCategory(id) {
  if (!confirm('Delete this category? Products already using it will keep the old category value, but it will no longer show up as a filter or in the dropdown.')) return;
  await deleteDoc(doc(db, 'categories', id));
  loadCategories();
}

function resetModal() {
  editingId = null;
  document.getElementById('categoryModalTitle').textContent = 'Add Category';
  document.getElementById('editingCategoryId').value = '';
  document.getElementById('cName').value = '';
  document.getElementById('cIcon').value = '';
}

async function openModal(id) {
  resetModal();
  if (id) {
    editingId = id;
    document.getElementById('categoryModalTitle').textContent = 'Edit Category';
    const snap = await getDocs(query(collection(db, 'categories')));
    const target = snap.docs.find(d => d.id === id);
    if (target) {
      const c = target.data();
      document.getElementById('cName').value = c.name || '';
      document.getElementById('cIcon').value = c.icon || '';
    }
  }
  modal.classList.add('open');
}

document.getElementById('addCategoryBtn').addEventListener('click', () => openModal(null));
document.getElementById('cancelCategoryModalBtn').addEventListener('click', () => modal.classList.remove('open'));
modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.remove('open'); });

document.getElementById('saveCategoryBtn').addEventListener('click', async () => {
  const name = document.getElementById('cName').value.trim();
  const icon = document.getElementById('cIcon').value.trim() || 'fa-tag';
  if (!name) { alert('Category name is required.'); return; }

  const btn = document.getElementById('saveCategoryBtn');
  btn.disabled = true;
  try {
    if (editingId) {
      // Renaming doesn't change the slug/ID — every product referencing it
      // keeps working, it just displays under the new name.
      await updateDoc(doc(db, 'categories', editingId), { name, icon });
    } else {
      const slug = slugify(name);
      await setDoc(doc(db, 'categories', slug), { name, icon, createdAt: serverTimestamp() }, { merge: true });
    }
    modal.classList.remove('open');
    loadCategories();
  } catch (err) {
    console.error(err);
    alert('Could not save this category. Check the console for details.');
  } finally {
    btn.disabled = false;
  }
});
