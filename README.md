# SANDRAGON — E-Commerce Website (Customer + Admin Portal)

## ✨ New in this update

On top of the original build, this version adds a full set of standard
e-commerce features, all styled to match the existing black/gold theme and
built the same way (vanilla JS + Firestore, no framework, no build step):

| Feature | What it does | Files |
|---|---|---|
| **Wishlist** | Heart icon on every product card + product page. Saved per-device (localStorage). Dedicated `wishlist.html` page with "Add to Cart" straight from the list, and a live count badge in the nav. | `js/wishlist-store.js`, `wishlist.html`, `js/wishlist.js` |
| **Ratings & Reviews** | Customers leave a star rating + optional comment on any product page. The average/count is denormalized onto the product doc (`ratingCount`/`ratingSum`) so star ratings show on cards and search results with no extra reads. | `js/reviews.js`, `js/product-detail.js`, `js/store.js` |
| **Coupon codes** | Admin creates percentage or flat-amount discount codes (with optional minimum order + expiry) in a new **Coupons** admin tab. Customers apply a code at checkout; the discount is validated live and saved on the order. | `admin/coupons.html`, `admin/js/admin-coupons.js`, `js/cart.js` |
| **Recently Viewed** | The last few products a shopper looked at follow them as a horizontal strip on the homepage and on other product pages (localStorage, no login needed). | `js/recently-viewed.js` |
| **Sort & filter toolbar** | "Newest / Price low-high / Price high-low / Top rated" sort plus an "In stock only" filter on the shop grid. | `js/store.js` |
| **Stock & new-arrival badges** | "Only N left" and "Sold Out" badges driven by the existing stock field, plus an automatic "New" tag on anything added in the last 14 days. | `js/store.js` |
| **Toast notifications** | Add-to-cart, wishlist, coupon, and validation messages now show as a small on-brand toast instead of a browser `alert()`. | `js/toast.js` |
| **Post-delivery reviews** | Once an order's status is "Delivered," a "Write a Review" button appears in Order History, opening a per-item star + comment form. | `js/order-history.js` |
| **Itemized order history** | Order History and the tracking modal now show each item's color/size/qty/price, plus a Subtotal → Delivery → Total breakdown, instead of just a total. | `js/order-history.js` |
| **Auto stock decrement** | Stock is decremented (via a Firestore transaction) the moment an order is placed, so the storefront and admin product list both reflect real availability immediately. | `js/cart.js` |
| **Admin-configurable delivery charge** | New **Delivery** tab in admin: set a free-delivery threshold (e.g. ₹499) and a flat charge below it (e.g. ₹50), or make delivery always free. Cart, checkout, and order records all pick this up automatically. | `admin/settings.html`, `admin/js/admin-settings.js`, `js/shipping-store.js`, `js/cart.js` |
| **Promotional ad banners** | A "Post New Ad" section under Admin → Banners → Promotional Ads, separate from the hero carousel. Post an image + optional title + optional click-through link, toggle active/paused. Live ads rotate in a slim, dismissible strip on the homepage and product pages. | `admin/js/admin-ads.js` (UI added to `admin/banners.html`), `js/ads-store.js`, `js/ads-banner.js` |
| **Light storefront theme** | Every customer-facing page (Shop, Product, Cart, Order History, Track Order, Profile, Order Success, Wishlist) now has a clean white/light body — the header and footer, plus all dark floating UI (search dropdown, category mega-menu, modals, toasts, welcome toast), keep the original black/gold look. The Admin Portal is unchanged (still fully dark). | `css/style.css` (`body.light-theme` block), `<body class="light-theme">` added to each customer page |
| **Full-screen zoomable product image viewer** | Clicking the main product photo (or the new expand icon on it) opens a Flipkart-style full-screen viewer: pinch-to-zoom and double-tap-to-zoom on mobile, mouse wheel/double-click zoom on desktop, drag-to-pan while zoomed, and left/right arrow buttons (plus swipe and keyboard arrows) to move between all of that product's photos. | `js/image-lightbox.js`, wired into `js/product-detail.js` |
| **One-word logo** | The header/sidebar logo now renders as a single solid word, "SANDRAGON," everywhere (customer + admin) — the earlier two-tone "SAN‑D‑RAGON" span has been removed. | all `.html` files, `css/style.css` |
| **Per-product coupon exclusion** | New "Coupon not applicable for this product" checkbox on each product in admin. If a cart contains that product, applying any coupon code is blocked with a message naming the product. | `admin/dashboard.html`, `admin/js/admin-products.js`, `js/cart.js` |
| **Admin review moderation** | New "Reviews" button on each product row in admin opens a panel listing every customer review for that product with a Delete option (aggregate rating auto-corrects), plus a form for admin to post its own review (name, star rating, comment) — shown on the storefront with a "Store" badge. | `admin/js/admin-product-reviews.js` (UI added to `admin/dashboard.html`), `js/reviews.js` |
| **"Become a Dealer" CTA** | A highlighted, pulsing tab fixed to the right edge of every customer page (positioned above the WhatsApp/Call floating buttons so it never overlaps them). Clicking it opens a form (Name, Mobile, Message) with a "Send via WhatsApp" button that opens WhatsApp with an auto-drafted message containing those details. | `js/dealer-cta.js` |
| **Generic product options** | The fixed "Colors" and "Sizes" fields are now a general **Product Options** builder — add any option type (Color, Size, Flavour, Contains, Material, or a custom name) and its values, and customers pick one value per option before adding to cart. Existing products with only `colors`/`sizes` keep working unchanged and auto-migrate the next time they're saved. | `admin/dashboard.html`, `admin/js/admin-products.js`, `js/product-detail.js`, `js/cart-store.js`, `js/cart.js`, `js/order-history.js`, `admin/js/admin-orders.js` |
| **Admin-managed categories** | New **Categories** tab in admin to add, rename, or delete categories (name + optional Font Awesome icon) — instantly reflected in the "Add Product" category dropdown, the storefront's category filter pills, and the header's category mega-menu. First visit auto-seeds the original 9 categories so existing products keep their category. | `admin/categories.html`, `admin/js/admin-categories.js`, `js/categories.js` (now Firestore-backed) |
| **Premium motion layer (inner pages)** | Product, Cart, Order History, Track Order, Profile, Order Success and Wishlist now get a GSAP-powered polish pass: a fade-in entry sequence, scroll-triggered reveals for panels (checkout summary, profile card, gallery, review/recent strips), a direction-aware sticky header, a magnetic pull on the floating WhatsApp/Call buttons, a subtle desktop-only lerp cursor, and a faint film-grain texture. Everything is wrapped in `prefers-reduced-motion`/`hover:hover` guards and degrades to a plain, fully-functional page if the animation library can't load. **The homepage/landing page (`index.html`) is untouched** — this layer is deliberately not loaded there. | `js/premium-motion.js`, GSAP + ScrollTrigger via CDN, `css/style.css` (motion layer block) |
| **New landing page video** | The homepage hero now plays the new SANDRAGON brand video instead of the placeholder clip. | `index.html` |
| **Red "D" wordmark** | The logo now renders as SAN**D**RAGON with the D in red, matching the brand mark, everywhere the wordmark appears (customer pages, admin sidebar). | all `.html` files, `css/style.css` (`.brand-d`) |
| **Smarter search** | The nav search bar and shop-grid search now use AND-matching first (every word must match) but automatically fall back to a looser OR match — and forgive simple singular/plural differences ("bat" ↔ "bats") — instead of returning zero results for a slightly-too-specific query. | `js/nav-features.js` |
| **Return &amp; Exchange + Terms page** | New `terms.html` covering a 3-day return &amp; exchange window plus standard ecommerce terms (orders/payment, shipping, refunds, privacy, contact) — linked from every page's footer and reachable directly at `#return-exchange`. | `terms.html`, `css/style.css` (`.policy-*`) |
| **Rich footer with Quick Links** | The homepage footer is now a 3-column layout: brand + social, a "Quick Links" column (shop, categories, wishlist, Become a Dealer), and a "Customer Care" column (order history, track order, return/exchange, terms). Inner pages keep a compact footer with the same policy links added. | `index.html`, `css/style.css` (`.footer-grid`), all other customer pages |
| **Category logos + safer icon fallback** | Admin → Categories can now upload an actual logo/image per category (Cloudinary) — shown instead of the Font Awesome icon everywhere a category appears (nav mega-menu, shop filter pills). Icon rendering also no longer goes blank if a category was saved without one; it always falls back to a generic tag icon. | `admin/categories.html`, `admin/js/admin-categories.js`, `js/categories.js`, `js/category-visual.js` (new shared renderer), `js/nav-features.js`, `js/store.js` |

**One-time setup step for this update:** re-deploy `firestore.rules` —
```bash
firebase deploy --only firestore:rules
```
It adds the `reviews` subcollection and `coupons` collection, plus a narrowly-scoped
public rule that lets a review bump only the `ratingCount`/`ratingSum` fields on a
product (everything else on `products` stays admin-only), and the same pattern for
a coupon's `usageCount`. This update also adds the `categories` collection
(public read, admin-only write) that the new Categories admin tab uses.


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
