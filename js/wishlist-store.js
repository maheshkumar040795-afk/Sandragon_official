// SANDRAGON — localStorage wishlist, shared across all storefront pages.
// Item shape: { id, name, image, price }

const WISHLIST_KEY = 'sandragon_wishlist';

export function getWishlist() {
  try {
    return JSON.parse(localStorage.getItem(WISHLIST_KEY)) || [];
  } catch {
    return [];
  }
}

function saveWishlist(list) {
  localStorage.setItem(WISHLIST_KEY, JSON.stringify(list));
  updateWishlistBadge();
  window.dispatchEvent(new CustomEvent('sandragon:wishlist-updated'));
}

export function isWishlisted(id) {
  return getWishlist().some(x => x.id === id);
}

export function toggleWishlist(item) {
  const list = getWishlist();
  const idx = list.findIndex(x => x.id === item.id);
  let added;
  if (idx > -1) {
    list.splice(idx, 1);
    added = false;
  } else {
    list.unshift(item);
    added = true;
  }
  saveWishlist(list);
  return added;
}

export function removeFromWishlist(id) {
  saveWishlist(getWishlist().filter(x => x.id !== id));
}

export function wishlistCount() {
  return getWishlist().length;
}

export function updateWishlistBadge() {
  const el = document.getElementById('wishlistCount');
  if (el) el.textContent = wishlistCount();
}

updateWishlistBadge();
