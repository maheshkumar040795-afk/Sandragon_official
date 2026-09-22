// SANDRAGON — shared navbar features (search + category mega-menu).
// Loaded on every page. Looks for #siteSearchInput / #searchDropdown and
// #categoryMegaMenu in the page's markup and wires them up if present.
import { db, collection, getDocs, query, where } from "./firebase-init.js";
import { CATEGORIES, categoryName } from "./categories.js";
import { categoryVisualHtml } from "./category-visual.js";
import { getCustomer } from "./customer-store.js";
import { openAccountModal } from "./account-gate.js";
import { updateWishlistBadge } from "./wishlist-store.js";

/* ---------------- Category mega-menu ---------------- */
function buildMegaMenu() {
  const menu = document.getElementById('categoryMegaMenu');
  if (!menu) return;
  menu.innerHTML = `
    <div class="mega-menu-grid">
      ${CATEGORIES.map(c => `
        <a href="index.html?category=${c.id}" class="mega-menu-item">
          ${categoryVisualHtml(c, 'mega-menu-icon')}
          <span>${c.name}</span>
        </a>
      `).join('')}
    </div>
    <a href="index.html" class="mega-menu-all">View All Products <i class="fas fa-arrow-right"></i></a>
  `;

  const wrap = menu.closest('.nav-cat-wrap');
  if (!wrap) return;
  const trigger = wrap.querySelector('.nav-cat-trigger');
  // Touch/click support (desktop hover is handled purely in CSS)
  trigger?.addEventListener('click', (e) => {
    e.preventDefault();
    wrap.classList.toggle('open');
  });
  document.addEventListener('click', (e) => {
    if (!wrap.contains(e.target)) wrap.classList.remove('open');
  });
}

/* ---------------- Live search ---------------- */
let productIndex = null; // lazy-loaded once per page, cached in module scope
let loadingPromise = null;

function loadProductIndex() {
  if (productIndex) return Promise.resolve(productIndex);
  if (loadingPromise) return loadingPromise;
  loadingPromise = (async () => {
    try {
      const q = query(collection(db, 'products'), where('active', '==', true));
      const snap = await getDocs(q);
      productIndex = snap.docs.map(d => {
        const p = d.data();
        return {
          id: d.id,
          name: p.name || '',
          price: Number(p.price) || 0,
          image: (p.images && p.images[0]) || 'assets/logo.jpeg',
          category: p.category || '',
          description: p.description || ''
        };
      });
    } catch (err) {
      console.error('Search index load failed', err);
      productIndex = [];
    }
    return productIndex;
  })();
  return loadingPromise;
}

// Returns { score, matched } — matched is how many of the search terms
// this item satisfied, so rankResults can prefer items matching every
// word but still fall back to partial matches instead of showing nothing.
function matchScore(item, terms) {
  const name = item.name.toLowerCase();
  const hay = `${name} ${categoryName(item.category).toLowerCase()} ${(item.description || '').toLowerCase()}`;
  let score = 0;
  let matched = 0;
  for (const t of terms) {
    if (!t) continue;
    if (name.startsWith(t)) { score += 5; matched++; }
    else if (name.includes(t)) { score += 3; matched++; }
    else if (hay.includes(t)) { score += 1; matched++; }
    // singular/plural forgiveness: "bat" should also catch "bats" and
    // vice versa, since shoppers rarely type the exact stored form.
    else if (t.length > 2 && (hay.includes(t.replace(/s$/, '')) || hay.includes(t + 's'))) { score += 1; matched++; }
  }
  return { score, matched };
}

function rankResults(items, rawQuery) {
  const terms = rawQuery.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const scored = items.map(item => ({ item, ...matchScore(item, terms) }));

  // Prefer items matching every term (classic AND search); if that yields
  // nothing, fall back to items matching at least one term so a slightly
  // over-specific query (e.g. "cricket bat" when a product is just named
  // "SS Bat") still returns something useful instead of a blank "no
  // results" screen.
  const allMatched = scored.filter(r => r.matched === terms.length);
  const pool = allMatched.length ? allMatched : scored.filter(r => r.matched > 0);

  return pool
    .sort((a, b) => (b.matched - a.matched) || (b.score - a.score))
    .map(r => r.item);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

function renderDropdown(dropdown, results, rawQuery) {
  if (!results.length) {
    dropdown.innerHTML = `<div class="search-empty">No products found for "${escapeHtml(rawQuery)}"</div>`;
    dropdown.classList.add('open');
    return;
  }
  const top = results.slice(0, 6);
  dropdown.innerHTML = `
    ${top.map(p => `
      <a href="product.html?id=${p.id}" class="search-result">
        <img src="${p.image}" alt="">
        <div class="sr-info">
          <div class="sr-name">${escapeHtml(p.name)}</div>
          <div class="sr-meta">${p.category ? escapeHtml(categoryName(p.category)) + ' · ' : ''}₹${p.price.toLocaleString('en-IN')}</div>
        </div>
      </a>
    `).join('')}
    <a href="index.html?search=${encodeURIComponent(rawQuery)}" class="search-view-all">
      See all ${results.length} result${results.length > 1 ? 's' : ''} for "${escapeHtml(rawQuery)}" <i class="fas fa-arrow-right"></i>
    </a>
  `;
  dropdown.classList.add('open');
}

function setupSearch() {
  const input = document.getElementById('siteSearchInput');
  const dropdown = document.getElementById('searchDropdown');
  const btn = document.getElementById('siteSearchBtn');
  if (!input || !dropdown) return;

  // Prefill from ?search= on index.html so the box reflects current results
  const params = new URLSearchParams(window.location.search);
  if (params.get('search')) input.value = params.get('search');

  let debounceTimer = null;
  input.addEventListener('input', () => {
    clearTimeout(debounceTimer);
    const val = input.value.trim();
    if (!val) { dropdown.classList.remove('open'); dropdown.innerHTML = ''; return; }
    debounceTimer = setTimeout(async () => {
      const items = await loadProductIndex();
      const results = rankResults(items, val);
      renderDropdown(dropdown, results, val);
    }, 180);
  });

  function goToResults() {
    const val = input.value.trim();
    if (!val) return;
    window.location.href = `index.html?search=${encodeURIComponent(val)}`;
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); goToResults(); }
    if (e.key === 'Escape') { dropdown.classList.remove('open'); input.blur(); }
  });
  btn?.addEventListener('click', goToResults);

  document.addEventListener('click', (e) => {
    if (!input.contains(e.target) && !dropdown.contains(e.target) && e.target !== btn) {
      dropdown.classList.remove('open');
    }
  });
}

document.addEventListener('DOMContentLoaded', () => {
  buildMegaMenu();
  setupSearch();
  buildAccountNav();
  updateWishlistBadge();
  lockScrollWhileMenuOpen();
});
window.addEventListener('sandragon:customer-updated', buildAccountNav);
window.addEventListener('sandragon:wishlist-updated', updateWishlistBadge);

/* ---------------- Mobile menu: lock background scroll while open ----------------
   The inline per-page <script> toggles #navLinks' "active" class on hamburger
   click; this just watches for that and locks/unlocks body scroll to match,
   so the page can't be scrolled underneath the full-screen mobile menu. */
function lockScrollWhileMenuOpen() {
  const navLinks = document.getElementById('navLinks');
  const hamburger = document.getElementById('hamburgerBtn');
  if (!navLinks || !hamburger) return;
  hamburger.addEventListener('click', () => {
    // runs after the inline handler's toggle (attached earlier in the page)
    document.body.style.overflow = navLinks.classList.contains('active') ? 'hidden' : '';
  });
}

/* ---------------- Nav account widget (customer name / sign in) ---------------- */
function buildAccountNav() {
  const nav = document.getElementById('navAccount');
  if (!nav) return;
  const customer = getCustomer();
  if (customer) {
    const firstName = (customer.name || '').split(' ')[0] || 'Account';
    nav.innerHTML = `<a href="profile.html" class="nav-account-link"><i class="fas fa-circle-user"></i> ${firstName}</a>`;
  } else {
    nav.innerHTML = `<a href="#" class="nav-account-link" id="navSignInLink"><i class="fas fa-circle-user"></i> Sign In</a>`;
    document.getElementById('navSignInLink')?.addEventListener('click', (e) => {
      e.preventDefault();
      openAccountModal(() => buildAccountNav());
    });
  }
}

export { loadProductIndex, rankResults };
