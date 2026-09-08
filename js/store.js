import { db, collection, getDocs, query, where } from "./firebase-init.js";
import { CATEGORIES, categoryName } from "./categories.js";
import { rankResults } from "./nav-features.js";
import "./cart-store.js";

const grid = document.getElementById('productGrid');
const pillsWrap = document.getElementById('categoryPills');
const bannerWrap = document.getElementById('searchBanner');

let allProducts = [];
let activeCategory = new URLSearchParams(window.location.search).get('category') || '';
let activeSearch = new URLSearchParams(window.location.search).get('search') || '';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

function cardHtml(p, id) {
  const img = (p.images && p.images[0]) || 'assets/logo.jpeg';
  const tag = p.category ? `<span class="cat-tag">${escapeHtml(categoryName(p.category) || p.category)}</span>` : '';
  return `
    ${tag}
    <div class="img-wrap"><img src="${img}" alt="${escapeHtml(p.name)}" loading="lazy"></div>
    <div class="info">
      <div class="name">${escapeHtml(p.name)}</div>
      <div class="price">₹${Number(p.price).toLocaleString('en-IN')}</div>
    </div>`;
}

function renderGrid() {
  let items = allProducts;

  if (activeSearch) {
    items = rankResults(items.map(x => ({ ...x.data, id: x.id, image: (x.data.images && x.data.images[0]) || '' })), activeSearch)
      .map(r => allProducts.find(x => x.id === r.id));
  }
  if (activeCategory) {
    items = items.filter(x => x.data.category === activeCategory);
  }

  if (bannerWrap) {
    if (activeSearch) {
      bannerWrap.innerHTML = `Showing ${items.length} result${items.length === 1 ? '' : 's'} for "${escapeHtml(activeSearch)}"
        <a id="clearSearchLink">Clear search</a>`;
      bannerWrap.style.display = 'block';
      document.getElementById('clearSearchLink')?.addEventListener('click', () => {
        activeSearch = '';
        updateUrl();
        renderGrid();
      });
    } else {
      bannerWrap.style.display = 'none';
      bannerWrap.innerHTML = '';
    }
  }

  if (!items.length) {
    grid.innerHTML = `<div class="empty-state">No products found${activeCategory ? ' in this category' : ''}${activeSearch ? ' for your search' : ''}. Try a different filter!</div>`;
    return;
  }

  grid.innerHTML = '';
  items.forEach(({ id, data: p }) => {
    const card = document.createElement('a');
    card.href = `product.html?id=${id}`;
    card.className = 'product-card';
    card.innerHTML = cardHtml(p, id);
    grid.appendChild(card);
  });
}

function updateUrl() {
  const params = new URLSearchParams();
  if (activeCategory) params.set('category', activeCategory);
  if (activeSearch) params.set('search', activeSearch);
  const qs = params.toString();
  history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
}

function renderPills() {
  if (!pillsWrap) return;
  const presentCategoryIds = new Set(allProducts.map(x => x.data.category).filter(Boolean));
  const usable = CATEGORIES.filter(c => presentCategoryIds.has(c.id));
  if (!usable.length) { pillsWrap.style.display = 'none'; return; }

  pillsWrap.innerHTML = `
    <div class="cat-pill ${!activeCategory ? 'active' : ''}" data-cat="">All</div>
    ${usable.map(c => `
      <div class="cat-pill ${activeCategory === c.id ? 'active' : ''}" data-cat="${c.id}">
        <i class="fas ${c.icon}"></i> ${c.name}
      </div>
    `).join('')}
  `;
  pillsWrap.querySelectorAll('.cat-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      activeCategory = pill.dataset.cat;
      pillsWrap.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      updateUrl();
      renderGrid();
    });
  });
}

async function loadProducts() {
  try {
    // No orderBy() in the Firestore query itself: pairing where() with
    // orderBy() on a different field needs a composite index created in
    // the Firebase console first, and this app shouldn't depend on that
    // manual step. Sort client-side instead once the (small) product
    // catalog is fetched.
    const q = query(
      collection(db, 'products'),
      where('active', '==', true)
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      grid.innerHTML = `<div class="empty-state">No products yet. Check back soon!</div>`;
      if (pillsWrap) pillsWrap.style.display = 'none';
      return;
    }

    allProducts = snap.docs
      .map(d => ({ id: d.id, data: d.data() }))
      .sort((a, b) => {
        const ta = a.data.createdAt?.toMillis ? a.data.createdAt.toMillis() : 0;
        const tb = b.data.createdAt?.toMillis ? b.data.createdAt.toMillis() : 0;
        return tb - ta;
      });
    renderPills();
    renderGrid();
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<div class="empty-state">Couldn't load products. Please refresh.</div>`;
  }
}

loadProducts();
