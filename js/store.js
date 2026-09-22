import { db, collection, getDocs, query, where } from "./firebase-init.js";
import { CATEGORIES, categoryName } from "./categories.js";
import { categoryVisualHtml } from "./category-visual.js";
import { rankResults } from "./nav-features.js";
import { toggleWishlist, isWishlisted } from "./wishlist-store.js";
import { ratingAvg, starsHtml } from "./reviews.js";
import { renderRecentlyViewed } from "./recently-viewed.js";
import { toast } from "./toast.js";
import "./cart-store.js";

const grid = document.getElementById('productGrid');
const pillsWrap = document.getElementById('categoryPills');
const bannerWrap = document.getElementById('searchBanner');
const toolbarWrap = document.getElementById('shopToolbar');
const recentWrap = document.getElementById('recentlyViewedSection');

let allProducts = [];
let activeCategory = new URLSearchParams(window.location.search).get('category') || '';
let activeSearch = new URLSearchParams(window.location.search).get('search') || '';
let activeSort = 'newest';
let inStockOnly = false;

const NEW_WINDOW_DAYS = 14;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

function isNewProduct(p) {
  const ms = p.createdAt?.toMillis ? p.createdAt.toMillis() : 0;
  if (!ms) return false;
  return (Date.now() - ms) < NEW_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}

function stockBadge(p) {
  const stock = p.stock;
  if (stock === undefined || stock === null) return '';
  if (Number(stock) <= 0) return `<span class="stock-badge out">Sold Out</span>`;
  if (Number(stock) <= 5) return `<span class="stock-badge low">Only ${stock} left</span>`;
  return '';
}

function cardHtml(p, id) {
  const img = (p.images && p.images[0]) || 'assets/logo.jpeg';
  const tag = p.category ? `<span class="cat-tag">${escapeHtml(categoryName(p.category) || p.category)}</span>` : '';
  const newTag = isNewProduct(p) ? `<span class="new-tag">New</span>` : '';
  const wished = isWishlisted(id);
  const avg = ratingAvg(p);
  const soldOut = p.stock !== undefined && p.stock !== null && Number(p.stock) <= 0;
  return `
    ${tag}
    ${newTag}
    <button type="button" class="wishlist-heart ${wished ? 'active' : ''}" data-wish="${id}" aria-label="${wished ? 'Remove from' : 'Add to'} wishlist">
      <i class="fa-heart ${wished ? 'fas' : 'far'}"></i>
    </button>
    <div class="img-wrap">
      <img src="${img}" alt="${escapeHtml(p.name)}" loading="lazy">
      ${soldOut ? '<div class="sold-out-overlay">Sold Out</div>' : ''}
    </div>
    <div class="info">
      <div class="name">${escapeHtml(p.name)}</div>
      ${starsHtml(avg, Number(p.ratingCount) || 0, 'sm')}
      <div class="price-row">
        <div class="price">₹${Number(p.price).toLocaleString('en-IN')}</div>
        ${stockBadge(p)}
      </div>
    </div>`;
}

function sortItems(items) {
  const sorted = [...items];
  switch (activeSort) {
    case 'price-low': return sorted.sort((a, b) => Number(a.data.price) - Number(b.data.price));
    case 'price-high': return sorted.sort((a, b) => Number(b.data.price) - Number(a.data.price));
    case 'rating': return sorted.sort((a, b) => ratingAvg(b.data) - ratingAvg(a.data));
    case 'newest':
    default:
      return sorted; // allProducts is already newest-first
  }
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
  if (inStockOnly) {
    items = items.filter(x => x.data.stock === undefined || x.data.stock === null || Number(x.data.stock) > 0);
  }
  items = sortItems(items);

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

  grid.querySelectorAll('[data-wish]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const id = btn.dataset.wish;
      const p = allProducts.find(x => x.id === id)?.data;
      if (!p) return;
      const added = toggleWishlist({ id, name: p.name, image: (p.images && p.images[0]) || 'assets/logo.jpeg', price: Number(p.price) });
      btn.classList.toggle('active', added);
      btn.querySelector('i').className = `fa-heart ${added ? 'fas' : 'far'}`;
      toast(added ? `Added "${p.name}" to your wishlist` : `Removed "${p.name}" from your wishlist`, 'wishlist');
    });
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
        ${categoryVisualHtml(c, 'cat-pill-icon')} ${c.name}
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

function renderToolbar() {
  if (!toolbarWrap) return;
  toolbarWrap.innerHTML = `
    <label class="stock-filter">
      <input type="checkbox" id="inStockOnlyChk">
      In stock only
    </label>
    <select id="sortSelect" aria-label="Sort products">
      <option value="newest">Newest First</option>
      <option value="price-low">Price: Low to High</option>
      <option value="price-high">Price: High to Low</option>
      <option value="rating">Top Rated</option>
    </select>
  `;
  document.getElementById('sortSelect').addEventListener('change', (e) => {
    activeSort = e.target.value;
    renderGrid();
  });
  document.getElementById('inStockOnlyChk').addEventListener('change', (e) => {
    inStockOnly = e.target.checked;
    renderGrid();
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
      if (toolbarWrap) toolbarWrap.style.display = 'none';
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
    renderToolbar();
    renderGrid();
    if (recentWrap) renderRecentlyViewed(recentWrap);
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<div class="empty-state">Couldn't load products. Please refresh.</div>`;
  }
}

loadProducts();
