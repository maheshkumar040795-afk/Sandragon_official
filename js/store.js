import { CATEGORIES, categoryName } from "./categories.js";
import { categoryVisualHtml } from "./category-visual.js";
import { rankResults } from "./nav-features.js";
import { toggleWishlist, isWishlisted } from "./wishlist-store.js";
import { ratingAvg, starsHtml } from "./reviews.js";
import { renderRecentlyViewed } from "./recently-viewed.js";
import { toast } from "./toast.js";
import { watchProducts } from "./products-store.js";
import { tsMillis } from "./data-cache.js";
import { imgHtml } from "./img.js";
import { priceHtml, discountPct } from "./pricing.js";
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
let toolbarReady = false;
let scrolledToResults = false;
queueMicrotask(() => { if (activeCategory || activeSearch) setListingSeo(); });

const NEW_WINDOW_DAYS = 14;
const CARD_SIZES = '(max-width: 600px) 48vw, (max-width: 1000px) 31vw, 280px';

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

function isNewProduct(p) {
  const ms = tsMillis(p.createdAt);
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

function cardHtml(p, id, index) {
  const images = (p.images && p.images.length) ? p.images : ['assets/logo.jpeg'];
  const tag = p.category ? `<span class="cat-tag">${escapeHtml(categoryName(p.category) || p.category)}</span>` : '';
  const newTag = isNewProduct(p) ? `<span class="new-tag">New</span>` : '';
  const wished = isWishlisted(id);
  const avg = ratingAvg(p);
  const soldOut = p.stock !== undefined && p.stock !== null && Number(p.stock) <= 0;
  // The first row is above the fold on most screens: load those eagerly so
  // the shop grid paints fast, lazy-load everything below.
  const priority = index < 4;
  const main = imgHtml(images[0], { alt: p.name, widths: [300, 450, 600], sizes: CARD_SIZES, cls: 'img-main', priority: index < 2, loading: priority ? 'eager' : 'lazy' });
  // A second photo (if the product has one) crossfades in on hover, the
  // way most fashion and sports stores preview the back or detail shot.
  const alt = images[1]
    ? imgHtml(images[1], { alt: '', widths: [300, 450, 600], sizes: CARD_SIZES, cls: 'img-alt', loading: 'lazy', extra: 'aria-hidden="true"' })
    : '';
  return `
    <div class="img-wrap${images[1] ? ' has-alt' : ''}">
      ${main}
      ${alt}
      <div class="card-tags">${tag}${newTag}</div>
      <button type="button" class="wishlist-heart ${wished ? 'active' : ''}" data-wish="${id}" aria-label="${wished ? 'Remove from' : 'Add to'} wishlist">
        <i class="fa-heart ${wished ? 'fas' : 'far'}"></i>
      </button>
      ${soldOut ? '<div class="sold-out-overlay">Sold Out</div>' : ''}
    </div>
    <div class="info">
      <div class="name">${escapeHtml(p.name)}</div>
      ${starsHtml(avg, Number(p.ratingCount) || 0, 'sm')}
      <div class="price-row">
        ${priceHtml(p)}
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
    case 'discount': return sorted.sort((a, b) => discountPct(b.data) - discountPct(a.data));
    case 'newest':
    default:
      return sorted; // allProducts is already newest-first
  }
}

function renderGrid({ instant = false } = {}) {
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
        renderGrid({ instant: true });
      });
    } else {
      bannerWrap.style.display = 'none';
      bannerWrap.innerHTML = '';
    }
  }

  grid.setAttribute('aria-busy', 'false');

  if (!items.length) {
    grid.innerHTML = `<div class="empty-state">
      <i class="fas fa-magnifying-glass"></i>
      <p>No products found${activeCategory ? ' in this category' : ''}${activeSearch ? ' for your search' : ''}.</p>
      <button type="button" class="btn small outline" id="resetFiltersBtn">Show all products</button>
    </div>`;
    document.getElementById('resetFiltersBtn')?.addEventListener('click', () => {
      activeCategory = ''; activeSearch = ''; inStockOnly = false;
      const chk = document.getElementById('inStockOnlyChk'); if (chk) chk.checked = false;
      updateUrl(); renderPills(); renderGrid({ instant: true });
    });
    return;
  }

  // Build off-DOM and swap in one go: a single layout instead of one per card.
  const frag = document.createDocumentFragment();
  items.forEach(({ id, data: p }, i) => {
    const card = document.createElement('a');
    card.href = `product.html?id=${id}`;
    card.className = 'product-card' + (instant ? ' in-view' : '');
    card.style.setProperty('--i', String(i % 8));
    card.innerHTML = cardHtml(p, id, i);
    frag.appendChild(card);
  });
  grid.replaceChildren(frag);
}

// One delegated listener for every wishlist heart, instead of one per card per render.
grid.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-wish]');
  if (!btn) return;
  e.preventDefault();
  e.stopPropagation();
  const id = btn.dataset.wish;
  const p = allProducts.find(x => x.id === id)?.data;
  if (!p) return;
  const added = toggleWishlist({ id, name: p.name, image: (p.images && p.images[0]) || 'assets/logo.jpeg', price: Number(p.price), mrp: Number(p.mrp) || 0 });
  btn.classList.toggle('active', added);
  btn.querySelector('i').className = `fa-heart ${added ? 'fas' : 'far'}`;
  toast(added ? `Added "${escapeHtml(p.name)}" to your wishlist` : `Removed "${escapeHtml(p.name)}" from your wishlist`, 'wishlist');
});

function updateUrl() {
  const params = new URLSearchParams();
  if (activeCategory) params.set('category', activeCategory);
  if (activeSearch) params.set('search', activeSearch);
  const qs = params.toString();
  history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname);
  setListingSeo();
}

// Category and search views get their own page title and canonical URL,
// so a shared or indexed "Bats" link reads "Bats | SANDRAGON".
const HOME_TITLE = document.title;
function setListingSeo() {
  const name = activeCategory ? (categoryName(activeCategory) || activeCategory) : '';
  document.title = name ? `${name} Online | Buy ${name} at SANDRAGON` : activeSearch ? `"${activeSearch}" | SANDRAGON` : HOME_TITLE;
  const canon = document.head.querySelector('link[rel="canonical"]');
  if (canon) canon.href = 'https://sandragon.in/' + (activeCategory ? `index.html?category=${encodeURIComponent(activeCategory)}` : '');
}

function renderPills() {
  if (!pillsWrap) return;
  const presentCategoryIds = new Set(allProducts.map(x => x.data.category).filter(Boolean));
  const usable = CATEGORIES.filter(c => presentCategoryIds.has(c.id));
  if (!usable.length) { pillsWrap.style.display = 'none'; return; }
  pillsWrap.style.display = '';

  const counts = {};
  allProducts.forEach(x => { if (x.data.category) counts[x.data.category] = (counts[x.data.category] || 0) + 1; });
  const card = (id, name, visual, count) => `
    <button type="button" class="cat-pill ${activeCategory === id ? 'active' : ''}" data-cat="${escapeHtml(id)}" aria-pressed="${activeCategory === id}">
      ${visual}
      <span class="cat-pill-name">${escapeHtml(name)}</span>
      <span class="cat-pill-count">${count} item${count === 1 ? '' : 's'}</span>
    </button>`;
  pillsWrap.innerHTML =
    card('', 'All', '<span class="cat-pill-icon"><i class="fas fa-border-all"></i></span>', allProducts.length) +
    usable.map(c => card(c.id, c.name, categoryVisualHtml(c, 'cat-pill-icon'), counts[c.id] || 0)).join('');
  pillsWrap.querySelectorAll('.cat-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      activeCategory = pill.dataset.cat;
      pillsWrap.querySelectorAll('.cat-pill').forEach(p => { p.classList.remove('active'); p.setAttribute('aria-pressed', 'false'); });
      pill.classList.add('active');
      pill.setAttribute('aria-pressed', 'true');
      // Keep the chosen pill visible inside the horizontal scroller on phones.
      pill.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
      updateUrl();
      renderGrid({ instant: true });
    });
  });
}

function renderToolbar() {
  if (!toolbarWrap || toolbarReady) return;
  toolbarReady = true;
  toolbarWrap.innerHTML = `
    <label class="stock-filter">
      <input type="checkbox" id="inStockOnlyChk">
      In stock only
    </label>
    <label class="sort-wrap">
      <span class="visually-hidden">Sort products</span>
      <select id="sortSelect">
        <option value="newest">Newest first</option>
        <option value="price-low">Price: low to high</option>
        <option value="price-high">Price: high to low</option>
        <option value="rating">Top rated</option>
        <option value="discount">Biggest discount</option>
      </select>
    </label>
  `;
  document.getElementById('sortSelect').addEventListener('change', (e) => {
    activeSort = e.target.value;
    renderGrid({ instant: true });
  });
  document.getElementById('inStockOnlyChk').addEventListener('change', (e) => {
    inStockOnly = e.target.checked;
    renderGrid({ instant: true });
  });
}

function scrollToResultsOnce() {
  // Arriving from the nav search or a category link: the results sit below
  // the hero video, so bring them into view instead of looking like nothing happened.
  if (scrolledToResults || !(activeSearch || activeCategory)) return;
  scrolledToResults = true;
  const target = bannerWrap && bannerWrap.style.display !== 'none' ? bannerWrap : (pillsWrap || grid);
  requestAnimationFrame(() => {
    const headerH = document.querySelector('header.navbar')?.offsetHeight || 80;
    const y = target.getBoundingClientRect().top + window.scrollY - headerH - 16; // clear the sticky header
    window.scrollTo({ top: Math.max(0, y), behavior: 'smooth' });
  });
}

function showEmptyCatalog() {
  grid.setAttribute('aria-busy', 'false');
  grid.innerHTML = `<div class="empty-state"><i class="fas fa-box-open"></i><p>No products yet. Check back soon!</p></div>`;
  if (pillsWrap) pillsWrap.style.display = 'none';
  if (toolbarWrap) toolbarWrap.style.display = 'none';
}

watchProducts((list, { fromCache }) => {
  if (!list.length) { showEmptyCatalog(); return; }
  if (toolbarWrap) toolbarWrap.style.display = '';
  allProducts = list;
  renderPills();
  renderToolbar();
  // A cached render is instant (no fade); a refresh that replaces cards
  // already on screen also swaps in place without re-animating.
  renderGrid({ instant: fromCache || grid.querySelector('.product-card') !== null });
  if (recentWrap) renderRecentlyViewed(recentWrap);
  scrollToResultsOnce();
}).catch(err => {
  console.error(err);
  grid.setAttribute('aria-busy', 'false');
  grid.innerHTML = `<div class="empty-state"><i class="fas fa-wifi"></i><p>Couldn't load products.</p>
    <button type="button" class="btn small outline" onclick="location.reload()">Try again</button></div>`;
});

// Categories now load in the background; refresh labels when they arrive.
window.addEventListener('sandragon:categories-updated', () => {
  if (!allProducts.length) return;
  renderPills();
  renderGrid({ instant: true });
});
