/* SANDRAGON — motion layer (all customer pages).
   Lightweight replacement for the old premium.js + premium-motion.js pair.

   What changed and why:
   - No GSAP download (was ~70 KB on every inner page) and no full-page
     fade-in on load, which made every navigation feel ~0.7 s slower.
   - No custom cursor rAF loop, ambient blurred orbs or 3D card tilt: they
     cost frames on phones and added little for a shop.
   - Page-to-page transitions now use the browser's native View Transitions
     (see css/style.css, @view-transition), which cost nothing to load.

   What remains is motion with a job: content eases in as it scrolls into
   view, the header gains a shadow once the page scrolls, and the cart and
   wishlist counters pop when they change so the shopper sees it happen. */
(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1. Scroll reveal (one IntersectionObserver) ---------- */
  const revealSelectors = [
    '.product-card:not(.skeleton-card)', '.cart-item', '.reveal-up',
    '.order-card',
    '#reviewsSection > *', '#recentlyViewedSection > *', '#relatedSection > .section-title'
  ].join(', ');

  const io = 'IntersectionObserver' in window ? new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.08, rootMargin: '0px 0px -24px 0px' }) : null;

  function collect(root, selector) {
    const out = [];
    if (root.nodeType === 1 && root.matches && root.matches(selector)) out.push(root);
    if (root.querySelectorAll) out.push(...root.querySelectorAll(selector));
    return out;
  }

  function observeReveal(root) {
    collect(root, revealSelectors).forEach((el) => {
      if (el.classList.contains('in-view')) return;
      el.classList.add('reveal');
      if (reduceMotion || !io) el.classList.add('in-view');
      else io.observe(el);
    });
  }

  /* ---------- 2. Counter "pop" when cart / wishlist change ---------- */
  function watchCounter(id) {
    const el = document.getElementById(id);
    if (!el || reduceMotion) return;
    let last = el.textContent;
    new MutationObserver(() => {
      if (el.textContent === last) return;
      const grew = Number(el.textContent) > Number(last);
      last = el.textContent;
      if (!grew) return;
      el.classList.remove('bump');
      void el.offsetWidth; // restart the animation
      el.classList.add('bump');
    }).observe(el, { childList: true, characterData: true, subtree: true });
  }

  /* ---------- 3. Header shadow once the page scrolls (no scroll listener) ---------- */
  function headerShadow() {
    const nav = document.querySelector('header.navbar');
    if (!nav || !io) return;
    const sentinel = document.createElement('div');
    sentinel.setAttribute('aria-hidden', 'true');
    sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:12px;pointer-events:none';
    document.body.prepend(sentinel);
    new IntersectionObserver(([e]) => nav.classList.toggle('scrolled', !e.isIntersecting)).observe(sentinel);
  }

  function boot() {
    observeReveal(document);
    watchCounter('cartCount');
    watchCounter('wishlistCount');
    headerShadow();

    // Products, carts and orders render after their data arrives; reveal those too.
    new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach((node) => { if (node.nodeType === 1) observeReveal(node); });
      }
    }).observe(document.body, { childList: true, subtree: true });

    // Safety net: content must never stay hidden because an observer missed it.
    window.addEventListener('load', () => setTimeout(() => {
      document.querySelectorAll('.reveal:not(.in-view)').forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.top < window.innerHeight) el.classList.add('in-view');
      });
    }, 600));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
