import { requireAdmin, setupLogoutButton } from "./admin-auth.js";
import { cloudinaryConfig } from "../../js/config.js";
import { getBannerSlides, saveBannerSlides, MAX_SLIDES } from "../../js/banner-store.js";

requireAdmin(() => loadSlides());
setupLogoutButton();

const slotsEl = document.getElementById('bannerSlots');
let slides = [];

async function loadSlides() {
  const loaded = await getBannerSlides();
  // Always work with exactly MAX_SLIDES entries (padding with empties) so
  // every slot has something to render, filled or not.
  slides = Array.from({ length: MAX_SLIDES }, (_, i) => loaded[i] || { url: '', mobileUrl: '', link: '' });
  render();
}

function render() {
  slotsEl.innerHTML = slides.map((s, i) => `
    <div class="banner-slot" data-i="${i}">
      <div class="banner-slot-preview" data-i="${i}">
        ${s.url
          ? `<img src="${s.url}"><button type="button" class="banner-slot-remove" data-remove="${i}" title="Remove"><i class="fas fa-times"></i></button>`
          : `<div class="banner-slot-empty"><i class="fas fa-image"></i><span>Slide ${i + 1}</span></div>`
        }
      </div>
      <button type="button" class="btn small outline mt-10" data-upload="${i}">
        <i class="fas fa-upload"></i> ${s.url ? 'Replace Image' : 'Upload Image'}
      </button>

      <div class="banner-mobile-row mt-10">
        <div class="banner-mobile-preview">
          ${s.mobileUrl
            ? `<img src="${s.mobileUrl}"><button type="button" class="banner-slot-remove small" data-remove-mobile="${i}" title="Remove"><i class="fas fa-times"></i></button>`
            : `<div class="banner-slot-empty small"><i class="fas fa-mobile-screen"></i></div>`
          }
        </div>
        <button type="button" class="btn small outline" data-upload-mobile="${i}">
          <i class="fas fa-upload"></i> ${s.mobileUrl ? 'Replace' : 'Add'} Mobile Crop
        </button>
      </div>
      <p class="stock-note" style="margin-top:6px">Optional: a purpose-cropped version shown only on phones. Without one, the same image is shown in full (letterboxed) on mobile.</p>

      <div class="form-group mt-10">
        <label>Link when tapped (optional)</label>
        <input type="text" data-link="${i}" placeholder="e.g. index.html?category=bats" value="${s.link || ''}">
      </div>
    </div>
  `).join('');

  slotsEl.querySelectorAll('[data-upload]').forEach(btn => {
    btn.addEventListener('click', () => openUploadWidget(+btn.dataset.upload, 'url'));
  });
  slotsEl.querySelectorAll('[data-upload-mobile]').forEach(btn => {
    btn.addEventListener('click', () => openUploadWidget(+btn.dataset.uploadMobile, 'mobileUrl'));
  });
  slotsEl.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const i = +btn.dataset.remove;
      slides[i] = { ...slides[i], url: '' };
      render();
    });
  });
  slotsEl.querySelectorAll('[data-remove-mobile]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const i = +btn.dataset.removeMobile;
      slides[i] = { ...slides[i], mobileUrl: '' };
      render();
    });
  });
  slotsEl.querySelectorAll('[data-link]').forEach(input => {
    input.addEventListener('input', () => {
      slides[+input.dataset.link].link = input.value.trim();
    });
  });
}

function openUploadWidget(index, field) {
  if (cloudinaryConfig.cloudName === 'YOUR_CLOUDINARY_CLOUD_NAME') {
    alert('Set your Cloudinary cloud name + upload preset in js/config.js first.');
    return;
  }
  const widget = cloudinary.createUploadWidget({
    cloudName: cloudinaryConfig.cloudName,
    uploadPreset: cloudinaryConfig.uploadPreset,
    multiple: false,
    sources: ['local', 'camera', 'url']
  }, (error, result) => {
    if (!error && result.event === 'success') {
      slides[index] = { ...slides[index], [field]: result.info.secure_url };
      render();
    }
  });
  widget.open();
}

document.getElementById('saveBannersBtn').addEventListener('click', async () => {
  const btn = document.getElementById('saveBannersBtn');
  btn.disabled = true;
  btn.innerHTML = 'Saving...';
  try {
    await saveBannerSlides(slides);
    alert('Banners saved! They\'ll appear on the storefront right away.');
  } catch (err) {
    console.error(err);
    alert(`Could not save banners: ${err.message || err}\n\nIf this says "permission" or "insufficient", the Firestore rules on your live Firebase project need updating — see firestore.rules in the project files.`);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> Save Banners';
  }
});
