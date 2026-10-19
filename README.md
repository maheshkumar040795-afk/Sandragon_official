# SANDRAGON — E-Commerce Website (Customer + Admin Portal)

## Cancellation needs admin confirmation (Oct 16, 2026)

- Customer **Cancel Order** now sends a *request*: WhatsApp opens with the drafted message and the order shows **Cancel requested** (Order History says "Waiting for SANDRAGON to confirm"). Nothing changes in stock or points yet.
- Admin → Orders → **Cancelled** tab shows requests with an "N to verify" badge. Open one → **Confirm Cancellation** (status becomes Cancelled for the customer, stock restored, earned points removed, used points returned) or **Reject Request** (order goes back to its previous status and the Cancel button reappears for the customer).
- After confirming, **Inform customer on WhatsApp** sends a drafted "your order has been cancelled" message.
- Re-publish `firestore.rules` (customers may now only set `cancel_requested`).

## Cancel via WhatsApp & points on cancel/return (Oct 16, 2026)

- **Cancel** now always opens WhatsApp with a drafted cancellation message (order, items, total, reason, name, phone). If the online cancel can't be saved (e.g. rules not yet published), the customer is told the request was sent and the store cancels it from Admin → Orders → **Cancel Order**.
- **Points on cancel:** points earned by the order are removed from the customer's balance immediately when they cancel. When the admin opens Orders, cancelled orders are **settled automatically** (stock restored, redeemed points returned, any remaining earned points removed, once only).
- **Points on return:** requesting a return removes that item's share of the order's earned points. Admin can **Accept** or **Reject** each return; rejecting gives the points back.

## Cancel, return & "Return not applicable" (Oct 16, 2026)

- **Cancel order** (Order History): available while the order is Placed, Confirmed or Packed; disappears once Shipped. Optional reason; customer can then message the store on WhatsApp. Admin → Orders has a **Cancelled** tab; **Settle Cancellation** puts the items back in stock, returns redeemed points and takes back points earned (once only).
- **Return** (Order History): a Return button per product after the order is Delivered, for **3 days** from the delivered date, then it disappears. Reason dropdown (Damaged product / Incorrect colour / Incorrect size / Other + description). **Send** opens WhatsApp with the request drafted to the store number, and the request is saved on the order (shown in Admin → Orders and the Excel export).
- **Return not applicable** (Admin → Products): products with this ticked never show a Return button, and the product page and cart say "Return not applicable for this product".
- **Re-deploy `firestore.rules`**: it adds the two narrow customer permissions (cancel before shipping, return within 3 days).

## Points redeem limit, order tabs & Excel export (Oct 15, 2026)

- **Redeem limit:** points can pay for at most *Max redeem %* (Admin → Points, default **5%**) of the eligible products' value, rounded off. Example: 550 points, ₹449 product → redeem 22 points, pay ₹427. **An order that uses points or a coupon earns no new points, and points can't be combined with a coupon** (applying a coupon removes redeemed points; the cart has a *Remove coupon* link).
- **Orders tabs:** New (placed) · Confirmed (confirmed / packed / shipped) · Delivered, each with a count. Tick rows (or the header box for all) and use **Delete Selected**. Deleting an order does not take back points already credited.
- **Export Excel** (.xlsx, falls back to .csv if the Excel library can't load): Orders (current tab, or only the ticked rows; includes an Order Items sheet), Products, Coupons, Categories, and Customers & points (Admin → Points).

## 🪙 Discounts, purchase points & HD landing video (Oct 15, 2026)

| Feature | How it works | Files |
|---|---|---|
| **Actual price + discount price** | Admin → Products → Add/Edit has *Actual Price* and *Discount Price* with a live "↓40% off" preview. The store shows ~~₹1,000~~ **₹600 ↓40%** on cards, product page ("You save ₹400"), wishlist, recently viewed and cart. New sort: *Biggest discount*. `price` stays the selling price; `mrp` is the struck-out price. | `js/pricing.js`, `admin/dashboard.html`, `admin/js/admin-products.js` |
| **Purchase Points settings** | Admin → **Points**: switch on/off, "for every ₹100 → 10 points", "1 point = ₹1". | `admin/points.html`, `admin/js/admin-points.js`, `js/points-store.js` |
| **Points redeem applicable (per product)** | Checkbox on each product. The cart shows **Redeem your points here** only when the cart has at least one such product, and points can only cover those products' value. | `js/cart.js`, `cart.html` |
| **Safe redemption** | Points are deducted in the same Firestore transaction that saves the order, so they can't be spent twice. Cart prices are re-read from Firestore on the cart page. | `js/cart.js` |
| **Earning + WhatsApp** | Points earned = whole ₹100 steps of the item amount actually paid (after coupon and points, excluding delivery). Credited once when admin clicks **Mark as Confirmed**; the confirmation WhatsApp includes points earned, new balance and "1 point = ₹1". | `admin/js/admin-orders.js` |
| **Customer profile** | "My SANDRAGON Points" card: balance, rupee value and a short guide. Order history shows points earned/redeemed per order; product pages show "Earn N points". | `js/profile.js`, `js/order-history.js`, `js/product-detail.js` |
| **HD landing video** | The hero now requests a copy sized to the screen at Cloudinary's best automatic quality and format (`f_auto,q_auto:best,w_…`), with the original as fallback. Admin → Banners → **Landing Video** lets you upload a new 1080p/4K desktop video and an optional portrait phone video, and shows each file's real resolution. | `js/hero-video.js`, `js/hero-store.js`, `admin/js/admin-hero.js` |

**One-time step:** re-deploy `firestore.rules` (`firebase deploy --only firestore:rules`, or paste it into Firebase Console → Firestore → Rules). The new rules stop a shopper's browser from ever adding points to a balance; only the admin can credit points.


## ⚡ Speed & design update (Oct 2026)

**Faster page-to-page navigation**
| Change | Effect |
|---|---|
| Shared catalog cache (`js/data-cache.js`, `js/products-store.js`) | Shop grid, product page, search and "You may also like" paint instantly from the last copy seen, then refresh from Firestore in the background. The cart page re-reads every product from Firestore and updates prices before checkout (added Oct 15). |
| Categories no longer block page load (`js/categories.js`) | Search, menu and the grid used to wait for a Firestore round trip on every page. Now only the very first visit (and admin pages) wait. |
| Product page renders from the grid's data | Opening a product from the shop shows it immediately instead of a spinner; related products come from the cache (one less query). |
| Sized Cloudinary images (`js/img.js`) | Cards, thumbnails, banners and the lightbox request `f_auto,q_auto,w_…` versions with `srcset`, instead of multi-MB originals. Falls back to the original URL automatically if a transformed one fails. |
| Hover prerender (Speculation Rules) | Chrome/Edge start loading a product page when a shopper hovers its link, so the click opens instantly. Other links are prefetched. |
| Lighter pages | Firebase Auth split into `js/firebase-auth.js` (admin only); GSAP, the custom cursor loop, blurred orbs and the 0.7 s page fade-in removed; Razorpay script loads async; fonts and icons self-hosted (`fonts/`, `vendor/fontawesome/`) with preload/preconnect. |

**Design & effects**
- Barlow Condensed headings + Barlow body (sporty, compact); SANDRAGON wordmark keeps Playfair.
- Product cards: second photo crossfades in on hover, lift on hover, press feedback, 2-column grid on phones.
- Skeleton loaders on the shop grid and product page instead of spinners.
- Native cross-page View Transitions (header stays, content crossfades).
- Cart/wishlist counter pops when it increases and hides at 0; category pills become a swipeable row on phones.
- Solid header, sticky product gallery on desktop, pill buttons with consistent radius system.


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
| 3 | Razorpay | Razorpay Checkout.js on the frontend + a small free Cloudflare Worker (`payment-worker/worker.js`) that works out the total from Firestore, creates the Razorpay order and verifies the payment, so the `key_secret` never sits in browser code and Firebase stays on the free Spark plan. |
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
├── payment-worker/
│   └── worker.js             → Razorpay payment server (Cloudflare Worker, free)
├── firestore.rules           → Security rules (public read products, admin-only writes)
├── firebase.json             → Firestore rules config
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
6. Stay on the free **Spark** plan. Payments run on a free Cloudflare Worker (step 4), so Blaze isn't needed.

### 2. Deploy Firestore rules
```bash
npm install -g firebase-tools
firebase login
firebase init      # select Firestore; point to this folder; use existing project
firebase deploy --only firestore:rules
```

### 3. Set up Cloudinary (product image hosting)
1. Create a free account at [cloudinary.com](https://cloudinary.com).
2. Dashboard → copy your **Cloud Name** → paste into `js/config.js` → `cloudinaryConfig.cloudName`.
3. Settings → Upload → Upload presets → Add upload preset → set **Signing Mode: Unsigned** → name it `sandragon_unsigned` (or update the name in `config.js` to match).

### 4. Set up Razorpay (Cloudflare Worker, free)
Payments need one small server that holds the Razorpay **Key Secret**. It runs on a free
Cloudflare Worker, so Firebase stays on Spark and the site stays on GitHub Pages.

**a. Razorpay keys**
1. The store owner signs up at [razorpay.com](https://razorpay.com) with his own PAN and bank
   account (payments are paid into that account).
2. Switch the dashboard to **Test Mode** → Account & Settings → **API Keys** → Generate Test Key.
   Copy the **Key Id** (`rzp_test_...`) and keep the **Key Secret** safe; Razorpay shows it once.
3. Account & Settings → **Payment capture** → make sure payments are captured **automatically**.

**b. Create the worker**
1. Sign up free at [dash.cloudflare.com](https://dash.cloudflare.com).
2. **Workers & Pages → Create → Create Worker** → name it `sandragon-pay` → **Deploy**.
3. **Edit code** → delete everything → paste the whole of `payment-worker/worker.js` → **Deploy**.
4. Worker → **Settings → Variables and Secrets → Add**:
   - `RAZORPAY_KEY_ID` (Text) = `rzp_test_...`
   - `RAZORPAY_KEY_SECRET` (**Secret**) = the Key Secret
   - Optional `ALLOWED_ORIGINS` (Text): the site's address(es), comma separated, if you move to
     your own domain (default: `https://maheshkumar040795-afk.github.io` + localhost).
5. Copy the worker's address, e.g. `https://sandragon-pay.yourname.workers.dev`. Opening it in a
   browser should show `{"ok":true,"mode":"test"}`.

**c. Connect the site**
In `js/config.js` set `razorpayConfig.keyId` to the `rzp_test_...` Key Id and
`paymentServerUrl` to the worker address. Demo mode switches off by itself.

**d. Test, then go live**
Pay with Razorpay's test card / test UPI. The order appears in Admin → Orders, and opening it
shows "Paid ₹X, confirmed by Razorpay". After KYC is approved, generate **Live** keys and
replace both values (`RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` in Cloudflare, `keyId` in config.js).

Refunds for cancelled or returned orders are made from the Razorpay dashboard
(Transactions → Payments → Refund).

### 5. (No longer needed) Cloud Functions
The old `functions/` folder was replaced by the Cloudflare Worker above.

### 6. Fill in `js/config.js` completely
This one file holds everything: Firebase config, Cloudinary, Razorpay key, payment server URL, your
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

---

## Update — 16 Oct 2026: Razorpay payments without Blaze

- **Payment server on Cloudflare Workers (free).** `payment-worker/worker.js` replaces the old
  Firebase Cloud Functions, which needed the Blaze plan and used deprecated Firebase APIs.
  Firebase stays on Spark; the site stays on GitHub Pages.
- **The total is worked out on the server.** The worker reads the live product prices, coupon,
  points settings, the customer's points balance and the delivery charge from Firestore and
  creates the Razorpay order for that amount. A price edited in the browser is ignored; if the
  totals disagree, checkout refreshes and shows the shopper the correct total first.
- **Signature check after payment**, and if the payment server can't be reached at that moment
  the order is still saved (the money was taken) and flagged for the admin.
- **Admin → Orders → open an order** shows a live check from Razorpay: "Paid ₹X by UPI,
  confirmed by Razorpay", or a red warning if the payment is missing, failed, refunded or the
  amount doesn't match the order.
- Razorpay order notes include the customer's name, phone and items, so a payment can always be
  matched to a customer from the Razorpay dashboard.
- Setup: see **Setup step 4**. Until `keyId` and `paymentServerUrl` are filled in, checkout stays
  in demo mode.

---

## Update — 16 Oct 2026: Modern Categories menu

- **Two-pane Categories menu.** Left: every category with its icon tile, name and how many
  products it has ("Coming soon" when empty). Right: a live preview of up to 6 products from the
  hovered category (photo, name, price with struck-out MRP) and a "Shop all" link.
- Uses the product list the store already caches, so the preview adds no extra Firestore reads.
- Short 180 ms fade-and-lift on open, gold highlight bar on the active category, Esc closes it,
  keyboard Tab moves through categories and updates the preview.
- Phones: a clean 2-column category grid inside the hamburger menu (no preview pane).
- Fix: on the home page the navbar script ran twice, so tapping **Categories** on a phone opened
  and closed the menu in the same tap. It now runs once.

---

## Update — 17 Oct 2026: Category cards + Request a Product

- **Shop-by-category cards** on the home page replace the small pills: icon tile, name and item
  count; the selected category turns black with a gold icon. Phones get a swipeable row (the first
  card no longer hides under the screen edge).
- **Request a Product** tab sits above **Become a Dealer** on every customer page (and in the home
  footer). Shoppers fill in product, brand/model, size/colour/flavour, quantity, budget, link or
  details, name, mobile and city/pincode; it drafts a WhatsApp message to the store so it can be
  sourced from a vendor. Name, mobile and pincode are pre-filled for signed-in shoppers. Nothing is
  stored on the website.

---

## Update — 19 Oct 2026: Go-live on sandragon.in (SEO, icons, robots, sitemap)

**Files added:** `CNAME` (sandragon.in), `robots.txt`, `sitemap.xml`, `site.webmanifest`, `404.html`,
`favicon.ico`, `apple-touch-icon.png`, `assets/icons/*` (16/32/192/512/maskable), `assets/og-image.jpg`
(1200×630 link-preview image).

**SEO:** every public page has its own title, description, canonical URL (https://sandragon.in/…),
Open Graph/Twitter tags and favicons; the home page has keywords and Organization/WebSite (search box)
structured data, plus a visible "Sports equipment, gym gear & supplements, delivered fast" section.
Product pages set their own title, description, share image and Product structured data (price,
stock, rating) when they load; category views get titles like "Bats Online | Buy Bats at SANDRAGON".
Cart, account, order and admin pages are `noindex`.

**sitemap.xml** lists the home page, categories with products, current products and policy pages.
Add new product URLs (`https://sandragon.in/product.html?id=<id>`) when you add products, or ask for it
to be regenerated.

### Going live checklist
1. **DNS at your domain registrar** (for sandragon.in):
   - `A` records for `@` → `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`
   - (optional) `AAAA` for `@` → `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153`
   - `CNAME` for `www` → `maheshkumar040795-afk.github.io`
   - Delete any old parking/forwarding records for `@` and `www`.
2. **GitHub → repo Settings → Pages → Custom domain:** `sandragon.in` → Save. When the DNS check
   passes and the certificate is issued, tick **Enforce HTTPS**.
3. **Cloudflare worker:** paste the updated `payment-worker/worker.js` and Deploy (it now allows
   sandragon.in), or add the variable `ALLOWED_ORIGINS` =
   `https://sandragon.in,https://www.sandragon.in`.
4. **Firebase → Authentication → Settings → Authorized domains:** add `sandragon.in` and `www.sandragon.in`.
5. **Google Search Console:** add the domain property `sandragon.in` (verify with the DNS TXT record
   it gives you), then **Sitemaps → submit `sitemap.xml`** and **URL inspection → Request indexing**
   for the home page.
