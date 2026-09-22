// SANDRAGON — shared "category visual" renderer. A category can have an
// admin-uploaded logo/image OR just a Font Awesome icon class; every place
// that shows a category (nav mega-menu, storefront filter pills) should
// render the same way, so that logic lives here once instead of being
// copy-pasted (and drifting) across nav-features.js and store.js.
export function categoryVisualHtml(c, wrapClass) {
  const icon = c.icon || 'fa-tag';
  if (c.image) {
    return `<span class="${wrapClass}"><img src="${c.image}" alt=""></span>`;
  }
  return `<span class="${wrapClass}"><i class="fas ${icon}"></i></span>`;
}
