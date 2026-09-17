// Full-screen product image viewer — zoom (pinch/wheel/double-tap), pan when
// zoomed, swipe or arrow-key navigation when not zoomed. Flipkart-style.

let images = [];
let index = 0;
let scale = 1;
let originX = 0, originY = 0; // translate in px, at scale 1 coordinate space
let overlay = null;
let stageImg = null;
let counterEl = null;

// Pointer tracking for drag/pinch
const pointers = new Map();
let pinchStartDist = 0;
let pinchStartScale = 1;
let dragStart = null;
let dragOrigin = null;
let lastTapTime = 0;
let swipeStartX = null;
let swipeStartY = null;

function build() {
  overlay = document.createElement('div');
  overlay.className = 'lightbox-overlay';
  overlay.innerHTML = `
    <button type="button" class="lightbox-close" aria-label="Close"><i class="fas fa-times"></i></button>
    <button type="button" class="lightbox-arrow lightbox-prev" aria-label="Previous"><i class="fas fa-chevron-left"></i></button>
    <div class="lightbox-stage" id="lightboxStage">
      <img class="lightbox-img" id="lightboxImg" draggable="false" alt="">
    </div>
    <button type="button" class="lightbox-arrow lightbox-next" aria-label="Next"><i class="fas fa-chevron-right"></i></button>
    <div class="lightbox-counter" id="lightboxCounter"></div>
  `;
  document.body.appendChild(overlay);
  stageImg = overlay.querySelector('#lightboxImg');
  counterEl = overlay.querySelector('#lightboxCounter');

  overlay.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
  overlay.querySelector('.lightbox-prev').addEventListener('click', () => go(-1));
  overlay.querySelector('.lightbox-next').addEventListener('click', () => go(1));
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeLightbox();
  });

  const stage = overlay.querySelector('#lightboxStage');
  stage.addEventListener('pointerdown', onPointerDown);
  stage.addEventListener('pointermove', onPointerMove);
  stage.addEventListener('pointerup', onPointerUp);
  stage.addEventListener('pointercancel', onPointerUp);
  stage.addEventListener('pointerleave', onPointerUp);
  stage.addEventListener('wheel', onWheel, { passive: false });
  stage.addEventListener('dblclick', onDoubleClick);

  document.addEventListener('keydown', onKeyDown);
}

function ensureBuilt() {
  if (!overlay) build();
}

function resetTransform() {
  scale = 1; originX = 0; originY = 0;
  applyTransform();
}

function applyTransform() {
  stageImg.style.transform = `translate(${originX}px, ${originY}px) scale(${scale})`;
  stageImg.classList.toggle('zoomed', scale > 1.001);
}

function clampPan() {
  if (scale <= 1) { originX = 0; originY = 0; return; }
  const stage = overlay.querySelector('#lightboxStage');
  const rect = stage.getBoundingClientRect();
  const maxX = (rect.width * (scale - 1)) / 2;
  const maxY = (rect.height * (scale - 1)) / 2;
  originX = Math.max(-maxX, Math.min(maxX, originX));
  originY = Math.max(-maxY, Math.min(maxY, originY));
}

function renderCurrent() {
  stageImg.src = images[index];
  resetTransform();
  counterEl.textContent = images.length > 1 ? `${index + 1} / ${images.length}` : '';
  const multi = images.length > 1;
  overlay.querySelector('.lightbox-prev').style.display = multi ? '' : 'none';
  overlay.querySelector('.lightbox-next').style.display = multi ? '' : 'none';
}

function go(dir) {
  if (images.length < 2) return;
  index = (index + dir + images.length) % images.length;
  renderCurrent();
}

export function openLightbox(imgs, startIndex = 0) {
  images = (imgs && imgs.length) ? imgs : [];
  if (!images.length) return;
  index = Math.max(0, Math.min(startIndex, images.length - 1));
  ensureBuilt();
  renderCurrent();
  overlay.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  if (!overlay) return;
  overlay.classList.remove('active');
  document.body.style.overflow = '';
}

function onKeyDown(e) {
  if (!overlay || !overlay.classList.contains('active')) return;
  if (e.key === 'Escape') closeLightbox();
  else if (e.key === 'ArrowLeft') go(-1);
  else if (e.key === 'ArrowRight') go(1);
}

function onWheel(e) {
  e.preventDefault();
  const delta = -e.deltaY;
  const factor = delta > 0 ? 1.15 : 1 / 1.15;
  scale = Math.max(1, Math.min(5, scale * factor));
  clampPan();
  applyTransform();
}

function onDoubleClick(e) {
  if (scale > 1.001) {
    resetTransform();
  } else {
    scale = 2.5;
    clampPan();
    applyTransform();
  }
}

function distance(pts) {
  const [a, b] = pts;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function onPointerDown(e) {
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  const stage = e.currentTarget;
  stage.setPointerCapture?.(e.pointerId);

  if (pointers.size === 1) {
    // possible double-tap (touch)
    const now = Date.now();
    if (now - lastTapTime < 300) {
      onDoubleClick(e);
      lastTapTime = 0;
    } else {
      lastTapTime = now;
    }
    if (scale > 1.001) {
      dragStart = { x: e.clientX, y: e.clientY };
      dragOrigin = { x: originX, y: originY };
    } else {
      swipeStartX = e.clientX;
      swipeStartY = e.clientY;
    }
  } else if (pointers.size === 2) {
    const pts = Array.from(pointers.values());
    pinchStartDist = distance(pts);
    pinchStartScale = scale;
    dragStart = null;
    swipeStartX = null;
  }
}

function onPointerMove(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pointers.size === 2) {
    const pts = Array.from(pointers.values());
    const dist = distance(pts);
    if (pinchStartDist > 0) {
      scale = Math.max(1, Math.min(5, pinchStartScale * (dist / pinchStartDist)));
      clampPan();
      applyTransform();
    }
  } else if (pointers.size === 1) {
    if (scale > 1.001 && dragStart) {
      originX = dragOrigin.x + (e.clientX - dragStart.x);
      originY = dragOrigin.y + (e.clientY - dragStart.y);
      clampPan();
      applyTransform();
    }
  }
}

function onPointerUp(e) {
  if (pointers.size === 1 && scale <= 1.001 && swipeStartX !== null) {
    const dx = e.clientX - swipeStartX;
    const dy = e.clientY - swipeStartY;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) {
      go(dx > 0 ? -1 : 1);
    }
  }
  pointers.delete(e.pointerId);
  if (pointers.size < 2) pinchStartDist = 0;
  if (pointers.size === 0) {
    dragStart = null;
    swipeStartX = null;
    swipeStartY = null;
  }
}
