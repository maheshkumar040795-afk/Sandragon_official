// SANDRAGON — localStorage "recently viewed" tracker.
// Item shape: { id, name, image, price }

const KEY = 'sandragon_recently_viewed';
const MAX_ITEMS = 8;

export function getRecentlyViewed() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return [];
  }
}

export function trackView(item) {
  let list = getRecentlyViewed().filter(x => x.id !== item.id);
  list.unshift(item);
  list = list.slice(0, MAX_ITEMS);
  localStorage.setItem(KEY, JSON.stringify(list));
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

// Renders the strip into the given container element, excluding excludeId.
// Returns true if anything was rendered.
export function renderRecentlyViewed(container, excludeId = null) {
  if (!container) return false;
  const items = getRecentlyViewed().filter(x => x.id !== excludeId).slice(0, 6);
  if (!items.length) { container.innerHTML = ''; return false; }

  container.innerHTML = `
    <h2 class="section-title">Recently Viewed</h2>
    <div class="recent-strip">
      ${items.map(p => `
        <a href="product.html?id=${p.id}" class="recent-card">
          <div class="recent-img"><img src="${p.image}" alt="${escapeHtml(p.name)}" loading="lazy"></div>
          <div class="recent-name">${escapeHtml(p.name)}</div>
          <div class="recent-price">₹${Number(p.price).toLocaleString('en-IN')}</div>
        </a>
      `).join('')}
    </div>
  `;
  return true;
}
