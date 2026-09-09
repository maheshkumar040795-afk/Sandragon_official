import { getBannerSlides } from "./banner-store.js";

const AUTO_MS = 3000;

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

async function initBannerCarousel() {
  const root = document.getElementById('bannerCarousel');
  if (!root) return;

  const slides = await getBannerSlides();
  if (!slides.length) { root.style.display = 'none'; return; }

  let current = 0;
  let timer = null;

  root.innerHTML = `
    <div class="banner-track">
      ${slides.map((s, i) => `
        <div class="banner-slide ${i === 0 ? 'active' : ''}" data-i="${i}">
          <div class="banner-bg" style="background-image:url('${escapeHtml(s.url)}')"></div>
          <picture>
            ${s.mobileUrl ? `<source media="(max-width: 600px)" srcset="${escapeHtml(s.mobileUrl)}">` : ''}
            <img src="${escapeHtml(s.url)}" alt="Banner ${i + 1}" loading="${i === 0 ? 'eager' : 'lazy'}">
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

  restartAuto();
}

document.addEventListener('DOMContentLoaded', initBannerCarousel);
