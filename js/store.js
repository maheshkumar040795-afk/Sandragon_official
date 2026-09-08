import { db, collection, getDocs, query, where, orderBy } from "./firebase-init.js";
import "./cart-store.js";

const grid = document.getElementById('productGrid');

async function loadProducts() {
  try {
    const q = query(
      collection(db, 'products'),
      where('active', '==', true),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);

    if (snap.empty) {
      grid.innerHTML = `<div class="empty-state">No products yet. Check back soon!</div>`;
      return;
    }

    grid.innerHTML = '';
    snap.forEach(docSnap => {
      const p = docSnap.data();
      const id = docSnap.id;
      const img = (p.images && p.images[0]) || 'assets/logo.jpeg';
      const card = document.createElement('a');
      card.href = `product.html?id=${id}`;
      card.className = 'product-card';
      card.innerHTML = `
        <div class="img-wrap"><img src="${img}" alt="${p.name}" loading="lazy"></div>
        <div class="info">
          <div class="name">${p.name}</div>
          <div class="price">₹${Number(p.price).toLocaleString('en-IN')}</div>
        </div>`;
      grid.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    grid.innerHTML = `<div class="empty-state">Couldn't load products. Please refresh.</div>`;
  }
}

loadProducts();
