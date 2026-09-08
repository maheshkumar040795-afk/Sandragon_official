// SANDRAGON — shared category list.
// Add/remove categories here and every part of the site (admin form,
// nav mega-menu, storefront filter pills, related-products logic)
// picks it up automatically.

export const CATEGORIES = [
  { id: 'bats',        name: 'Bats',           icon: 'fa-baseball-bat-ball' },
  { id: 'balls',       name: 'Balls',          icon: 'fa-baseball' },
  { id: 'gloves',      name: 'Gloves',         icon: 'fa-mitten' },
  { id: 'pads-guards', name: 'Pads & Guards',  icon: 'fa-shield-halved' },
  { id: 'helmets',     name: 'Helmets',        icon: 'fa-hard-hat' },
  { id: 'apparel',     name: 'Apparel',        icon: 'fa-shirt' },
  { id: 'shoes',       name: 'Shoes',          icon: 'fa-shoe-prints' },
  { id: 'kit-bags',    name: 'Kit Bags',       icon: 'fa-suitcase-rolling' },
  { id: 'accessories', name: 'Accessories',    icon: 'fa-toolbox' },
];

export function categoryName(id) {
  const c = CATEGORIES.find(c => c.id === id);
  return c ? c.name : '';
}

export function categoryIcon(id) {
  const c = CATEGORIES.find(c => c.id === id);
  return c ? c.icon : 'fa-tag';
}
