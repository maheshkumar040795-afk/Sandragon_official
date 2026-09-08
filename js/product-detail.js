import { db, doc, getDoc } from "./firebase-init.js";
import { addToCart } from "./cart-store.js";

const container = document.getElementById('pdContainer');
const params = new URLSearchParams(window.location.search);
const productId = params.get('id');

let selectedColor = null;
let selectedSize = null;
let selectedImageIndex = 0;
let productData = null;

async function loadProduct() {
  if (!productId) {
    container.innerHTML = `<div class="empty-state">Product not found.</div>`;
    return;
  }
  try {
    const snap = await getDoc(doc(db, 'products', productId));
    if (!snap.exists()) {
      container.innerHTML = `<div class="empty-state">This product is no longer available.</div>`;
      return;
    }
    productData = snap.data();
    render();
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="empty-state">Couldn't load this product.</div>`;
  }
}

function render() {
  const p = productData;
  const images = (p.images && p.images.length) ? p.images : ['assets/logo.jpeg'];
  const colors = p.colors || [];
  const sizes = p.sizes || [];
  const inStock = (p.stock === undefined) || Number(p.stock) > 0;

  container.innerHTML = `
    <div class="pd-wrap">
      <div class="pd-gallery">
        <div class="main-img"><img id="mainImg" src="${images[0]}" alt="${p.name}"></div>
        <div class="thumb-row" id="thumbRow">
          ${images.map((img, i) => `<img src="${img}" data-i="${i}" class="${i === 0 ? 'active' : ''}">`).join('')}
        </div>
      </div>
      <div class="pd-info">
        <h1>${p.name}</h1>
        <div class="pd-price">₹${Number(p.price).toLocaleString('en-IN')}</div>
        <p class="pd-desc">${p.description || ''}</p>

        ${colors.length ? `
        <div class="option-group">
          <label>Color</label>
          <div class="option-pills" id="colorPills">
            ${colors.map(c => `<div class="pill" data-color="${c}">${c}</div>`).join('')}
          </div>
        </div>` : ''}

        ${sizes.length ? `
        <div class="option-group">
          <label>Size</label>
          <div class="option-pills" id="sizePills">
            ${sizes.map(s => `<div class="pill" data-size="${s}">${s}</div>`).join('')}
          </div>
        </div>` : ''}

        <div class="option-group">
          <label>Quantity</label>
          <div class="qty-row">
            <button class="qty-btn" id="qtyMinus">−</button>
            <span id="qtyVal">1</span>
            <button class="qty-btn" id="qtyPlus">+</button>
          </div>
          <div class="stock-note ${inStock ? '' : 'out'}" id="stockNote">
            ${inStock ? (p.stock !== undefined ? `${p.stock} in stock` : '') : 'Out of stock'}
          </div>
        </div>

        <button class="btn" id="addToCartBtn" ${inStock ? '' : 'disabled'} style="width:100%">
          <i class="fas fa-shopping-bag"></i> Add to Cart
        </button>
      </div>
    </div>
  `;

  // Gallery thumbnail switching
  document.querySelectorAll('#thumbRow img').forEach(t => {
    t.addEventListener('click', () => {
      document.querySelectorAll('#thumbRow img').forEach(x => x.classList.remove('active'));
      t.classList.add('active');
      document.getElementById('mainImg').src = t.src;
    });
  });

  // Color selection
  const colorPills = document.querySelectorAll('#colorPills .pill');
  colorPills.forEach(pill => {
    pill.addEventListener('click', () => {
      colorPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      selectedColor = pill.dataset.color;
    });
  });
  if (colors.length === 1) { colorPills[0]?.click(); }

  // Size selection
  const sizePills = document.querySelectorAll('#sizePills .pill');
  sizePills.forEach(pill => {
    pill.addEventListener('click', () => {
      sizePills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      selectedSize = pill.dataset.size;
    });
  });

  // Quantity
  let qty = 1;
  document.getElementById('qtyMinus').addEventListener('click', () => {
    qty = Math.max(1, qty - 1);
    document.getElementById('qtyVal').textContent = qty;
  });
  document.getElementById('qtyPlus').addEventListener('click', () => {
    qty = qty + 1;
    document.getElementById('qtyVal').textContent = qty;
  });

  // Add to cart
  document.getElementById('addToCartBtn').addEventListener('click', () => {
    if (colors.length && !selectedColor) { alert('Please select a color.'); return; }
    if (sizes.length && !selectedSize) { alert('Please select a size.'); return; }
    addToCart({
      productId,
      name: p.name,
      image: images[0],
      price: Number(p.price),
      color: selectedColor,
      size: selectedSize,
      qty,
      vendorName: p.vendorName || '',
      vendorPhone: p.vendorPhone || ''
    });
    if (confirm('Added to cart! Go to cart now?')) {
      window.location.href = 'cart.html';
    }
  });
}

loadProduct();
