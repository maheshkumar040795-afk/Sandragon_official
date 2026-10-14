import { getBannerSlides } from "./banner-store.js";
import { swr } from "./data-cache.js";
import { cld, IMG_FALLBACK } from "./img.js";

const AUTO_MS = 3000;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

// Measures the ACTUAL uploaded image and sizes the carousel box to match
// it exactly, instead of assuming every admin upload is pixel-perfect at
// the recommended 1756×450. Even a small mismatch there was enough for
// object-fit:cover to crop the top/bottom — matching the container to
// whatever was really uploaded makes that impossible.
function setRatioFromImage(url, cssVarName, root) {
  if (!url) return;
  const img = new Image();
  img.onload = () => {
    if (img.naturalWidth && img.naturalHeight) {
      root.style.setProperty(cssVarName, `${img.naturalWidth} / ${img.naturalHeight}`);
    }
  };
  img.src = url;
}

let timer = null;

function renderCarousel(root, slides) {
  clearInterval(timer);
  if (!slides.length) { root.style.display = 'none'; return; }
  root.style.display = '';

  // Based on the first slide (a consistent batch upload is the realistic
  // case). Desktop always matches the real image so it's never cropped.
  // Mobile only gets a matched ratio when a dedicated mobileUrl exists —
  // otherwise it deliberately keeps the fixed 16:9 edge-to-edge crop.
  setRatioFromImage(cld(slides[0].url, 1800), '--banner-ratio', root);
  if (slides[0].mobileUrl) setRatioFromImage(cld(slides[0].mobileUrl, 900), '--banner-ratio-mobile', root);

  let current = 0;

  root.innerHTML = `
    <div class="banner-track">
      ${slides.map((s, i) => `
        <div class="banner-slide ${i === 0 ? 'active' : ''}" data-i="${i}">
          <picture>
            <source media="(max-width: 600px)" srcset="${escapeHtml(cld(s.mobileUrl || s.url, 900))}">
            <img src="${escapeHtml(cld(s.url, 1800))}" data-orig="${escapeHtml(s.url)}" onerror="${IMG_FALLBACK};this.previousElementSibling&&this.previousElementSibling.remove()" alt="Banner ${i + 1}" loading="${i === 0 ? 'eager' : 'lazy'}" decoding="async">
          </picture>
          <a href="${escapeHtml(s.link || 'index.html')}" class="banner-explore-btn">Explore <i class="fas fa-arrow-right"></i></a>
        </div>
      `).join('')}
    </div>
    ${slides.length > 1 ? `
      <button type="button" class="banner-arrow prev" aria-label="Previous"><i class="fas fa-chevron-left"></i></button>
      <button type="button" class="banner-arrow next" aria-label="Next"><i class="fas fa-chevron-right"></i></button>
      <div class="banner-dots">
        ${slides.map((_, i) => `<button type="button" class="banner-dot ${i === 0 ? 'active' : ''}" data-i="${i}"></button>`).join('')}
      </div>
    ` : ''}
  `;

  const slideEls = root.querySelectorAll('.banner-slide');
  const dotEls = root.querySelectorAll('.banner-dot');

  function goTo(i) {
    current = (i + slides.length) % slides.length;
    slideEls.forEach((el, idx) => el.classList.toggle('active', idx === current));
    dotEls.forEach((el, idx) => el.classList.toggle('active', idx === current));
  }

  function restartAuto() {
    clearInterval(timer);
    if (slides.length > 1) timer = setInterval(() => goTo(current + 1), AUTO_MS);
  }

  root.querySelector('.banner-arrow.prev')?.addEventListener('click', () => { goTo(current - 1); restartAuto(); });
  root.querySelector('.banner-arrow.next')?.addEventListener('click', () => { goTo(current + 1); restartAuto(); });
  dotEls.forEach(dot => dot.addEventListener('click', () => { goTo(+dot.dataset.i); restartAuto(); }));

  // Pause rotation while the shopper hovers or the tab is hidden.
  root.onmouseenter = () => clearInterval(timer);
  root.onmouseleave = restartAuto;
  restartAuto();
}

function initBannerCarousel() {
  const root = document.getElementById('bannerCarousel');
  if (!root) return;
  swr('banner', getBannerSlides, (slides) => renderCarousel(root, slides)).catch(() => {});
}

document.addEventListener('visibilitychange', () => { if (document.hidden) clearInterval(timer); });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initBannerCarousel);
else initBannerCarousel();
