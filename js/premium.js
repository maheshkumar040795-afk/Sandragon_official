/* SANDRAGON — premium interaction layer
   Adds 3D tilt, scroll reveals, magnetic buttons and ambient depth
   without touching any existing page logic (store.js, cart.js, admin-*.js, etc).
   Intentionally does NOT touch .hero / .hero-video (landing page video block). */
(function () {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  /* ---------- 1. Ambient background orbs ---------- */
  function addOrbs() {
    if (document.querySelector('.ambient-orb')) return;
    const o1 = document.createElement('div');
    o1.className = 'ambient-orb o1';
    const o2 = document.createElement('div');
    o2.className = 'ambient-orb o2';
    document.body.appendChild(o1);
    document.body.appendChild(o2);
  }

  /* ---------- 2. Scroll reveal (IntersectionObserver) ---------- */
  const revealSelectors = '.product-card, .cart-item, .pd-wrap, .modal, .login-box, tbody tr, .section-title, .admin-header, .empty-state';
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        io.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

  function observeReveal(root) {
    if (reduceMotion) return;
    root.querySelectorAll(revealSelectors).forEach((el) => {
      if (!el.classList.contains('in-view')) io.observe(el);
    });
  }

  /* ---------- 3. 3D tilt on product cards / gallery / login / modal ---------- */
  const tiltSelectors = '.product-card, .pd-gallery .main-img, .login-box';
  function applyTilt(el) {
    if (!canHover || reduceMotion || el.dataset.tiltBound) return;
    el.dataset.tiltBound = '1';
    const strength = 10;
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `translateY(0) rotateX(${(-py * strength).toFixed(2)}deg) rotateY(${(px * strength).toFixed(2)}deg)`;
    });
    el.addEventListener('mouseleave', () => {
      el.style.transform = '';
    });
  }
  function bindTilts(root) {
    root.querySelectorAll(tiltSelectors).forEach(applyTilt);
  }

  /* ---------- 4. Magnetic buttons ---------- */
  function applyMagnetic(el) {
    if (!canHover || reduceMotion || el.dataset.magBound) return;
    el.dataset.magBound = '1';
    el.addEventListener('mousemove', (e) => {
      const r = el.getBoundingClientRect();
      const mx = (e.clientX - r.left - r.width / 2) * 0.25;
      const my = (e.clientY - r.top - r.height / 2) * 0.35;
      el.style.transform = `translate(${mx}px, ${my}px)`;
    });
    el.addEventListener('mouseleave', () => {
      el.style.transform = '';
    });
  }
  function bindMagnetic(root) {
    root.querySelectorAll('.btn:not(.small)').forEach(applyMagnetic);
  }

  /* ---------- 5. Run on load + watch for dynamically injected content ---------- */
  function scan(root) {
    observeReveal(root);
    bindTilts(root);
    bindMagnetic(root);
  }

  document.addEventListener('DOMContentLoaded', () => {
    addOrbs();
    scan(document);
  });

  const mo = new MutationObserver((mutations) => {
    mutations.forEach((m) => {
      m.addedNodes.forEach((node) => {
        if (node.nodeType === 1) scan(node);
      });
    });
  });
  mo.observe(document.documentElement, { childList: true, subtree: true });

  /* ---------- 6. Navbar shadow-on-scroll ---------- */
  const nav = document.querySelector('header.navbar');
  if (nav) {
    window.addEventListener('scroll', () => {
      if (window.scrollY > 10) {
        nav.style.boxShadow = '0 8px 24px -12px rgba(0,0,0,.6)';
      } else {
        nav.style.boxShadow = 'none';
      }
    }, { passive: true });
  }
})();
