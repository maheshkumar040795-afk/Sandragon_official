import { getWishlist, removeFromWishlist } from "./wishlist-store.js";
import { addToCart } from "./cart-store.js";
import { toast } from "./toast.js";

const grid = document.getElementById('wishlistGrid');

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

function render() {
  const items = getWishlist();
  if (!items.length) {
    grid.innerHTML = `<div class="empty-state">Your wishlist is empty. <a href="index.html" class="gold">Browse products →</a></div>`;
    return;
  }
  grid.innerHTML = items.map(p => `
    <div class="product-card wishlist-card">
      <button type="button" class="wishlist-heart active" data-remove="${p.id}" aria-label="Remove from wishlist">
        <i class="fas fa-heart"></i>
      </button>
      <a href="product.html?id=${p.id}" class="img-wrap"><img src="${p.image}" alt="${escapeHtml(p.name)}" loading="lazy"></a>
      <div class="info">
        <a href="product.html?id=${p.id}" class="name">${escapeHtml(p.name)}</a>
        <div class="price">₹${Number(p.price).toLocaleString('en-IN')}</div>
        <button class="btn small mt-10" style="width:100%" data-addcart="${p.id}"><i class="fas fa-shopping-bag"></i> Add to Cart</button>
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', () => {
      removeFromWishlist(btn.dataset.remove);
      render();
    });
  });
  grid.querySelectorAll('[data-addcart]').forEach(btn => {
    btn.addEventListener('click', () => {
      const p = items.find(x => x.id === btn.dataset.addcart);
      if (!p) return;
      addToCart({ productId: p.id, name: p.name, image: p.image, price: p.price, color: null, size: null, qty: 1 });
      toast(`Added "${p.name}" to your cart`, 'success');
    });
  });
}

render();
