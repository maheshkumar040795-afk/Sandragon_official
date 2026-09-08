# SANDRAGON — E-Commerce Website (Customer + Admin Portal)

Black/gold theme built to match your logo. Vanilla HTML/CSS/JS + Firebase (Firestore + Auth)
+ Cloudinary (image hosting) + Razorpay (payments) — same stack family you already use, so it
deploys the same way (GitHub Pages / Firebase Hosting).

## What's included, mapped to your requirements

| # | Your requirement | How it's built |
|---|---|---|
| 1 | Admin posts product (pic, description, price) → reflects on customer side | `admin/dashboard.html` writes to Firestore `products` collection. `index.html`/`product.html` read it live — no redeploy needed. |
| 2 | Customer selects Color/Size, adds to cart, pays | `product.html` renders color/size pills from the product doc → `cart.html` → Razorpay Checkout. |
| 3 | Razorpay | Integrated via Razorpay Checkout.js on the frontend + 2 Cloud Functions (`createRazorpayOrder`, `verifyRazorpayPayment`) so your `key_secret` never sits in browser code. |
| 4 | Order reflects in admin, admin confirms → auto-drafted message → admin clicks Send | `admin/orders.html` auto-generates the WhatsApp message text the moment you open an order. Click **"Mark as Confirmed"** to update status, then **"Open WhatsApp to Send"** — this opens WhatsApp Web/App with the message pre-filled in the customer's chat; you just hit the send arrow. |
| 5 | Admin shares order history with vendor to prepare product | **"Share with Vendor"** button drafts a message with the exact items/colors/sizes/customer address and opens WhatsApp to your vendor's number. |
| 6 | Vendor packs & couriers → admin enters AWB → admin sends to customer via WhatsApp | Step 3 on the order modal: enter courier name + AWB, save — status becomes "Shipped". A tracking message is drafted automatically; click **"Send Tracking to Customer"** to open WhatsApp with it pre-filled. |

### Important honesty note on "auto message"
Fully automatic WhatsApp sending (no click at all) requires the **WhatsApp Business Cloud API**,
which needs a Meta Business verification, a dedicated business phone number, and approved message
templates — that's a separate integration project, not something that can run from a browser.
What's built here matches exactly what you described: the message is **auto-drafted**, and you
**manually click Send** — which is both what you asked for and avoids WhatsApp banning your
personal number for automated sends.

If you later want true one-click-free automation, the natural upgrade path is Meta's WhatsApp
Cloud API called from a Cloud Function — happy to build that as a phase 2.

---

## Folder structure

```
sandragon-ecommerce/
├── index.html              → Storefront homepage (product grid)
├── product.html             → Product detail (gallery, color/size, add to cart)
├── cart.html                → Cart + checkout + Razorpay
├── order-success.html       → Post-payment confirmation
├── track-order.html         → Customer order tracking by phone number
├── css/style.css            → Shared black/gold theme
├── js/
│   ├── config.js            → ALL your business details + API keys (edit this first)
│   ├── firebase-init.js     → Firebase SDK setup
│   ├── cart-store.js        → localStorage cart logic
│   ├── store.js, product-detail.js, cart.js, track-order.js
├── admin/
│   ├── login.html            → Admin sign-in
│   ├── dashboard.html        → Product management (add/edit/delete, image upload)
│   ├── orders.html           → Order pipeline + WhatsApp message drafting
│   └── js/admin-auth.js, admin-products.js, admin-orders.js
├── functions/
│   ├── index.js              → Razorpay order creation + signature verification
│   └── package.json
├── firestore.rules           → Security rules (public read products, admin-only writes)
├── firebase.json             → Hosting + Functions config
└── assets/logo.jpeg          → Your logo
```

---

## Setup steps (do these in order)

### 1. Create a Firebase project
1. Go to [console.firebase.google.com](https://console.firebase.google.com) → Add project → name it `sandragon-store` (or similar).
2. **Build → Firestore Database** → Create database → Start in production mode.
3. **Build → Authentication** → Sign-in method → enable **Email/Password**.
   - Add yourself as a user: Authentication → Users → Add user → `sandragonog@gmail.com` + a strong password. This is your admin login.
4. Project Settings (gear icon) → General → scroll to "Your apps" → Add app → Web (`</>`) → copy the config object.
5. Paste that config into `js/config.js` → `firebaseConfig`.
6. Upgrade to the **Blaze (pay-as-you-go) plan** — required to deploy Cloud Functions (Razorpay verification). Blaze still has a generous free tier; a small store won't incur real cost.

### 2. Deploy Firestore rules
```bash
npm install -g firebase-tools
firebase login
firebase init      # select Firestore, Functions, Hosting; point to this folder; use existing project
firebase deploy --only firestore:rules
```

### 3. Set up Cloudinary (product image hosting)
1. Create a free account at [cloudinary.com](https://cloudinary.com).
2. Dashboard → copy your **Cloud Name** → paste into `js/config.js` → `cloudinaryConfig.cloudName`.
3. Settings → Upload → Upload presets → Add upload preset → set **Signing Mode: Unsigned** → name it `sandragon_unsigned` (or update the name in `config.js` to match).

### 4. Set up Razorpay
1. Create an account at [razorpay.com](https://razorpay.com) and complete KYC (needed before you can accept live payments).
2. Settings → API Keys → generate Key Id + Key Secret.
3. Put the **Key Id** in `js/config.js` → `razorpayConfig.keyId` (safe to expose in frontend).
4. Put the **Key Secret** only in Firebase Functions config (never in frontend code):
   ```bash
   firebase functions:config:set razorpay.key_id="rzp_live_xxxxx" razorpay.key_secret="xxxxxxxxxxxx"
   ```

### 5. Deploy Cloud Functions
```bash
cd functions
npm install
cd ..
firebase deploy --only functions
```
After deploy, copy the printed function URLs (they look like
`https://us-central1-sandragon-store.cloudfunctions.net/createRazorpayOrder`) and set
`functionsBaseUrl` in `js/config.js` to the base part
(`https://us-central1-sandragon-store.cloudfunctions.net`).

### 6. Fill in `js/config.js` completely
This one file holds everything: Firebase config, Cloudinary, Razorpay key, Functions URL, your
business phone numbers, email, Instagram, and — importantly — **your vendor's WhatsApp number**
(`business.vendorPhone`), which the admin panel uses for the "Share with Vendor" button.

### 7. Deploy the site
Same as your usual workflow — GitHub Pages or Firebase Hosting both work fine since everything
is static files:
```bash
firebase deploy --only hosting
```
or push to a GitHub repo and enable GitHub Pages as usual.

### 8. Add your first product
Go to `yoursite.com/admin/login.html`, sign in, click **Add Product**, upload images, set colors
(e.g. Black, Red) and sizes (e.g. S, M, L), save. It appears on the homepage instantly.

---

## Day-to-day admin workflow

1. **New order comes in** → appears in `admin/orders.html` with status "Placed".
2. Click **View** → read the order → click **Mark as Confirmed** → click **Open WhatsApp to Send**
   (message is pre-written; you just hit send in WhatsApp).
3. Click **Share with Vendor** → opens WhatsApp to your vendor with the full pick list and
   shipping address.
4. Once the vendor packs and books a courier, they tell you the AWB number → type courier name +
   AWB into the order → **Save & Mark Shipped** → **Send Tracking to Customer**.
5. When delivered, click **Mark as Delivered** to close out the order.

---

## Notes & things worth knowing

- **Stock** is tracked as a simple total count per product (not per color/size combination) to
  keep the admin panel simple. If you want per-variant stock later (e.g. "Black, M" separate from
  "Red, L"), that's a straightforward upgrade.
- **Cart** is stored in the browser's localStorage — it's per-device, which is standard for
  small stores without customer accounts.
- **Order tracking** (`track-order.html`) looks orders up by phone number. Since it's a public
  read, don't store anything sensitive beyond what's already needed for delivery.
- Colors are stored as plain names (not swatches) for simplicity — e.g. "Black" shows as a text
  pill on the product page, not a color circle. Easy to add real color swatches later if wanted.
- Test Razorpay first in **Test Mode** (test API keys) before going live with real KYC-verified
  keys.
