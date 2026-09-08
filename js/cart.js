import { db, collection, addDoc, serverTimestamp } from "./firebase-init.js";
import { getCart, saveCart, removeFromCart, updateQty, clearCart, cartTotal } from "./cart-store.js";
import { razorpayConfig, functionsBaseUrl, business } from "./config.js";

const cartItemsEl = document.getElementById('cartItems');
const checkoutSection = document.getElementById('checkoutSection');

function renderCart() {
  const cart = getCart();
  if (!cart.length) {
    cartItemsEl.innerHTML = `<div class="empty-state">Your cart is empty. <a href="index.html" class="gold">Continue shopping →</a></div>`;
    checkoutSection.style.display = 'none';
    return;
  }

  cartItemsEl.innerHTML = cart.map((item, i) => `
    <div class="cart-item">
      <img src="${item.image}" alt="${item.name}">
      <div>
        <div>${item.name}</div>
        <div class="meta">${item.color ? 'Color: ' + item.color + ' &nbsp;' : ''}${item.size ? 'Size: ' + item.size : ''}</div>
        <div class="remove-link" data-i="${i}">Remove</div>
      </div>
      <div class="qty-row" style="margin:0">
        <button class="qty-btn" data-minus="${i}">−</button>
        <span>${item.qty}</span>
        <button class="qty-btn" data-plus="${i}">+</button>
      </div>
      <div class="gold" style="font-weight:700">₹${(item.price * item.qty).toLocaleString('en-IN')}</div>
    </div>
  `).join('');

  document.querySelectorAll('[data-minus]').forEach(btn =>
    btn.addEventListener('click', () => {
      const i = +btn.dataset.minus;
      const cart = getCart();
      updateQty(i, cart[i].qty - 1);
      renderCart(); updateSummary();
    })
  );
  document.querySelectorAll('[data-plus]').forEach(btn =>
    btn.addEventListener('click', () => {
      const i = +btn.dataset.plus;
      const cart = getCart();
      updateQty(i, cart[i].qty + 1);
      renderCart(); updateSummary();
    })
  );
  document.querySelectorAll('.remove-link').forEach(link =>
    link.addEventListener('click', () => {
      removeFromCart(+link.dataset.i);
      renderCart(); updateSummary();
    })
  );

  checkoutSection.style.display = 'block';
  updateSummary();
}

function updateSummary() {
  const total = cartTotal();
  document.getElementById('subtotalVal').textContent = `₹${total.toLocaleString('en-IN')}`;
  document.getElementById('totalVal').textContent = `₹${total.toLocaleString('en-IN')}`;
}

document.getElementById('payBtn').addEventListener('click', handlePayment);

async function handlePayment() {
  const name = document.getElementById('custName').value.trim();
  const phone = document.getElementById('custPhone').value.trim();
  const email = document.getElementById('custEmail').value.trim();
  const address = document.getElementById('custAddress').value.trim();
  const pincode = document.getElementById('custPincode').value.trim();

  if (!name || !phone || !address || !pincode) {
    alert('Please fill in all required delivery details.');
    return;
  }
  if (!/^\d{10}$/.test(phone)) {
    alert('Please enter a valid 10-digit phone number.');
    return;
  }

  const cart = getCart();
  if (!cart.length) return;
  const amount = cartTotal();

  const payBtn = document.getElementById('payBtn');
  payBtn.disabled = true;
  payBtn.textContent = 'Preparing checkout...';

  try {
    // 1. Ask Cloud Function to create a Razorpay order (keeps key_secret server-side)
    const orderRes = await fetch(`${functionsBaseUrl}/createRazorpayOrder`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount })
    });
    const orderData = await orderRes.json();
    if (!orderData.id) throw new Error('Could not create payment order');

    // 2. Open Razorpay Checkout
    const rzp = new Razorpay({
      key: razorpayConfig.keyId,
      amount: orderData.amount,
      currency: razorpayConfig.currency,
      name: business.name,
      description: 'Order Payment',
      order_id: orderData.id,
      prefill: { name, email, contact: phone },
      theme: { color: '#c9a227' },
      handler: async function (response) {
        await verifyAndSaveOrder(response, { name, phone, email, address, pincode }, cart, amount);
      },
      modal: {
        ondismiss: function () {
          payBtn.disabled = false;
          payBtn.innerHTML = '<i class="fas fa-lock"></i> Pay Securely with Razorpay';
        }
      }
    });
    rzp.open();
  } catch (err) {
    console.error(err);
    alert('Something went wrong starting the payment. Please try again.');
    payBtn.disabled = false;
    payBtn.innerHTML = '<i class="fas fa-lock"></i> Pay Securely with Razorpay';
  }
}

async function verifyAndSaveOrder(razorpayResponse, customer, cart, amount) {
  try {
    // 3. Verify payment signature server-side (Cloud Function)
    const verifyRes = await fetch(`${functionsBaseUrl}/verifyRazorpayPayment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(razorpayResponse)
    });
    const verifyData = await verifyRes.json();
    if (!verifyData.valid) throw new Error('Payment verification failed');

    // 4. Save order in Firestore — this is what the admin portal reads
    const orderDoc = await addDoc(collection(db, 'orders'), {
      customer,
      items: cart,
      totalAmount: amount,
      paymentId: razorpayResponse.razorpay_payment_id,
      razorpayOrderId: razorpayResponse.razorpay_order_id,
      status: 'placed',
      vendorShared: false,
      awbNumber: '',
      courierName: '',
      createdAt: serverTimestamp()
    });

    clearCart();
    window.location.href = `order-success.html?orderId=${orderDoc.id}`;
  } catch (err) {
    console.error(err);
    alert('Payment succeeded but we could not save your order. Please contact us on WhatsApp with your payment ID: ' + razorpayResponse.razorpay_payment_id);
  }
}

renderCart();
