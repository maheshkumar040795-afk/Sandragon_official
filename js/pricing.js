// SANDRAGON — shared price display.
//
// A product stores:
//   price : what the customer pays (the discount price, or the only price)
//   mrp   : the actual / original price, shown struck out (optional)
// Keeping `price` as the selling price means cart, sort, search and checkout
// all keep working unchanged; `mrp` is purely for showing the saving.

export function inr(n) {
  return '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
}

// The struck-out actual price, or 0 when there's no real discount.
export function mrpOf(p) {
  const mrp = Number(p?.mrp);
  const price = Number(p?.price);
  return mrp > 0 && price > 0 && mrp > price ? mrp : 0;
}

export function discountPct(p) {
  const mrp = mrpOf(p);
  if (!mrp) return 0;
  return Math.round(((mrp - Number(p.price)) / mrp) * 100);
}

// e.g. "₹600  ₹1,000  ↓40%"
export function priceHtml(p, size = 'sm') {
  const mrp = mrpOf(p);
  const pct = discountPct(p);
  return `
    <div class="price-block price-${size}">
      <span class="price">${inr(p.price)}</span>
      ${mrp ? `<s class="mrp" aria-label="Actual price ${inr(mrp)}">${inr(mrp)}</s>` : ''}
      ${pct > 0 ? `<span class="off" aria-label="${pct} percent off"><i class="fas fa-arrow-down"></i>${pct}%</span>` : ''}
    </div>`;
}
