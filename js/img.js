// SANDRAGON — responsive Cloudinary images.
//
// Product photos are uploaded straight from a phone, so the original files
// are often 2-5 MB each. Cloudinary can resize and convert on the fly just by
// adding a transformation to the URL: f_auto (WebP/AVIF when supported),
// q_auto (smart compression) and w_<width> (no bigger than needed). A product
// card now downloads ~30-60 KB instead of the full original.
//
// If a transformed URL ever fails (for example if "strict transformations"
// gets switched on in the Cloudinary account), the <img> falls back to the
// untouched original URL automatically, so nothing can break.

const CLD_RE = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/image\/upload\/)(.+)$/;

export function cld(url, width) {
  if (!url || typeof url !== 'string') return url;
  const m = url.match(CLD_RE);
  if (!m) return url;
  const rest = m[2];
  // Already carries its own transformation (e.g. "c_fill,w_500/v123/x.jpg") - leave it alone.
  if (/^[a-z]{1,3}_[^/]*\//.test(rest)) return url;
  return `${m[1]}f_auto,q_auto,c_limit,w_${width}/${rest}`;
}

function attr(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export const IMG_FALLBACK = "this.onerror=null;this.removeAttribute('srcset');this.src=this.dataset.orig";

// Returns an <img> tag string with srcset/sizes for Cloudinary URLs and a
// plain src for anything else (e.g. the local logo fallback).
export function imgHtml(url, { alt = '', widths = [320, 640], sizes = '100vw', cls = '', loading = 'lazy', priority = false, extra = '' } = {}) {
  const isCld = CLD_RE.test(url || '');
  const src = isCld ? cld(url, widths[widths.length - 1]) : url;
  const srcset = isCld ? widths.map(w => `${cld(url, w)} ${w}w`).join(', ') : '';
  return `<img src="${attr(src)}"${srcset ? ` srcset="${attr(srcset)}" sizes="${attr(sizes)}"` : ''}
    alt="${attr(alt)}" ${cls ? `class="${attr(cls)}"` : ''} loading="${priority ? 'eager' : loading}" decoding="async"
    ${priority ? 'fetchpriority="high"' : ''} data-orig="${attr(url)}" onerror="${IMG_FALLBACK}" ${extra}>`;
}
