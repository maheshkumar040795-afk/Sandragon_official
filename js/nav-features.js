// SANDRAGON — shared navbar features (search + category mega-menu).
// Loaded on every page. Looks for #siteSearchInput / #searchDropdown and
// #categoryMegaMenu in the page's markup and wires them up if present.
import { db, collection, getDocs, query, where } from "./firebase-init.js";
import { CATEGORIES, categoryName, refreshCategories } from "./categories.js";
import { categoryVisualHtml } from "./category-visual.js";
import { getCustomer } from "./customer-store.js";
import { openAccountModal } from "./account-gate.js";
import { updateWishlistBadge } from "./wishlist-store.js";

/* ---------------- Category mega-menu ---------------- */
function renderMegaMenuItems(menu) {
  const body = CATEGORIES.length
    ? `<div class="mega-menu-grid">
        ${CATEGORIES.map(c => `
          <a href="index.html?category=${c.id}" class="mega-menu-item">
            ${categoryVisualHtml(c, 'mega-menu-icon')}
            <span>${c.name}</span>
          </a>
        `).join('')}
      </div>`
    : `<div class="mega-menu-empty">Categories are loading… <br>or browse everything below.</div>`;
  menu.innerHTML = `
    ${body}
    <a href="index.html#productGrid" class="mega-menu-all">View All Products <i class="fas fa-arrow-right"></i></a>
  `;
}

function buildMegaMenu() {
  const menu = document.getElementById('categoryMegaMenu');
  if (!menu) return;
  renderMegaMenuItems(menu);

  // If the first fetch came back empty (slow network, or the page loaded
  // before Firestore answered), try once more and re-render — never leave
  // the menu as a blank box.
  if (!CATEGORIES.length) {
    refreshCategories().then(() => renderMegaMenuItems(menu));
  }

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
          description: p.description || '',
          options: Array.isArray(p.options) ? p.options : []
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

// Sport / theme keywords → the product words that belong to them. Lets a
// shopper type a sport ("cricket") or a goal ("gym") and see the related
// gear even when those product names never contain that exact word
// (e.g. "SS Master Bat" has no "cricket" in it). Extend freely.
const RELATED_TERMS = {
  cricket:    ['bat', 'ball', 'stump', 'wicket', 'bail', 'glove', 'pad', 'guard', 'helmet', 'willow', 'kit bag', 'grip', 'spike', 'abdomen', 'thigh', 'arm guard', 'leather', 'tennis ball'],
  football:   ['football', 'soccer', 'boot', 'shin', 'goalkeeper', 'jersey', 'studs'],
  soccer:     ['football', 'soccer', 'boot', 'shin', 'goalkeeper'],
  badminton:  ['racket', 'racquet', 'shuttle', 'shuttlecock', 'string', 'grip'],
  tennis:     ['racket', 'racquet', 'tennis ball', 'string', 'grip'],
  hockey:     ['hockey', 'stick', 'puck', 'shin'],
  volleyball: ['volleyball', 'net', 'knee pad'],
  basketball: ['basketball', 'hoop', 'ring'],
  gym:        ['dumbbell', 'barbell', 'plate', 'kettlebell', 'gym glove', 'belt', 'band', 'mat', 'whey', 'protein', 'supplement', 'shaker'],
  fitness:    ['dumbbell', 'kettlebell', 'band', 'mat', 'skipping', 'rope', 'whey', 'protein', 'supplement', 'shaker'],
  workout:    ['dumbbell', 'kettlebell', 'band', 'mat', 'whey', 'protein', 'shaker'],
  protein:    ['whey', 'protein', 'isolate', 'mass gainer', 'gainer', 'casein', 'supplement'],
  whey:       ['whey', 'protein', 'isolate', 'supplement'],
  supplement: ['whey', 'protein', 'creatine', 'bcaa', 'pre-workout', 'preworkout', 'multivitamin', 'omega', 'gainer', 'electrolyte'],
  nutrition:  ['whey', 'protein', 'creatine', 'bcaa', 'multivitamin', 'gainer', 'supplement'],
  shoe:       ['shoe', 'spike', 'boot', 'sneaker', 'footwear'],
  apparel:    ['jersey', 't-shirt', 'tshirt', 'shirt', 'track', 'short', 'cap', 'sock', 'clothing', 'wear'],
  clothing:   ['jersey', 't-shirt', 'tshirt', 'shirt', 'track', 'short', 'cap', 'sock', 'wear'],
  bag:        ['bag', 'kit bag', 'backpack', 'duffel']
};

function wordStart(hay, word) {
  const esc = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${esc}`).test(hay);
}

function singular(t) { return t.length > 3 ? t.replace(/(es|s)$/, '') : t; }

// Related words for a typed term — handles plurals ("bats" → "bat") and
// partial typing ("crick" → cricket's gear). Returns { key, words }.
function relatedFor(t) {
  const key = Object.keys(RELATED_TERMS).find(k =>
    k === t || k === singular(t) || (t.length >= 4 && k.startsWith(t))
  );
  return key ? { key, words: RELATED_TERMS[key] } : { key: null, words: [] };
}

// A sport name in a product's own name marks it as THAT sport's gear — so
// "cricket" (which relates to "ball") doesn't also pull in "Nivia Football".
const SPORT_WORDS = ['cricket', 'football', 'soccer', 'badminton', 'tennis', 'hockey', 'volleyball', 'basketball'];
function belongsToOtherSport(name, key, words) {
  return SPORT_WORDS.some(sp =>
    sp !== key &&
    name.includes(sp) &&
    !words.some(w => w.includes(sp))   // cricket's own "tennis ball" is still fine
  );
}

// Whole word in the name ("bat" / "bats" in "Willow Bat") — ranks above a
// mere prefix ("Batting Gloves") so the actual bat comes first.
function wholeWord(name, s) {
  const esc = s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${esc}(s|es)?([^a-z0-9]|$)`).test(name);
}

// Returns { score, matched } — matched is how many of the search terms
// this item satisfied, so rankResults can prefer items matching every
// word but still fall back to partial matches instead of showing nothing.
function matchScore(item, terms) {
  const name = (item.name || '').toLowerCase();
  const optionText = Array.isArray(item.options)
    ? item.options.map(o => `${o.name || ''} ${(o.values || []).join(' ')}`).join(' ')
    : '';
  const hay = `${name} ${categoryName(item.category).toLowerCase()} ${item.category || ''} ${(item.description || '').toLowerCase()} ${optionText.toLowerCase()}`;
  let score = 0;
  let matched = 0;
  for (const t of terms) {
    if (!t) continue;
    const s = singular(t);
    if (wholeWord(name, s)) { score += 8; matched++; }
    else if (name.startsWith(t)) { score += 5; matched++; }
    else if (name.includes(t) || name.includes(s)) { score += 4; matched++; }
    else if (hay.includes(t) || hay.includes(s)) { score += 2; matched++; }
    else {
      // Sport/theme keyword: "cricket" matches anything that's a bat,
      // ball, stumps, gloves, pads… even without the word "cricket".
      // Word-start match so "ball" doesn't match inside "football".
      const { key, words } = relatedFor(t);
      if (words.length && !belongsToOtherSport(name, key, words) && words.some(r => wordStart(hay, r))) {
        score += 1; matched++;
      }
    }
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

// IMPORTANT: this module imports categories.js, which uses a top-level
// `await` (Firestore fetch). That delays this module's body until AFTER the
// browser has already fired DOMContentLoaded — so a plain
// addEventListener('DOMContentLoaded', …) here would never run, leaving
// search dead, the category menu blank and the Sign In link missing.
// Run immediately if the DOM is already parsed, otherwise wait for it.
function initNav() {
  buildMegaMenu();
  setupSearch();
  buildAccountNav();
  updateWishlistBadge();
  lockScrollWhileMenuOpen();
}
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initNav);
} else {
  initNav();
}
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
