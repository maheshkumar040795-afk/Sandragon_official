// SANDRAGON — storefront promotional ad strip. Renders whatever the admin
// posted at Admin → Banners → Promotional Ads (see js/ads-store.js).
// Independent of the hero carousel — this is a slim, dismissible, rotating
// strip meant to be droppable onto any page via <div id="adsStrip"></div>.
import { getActiveAds } from "./ads-store.js";

const AUTO_MS = 6000;
const DISMISS_KEY = 'sandragon_ads_dismissed'; // sessionStorage — reappears next visit

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, m => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[m]));
}

function isExternal(url) {
  return /^https?:\/\//i.test(url);
}

async function initAdsStrip() {
  const root = document.getElementById('adsStrip');
  if (!root) return;
  if (sessionStorage.getItem(DISMISS_KEY) === '1') return;

  const ads = await getActiveAds();
  if (!ads.length) { root.style.display = 'none'; return; }

  let current = 0;
  let timer = null;

  root.innerHTML = `
    <div class="ads-strip-inner">
      <span class="ads-strip-label">Ad</span>
      <div class="ads-strip-track">
        ${ads.map((ad, i) => `
          <a href="${escapeHtml(ad.linkUrl || '#')}"
             ${ad.linkUrl && isExternal(ad.linkUrl) ? 'target="_blank" rel="noopener"' : ''}
             class="ads-strip-slide ${i === 0 ? 'active' : ''}" data-i="${i}">
            <img src="${escapeHtml(ad.imageUrl)}" alt="${escapeHtml(ad.title || 'Advertisement')}" loading="${i === 0 ? 'eager' : 'lazy'}">
          </a>
        `).join('')}
      </div>
      ${ads.length > 1 ? `
      <div class="ads-strip-dots">
        ${ads.map((_, i) => `<button type="button" class="ads-strip-dot ${i === 0 ? 'active' : ''}" data-i="${i}" aria-label="Show ad ${i + 1}"></button>`).join('')}
      </div>` : ''}
      <button type="button" class="ads-strip-close" aria-label="Dismiss ad"><i class="fas fa-times"></i></button>
    </div>
  `;

  const slideEls = root.querySelectorAll('.ads-strip-slide');
  const dotEls = root.querySelectorAll('.ads-strip-dot');

  function goTo(i) {
    current = (i + ads.length) % ads.length;
    slideEls.forEach((el, idx) => el.classList.toggle('active', idx === current));
    dotEls.forEach((el, idx) => el.classList.toggle('active', idx === current));
  }
  function restartAuto() {
    clearInterval(timer);
    if (ads.length > 1) timer = setInterval(() => goTo(current + 1), AUTO_MS);
  }
  dotEls.forEach(dot => dot.addEventListener('click', (e) => {
    e.preventDefault();
    goTo(+dot.dataset.i);
    restartAuto();
  }));

  root.querySelector('.ads-strip-close').addEventListener('click', () => {
    sessionStorage.setItem(DISMISS_KEY, '1');
    root.style.display = 'none';
    clearInterval(timer);
  });

  restartAuto();
}

document.addEventListener('DOMContentLoaded', initAdsStrip);
