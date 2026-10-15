// Admin → Banners → Landing Video: upload an HD desktop video and an
// optional portrait phone video for the homepage hero.
import { requireAdmin } from "./admin-auth.js";
import { cloudinaryConfig } from "../../js/config.js";
import { getHeroSettings, saveHeroSettings } from "../../js/hero-store.js";

const DEFAULT_VIDEO = 'https://res.cloudinary.com/lfgnusmd/video/upload/v1790062572/Sandragon_Landing_video_processed_processed_b5tz5x.mp4';
let hero = { videoUrl: '', mobileVideoUrl: '' };
const status = document.getElementById('heroSaveStatus');

requireAdmin(async () => {
  try { hero = await getHeroSettings(); } catch { /* keep defaults */ }
  render();
});

function previewHtml(url, label) {
  if (!url) return `<div class="banner-slot-empty"><i class="fas fa-film"></i><span>${label}</span></div>`;
  return `<video src="${url}" muted loop playsinline autoplay preload="metadata"></video>`;
}

function render() {
  document.getElementById('heroDesktopPreview').innerHTML = previewHtml(hero.videoUrl || DEFAULT_VIDEO, '');
  document.getElementById('heroMobilePreview').innerHTML = previewHtml(hero.mobileVideoUrl, 'No phone video: phones use the desktop video');
  // Show the uploaded file's real resolution so it's obvious whether it's HD.
  document.querySelectorAll('.hero-preview video').forEach(v => {
    v.addEventListener('loadedmetadata', () => {
      const tag = document.createElement('span');
      const hd = Math.min(v.videoWidth, v.videoHeight) >= 1080;
      tag.className = `hero-res ${hd ? 'ok' : 'low'}`;
      tag.textContent = `${v.videoWidth} × ${v.videoHeight}${hd ? ' · HD' : ' · below 1080p'}`;
      v.parentElement.appendChild(tag);
    }, { once: true });
  });
}

function upload(field) {
  const widget = cloudinary.createUploadWidget({
    cloudName: cloudinaryConfig.cloudName,
    uploadPreset: cloudinaryConfig.uploadPreset,
    resourceType: 'video',
    clientAllowedFormats: ['mp4', 'mov', 'webm', 'm4v'],
    maxFileSize: 100000000,
    multiple: false,
    sources: ['local', 'url']
  }, (error, result) => {
    if (error) { console.error(error); status.textContent = 'Upload failed. Check that your Cloudinary upload preset allows videos.'; status.style.color = 'var(--danger)'; return; }
    if (result.event === 'success') {
      hero = { ...hero, [field]: result.info.secure_url };
      render();
      status.textContent = `Uploaded (${result.info.width} × ${result.info.height}). Click "Save Video" to publish.`;
      status.style.color = '';
    }
  });
  widget.open();
}

document.getElementById('uploadHeroDesktopBtn').addEventListener('click', () => upload('videoUrl'));
document.getElementById('uploadHeroMobileBtn').addEventListener('click', () => upload('mobileVideoUrl'));
document.getElementById('resetHeroDesktopBtn').addEventListener('click', () => { hero.videoUrl = ''; render(); });
document.getElementById('resetHeroMobileBtn').addEventListener('click', () => { hero.mobileVideoUrl = ''; render(); });

document.getElementById('saveHeroBtn').addEventListener('click', async () => {
  const btn = document.getElementById('saveHeroBtn');
  btn.disabled = true;
  try {
    await saveHeroSettings(hero);
    status.textContent = 'Saved! The homepage now uses this video.';
    status.style.color = 'var(--success)';
  } catch (err) {
    console.error(err);
    status.textContent = 'Could not save. Check console for details.';
    status.style.color = 'var(--danger)';
  } finally {
    btn.disabled = false;
  }
});
