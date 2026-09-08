// Simple localStorage cart shared across all storefront pages.
// Cart item shape: { productId, name, image, price, color, size, qty, stockKey }

const CART_KEY = 'sandragon_cart';

export function getCart() {
  try {
    return JSON.parse(localStorage.getItem(CART_KEY)) || [];
  } catch {
    return [];
  }
}

export function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
  updateCartBadge();
}

export function addToCart(item) {
  const cart = getCart();
  // Merge if same product+color+size already in cart
  const existing = cart.find(
    c => c.productId === item.productId && c.color === item.color && c.size === item.size
  );
  if (existing) {
    existing.qty += item.qty;
  } else {
    cart.push(item);
  }
  saveCart(cart);
}

export function removeFromCart(index) {
  const cart = getCart();
  cart.splice(index, 1);
  saveCart(cart);
}

export function updateQty(index, qty) {
  const cart = getCart();
  if (cart[index]) {
    cart[index].qty = Math.max(1, qty);
    saveCart(cart);
  }
}

export function clearCart() {
  localStorage.removeItem(CART_KEY);
  updateCartBadge();
}

export function cartTotal() {
  return getCart().reduce((sum, i) => sum + i.price * i.qty, 0);
}

export function cartCount() {
  return getCart().reduce((sum, i) => sum + i.qty, 0);
}

export function updateCartBadge() {
  const el = document.getElementById('cartCount');
  if (el) el.textContent = cartCount();
}

// Run on every page load
updateCartBadge();
