// SANDRAGON — shared "category visual" renderer. A category can have an
// admin-uploaded logo/image OR just a Font Awesome icon class; every place
// that shows a category (nav mega-menu, storefront filter pills) renders it
// the same way from here.
import { cld, IMG_FALLBACK } from "./img.js";

export function categoryVisualHtml(c, wrapClass) {
  const icon = c.icon || 'fa-tag';
  if (c.image) {
    return `<span class="${wrapClass}"><img src="${cld(c.image, 96)}" data-orig="${c.image}" onerror="${IMG_FALLBACK}" alt="" loading="lazy" decoding="async"></span>`;
  }
  return `<span class="${wrapClass}"><i class="fas ${icon}"></i></span>`;
}
