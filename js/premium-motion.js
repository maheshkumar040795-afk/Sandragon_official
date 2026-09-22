/* SANDRAGON — premium motion layer (inner pages only)
   Adds GSAP ScrollTrigger-driven reveals, a direction-aware sticky header,
   a magnetic/lerp custom cursor, an entry fade sequence and a film-grain
   overlay to every page that loads this file.

   IMPORTANT: this file is intentionally NOT included on index.html —
   the landing page / hero must stay exactly as it is. It only runs on
   product/cart/order-history/order-success/profile/track-order/wishlist.

   Written defensively: if the GSAP CDN is unreachable, every block below
   falls back to doing nothing rather than throwing, so the page's real
   functionality (store.js/cart.js/etc.) is never put at risk. */
(function () {
  if (window.__sandragonMotionInit) return;
  window.__sandragonMotionInit = true;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const hasGsap = typeof window.gsap !== 'undefined';

  if (hasGsap && window.ScrollTrigger) {
    gsap.registerPlugin(ScrollTrigger);
  }

  /* ---------- 1. Film-grain / noise overlay for atmospheric texture ---------- */
  function addNoiseOverlay() {
    if (document.querySelector('.noise-overlay')) return;
    const n = document.createElement('div');
    n.className = 'noise-overlay';
    n.setAttribute('aria-hidden', 'true');
    document.body.appendChild(n);
  }

  /* ---------- 2. Entry sequence: fade the page in instead of a hard cut ---------- */
  function pageEntrance() {
    const header = document.querySelector('header.navbar');
    const main = document.querySelectorAll('body > .container, body > footer');
    if (!hasGsap || reduceMotion) {
      // graceful no-JS-animation fallback: just make sure nothing is hidden
      return;
    }
    gsap.set([header, ...main], { autoAlpha: 0, y: 16 });
    const tl = gsap.timeline({ defaults: { ease: 'power3.out', duration: 0.7 } });
    tl.to(header, { autoAlpha: 1, y: 0 })
      .to(main, { autoAlpha: 1, y: 0, stagger: 0.08 }, '-=0.45');
  }

  /* ---------- 3. Scroll-triggered reveals for premium panels ----------
     Complements (does not duplicate) the IntersectionObserver reveal in
     premium.js — this targets the richer panel-level containers
     (checkout summary, profile card, gallery, ads strip, review/recent
     sections) that premium.js's selector list does not cover. */
  const panelSelectors = '.cart-summary, .profile-card, .pd-gallery, #adsStrip, #reviewsSection, #recentlyViewedSection, #relatedSection, .coupon-box, #checkoutSection > h2, #checkoutSection > div';
  function revealPanels(root) {
    const els = Array.from((root || document).querySelectorAll(panelSelectors));
    if (!els.length) return;
    if (!hasGsap || reduceMotion) {
      els.forEach((el) => el.classList.add('in-view'));
      return;
    }
    els.forEach((el) => {
      if (el.dataset.motionBound) return;
      el.dataset.motionBound = '1';
      gsap.from(el, {
        autoAlpha: 0,
        y: 30,
        duration: 0.8,
        ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true }
      });
    });
  }

  /* ---------- 4. Direction-aware sticky header ----------
     Hides the header on scroll-down, brings it back on scroll-up — keeps
     the page feeling premium and content-forward without losing quick
     access to search/cart. Leaves premium.js's shadow-on-scroll alone. */
  function stickyHeader() {
    const nav = document.querySelector('header.navbar');
    if (!nav || reduceMotion) return;
    nav.classList.add('navbar-motion');
    let lastY = window.scrollY;
    let ticking = false;
    window.addEventListener('scroll', () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const goingDown = y > lastY && y > 120;
        // never hide while a dropdown/mega-menu/modal is open
        const blocked = document.querySelector('.search-dropdown.open, .mega-menu:hover, .modal-overlay.open, #navLinks.active');
        if (!blocked) {
          nav.classList.toggle('nav-hidden', goingDown);
        }
        lastY = y;
        ticking = false;
      });
    }, { passive: true });
  }

  /* ---------- 5. Magnetic pull for the floating WhatsApp/call buttons ---------- */
  function magneticFloaters() {
    if (!canHover || reduceMotion) return;
    document.querySelectorAll('.float-btn').forEach((el) => {
      if (el.dataset.magBound) return;
      el.dataset.magBound = '1';
      el.addEventListener('mousemove', (e) => {
        const r = el.getBoundingClientRect();
        const mx = (e.clientX - r.left - r.width / 2) * 0.3;
        const my = (e.clientY - r.top - r.height / 2) * 0.3;
        el.style.transform = `translate(${mx}px, ${my}px) scale(1.08)`;
      });
      el.addEventListener('mouseleave', () => { el.style.transform = ''; });
    });
  }

  /* ---------- 6. Custom lerp cursor (desktop pointer devices only) ---------- */
  function customCursor() {
    if (!canHover || reduceMotion) return;
    if (document.querySelector('.sd-cursor-dot')) return;

    const dot = document.createElement('div');
    dot.className = 'sd-cursor-dot';
    const ring = document.createElement('div');
    ring.className = 'sd-cursor-ring';
    document.body.appendChild(dot);
    document.body.appendChild(ring);

    let mx = window.innerWidth / 2, my = window.innerHeight / 2;
    let rx = mx, ry = my;
    let active = false;

    window.addEventListener('mousemove', (e) => {
      mx = e.clientX; my = e.clientY;
      dot.style.transform = `translate3d(${mx}px, ${my}px, 0)`;
      if (!active) { active = true; document.body.classList.add('sd-cursor-active'); }
    });
    window.addEventListener('mouseleave', () => {
      document.body.classList.remove('sd-cursor-active');
    });

    function raf() {
      rx += (mx - rx) * 0.16;
      ry += (my - ry) * 0.16;
      ring.style.transform = `translate3d(${rx}px, ${ry}px, 0)`;
      requestAnimationFrame(raf);
    }
    requestAnimationFrame(raf);

    const growSelector = 'a, button, .btn, .product-card, .float-btn, input, textarea, select, .dealer-cta-tab';
    document.addEventListener('mouseover', (e) => {
      if (e.target.closest && e.target.closest(growSelector)) ring.classList.add('sd-cursor-grow');
    });
    document.addEventListener('mouseout', (e) => {
      if (e.target.closest && e.target.closest(growSelector)) ring.classList.remove('sd-cursor-grow');
    });
  }

  /* ---------- 7. Watch for async-injected content (store.js/cart.js etc. render after fetch) ---------- */
  function boot() {
    addNoiseOverlay();
    pageEntrance();
    revealPanels();
    stickyHeader();
    magneticFloaters();
    customCursor();

    const mo = new MutationObserver(() => {
      revealPanels();
      magneticFloaters();
    });
    mo.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
