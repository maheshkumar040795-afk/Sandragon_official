// SANDRAGON — shared toast notification system.
// Replaces jarring browser alert()s with a small, dismissible, on-brand
// toast stack. Import { toast } and call toast('message', 'success'|'error'|'info').

let stackEl = null;

function ensureStack() {
  if (stackEl) return stackEl;
  stackEl = document.createElement('div');
  stackEl.className = 'toast-stack';
  stackEl.setAttribute('aria-live', 'polite');
  stackEl.setAttribute('role', 'status');
  document.body.appendChild(stackEl);
  return stackEl;
}

const ICONS = {
  success: 'fa-circle-check',
  error: 'fa-circle-exclamation',
  info: 'fa-circle-info',
  wishlist: 'fa-heart'
};

export function toast(message, type = 'success', duration = 3200) {
  const stack = ensureStack();
  const el = document.createElement('div');
  el.className = `toast-item toast-${type}`;
  el.innerHTML = `
    <i class="fas ${ICONS[type] || ICONS.info}"></i>
    <span>${message}</span>
    <button type="button" class="toast-close" aria-label="Dismiss">&times;</button>
  `;
  stack.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));

  let timer = setTimeout(() => dismiss(), duration);
  function dismiss() {
    clearTimeout(timer);
    el.classList.remove('show');
    setTimeout(() => el.remove(), 350);
  }
  el.querySelector('.toast-close').addEventListener('click', dismiss);
  el.addEventListener('mouseenter', () => clearTimeout(timer));
  el.addEventListener('mouseleave', () => { timer = setTimeout(dismiss, 1400); });

  return dismiss;
}
