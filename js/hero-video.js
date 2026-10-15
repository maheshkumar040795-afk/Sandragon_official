/* SANDRAGON — landing page hero video, served in the best quality the
   screen can use.

   - Picks the video set in Admin → Banners → Landing Video (remembered from
     the last visit so there is no wait), or the built-in brand video.
   - Asks Cloudinary for a copy sized to the screen (1280 / 1920 / 2560 /
     3840 px wide, never larger than the original) at its highest automatic
     quality ("q_auto:best") in the best format the browser plays (f_auto:
     AV1 / VP9 / H.265 / H.264). A phone gets the optional portrait video.
   - The untouched original is always listed as a second source, so if
     Cloudinary can't make the sized copy the browser plays the original.

   Note: this can only be as sharp as the uploaded file. For true HD,
   upload a 1080p or 4K export in Admin → Banners → Landing Video. */
(function () {
  var DEFAULT_VIDEO = 'https://res.cloudinary.com/lfgnusmd/video/upload/v1790062572/Sandragon_Landing_video_processed_processed_b5tz5x.mp4';
  var CACHE_KEY = 'sd_cache_v1:hero';
  var CLD_VIDEO = /^(https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(.+)$/;

  function transformed(url, width) {
    var m = url && url.match(CLD_VIDEO);
    if (!m) return null;
    if (/^[a-z]{1,3}_[^/]*\//.test(m[2])) return null; // already has its own transformation
    return m[1] + 'f_auto,q_auto:best,c_limit,w_' + width + '/' + m[2];
  }

  function poster(url, width) {
    var m = url && url.match(CLD_VIDEO);
    if (!m || /^[a-z]{1,3}_[^/]*\//.test(m[2])) return '';
    return m[1] + 'so_0,f_auto,q_auto:best,c_limit,w_' + width + '/' + m[2].replace(/\.[a-z0-9]+$/i, '') + '.jpg';
  }

  // Width the video is actually drawn at, in real device pixels, rounded up
  // to a standard size. The hero crops the video to fill the box
  // (object-fit: cover), so on a narrow phone a landscape video is drawn
  // much wider than the screen; that width is what has to stay sharp.
  function targetWidth(isPhoneVideo, video) {
    var dpr = Math.min(window.devicePixelRatio || 1, 3);
    var box = (video && video.parentElement) ? video.parentElement.getBoundingClientRect() : null;
    var w = box && box.width ? box.width : window.innerWidth;
    var h = box && box.height ? box.height : window.innerHeight;
    var ratio = isPhoneVideo ? 9 / 16 : 16 / 9;
    var drawnWidth = Math.max(w, h * ratio);
    var need = drawnWidth * dpr;
    var tiers = [720, 1080, 1280, 1920, 2560, 3840];
    for (var i = 0; i < tiers.length; i++) if (tiers[i] >= need) return tiers[i];
    return 3840;
  }

  function readCached() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      return raw ? (JSON.parse(raw).v || null) : null;
    } catch (e) { return null; }
  }

  function choose(cfg) {
    cfg = cfg || {};
    var portraitPhone = window.matchMedia('(max-width: 700px) and (orientation: portrait)').matches;
    if (portraitPhone && cfg.mobileVideoUrl) return { url: cfg.mobileVideoUrl, phone: true };
    return { url: cfg.videoUrl || DEFAULT_VIDEO, phone: false };
  }

  var applied = '';

  function apply(cfg) {
    var video = document.querySelector('.hero-video');
    if (!video) return;
    var pick = choose(cfg);
    var width = targetWidth(pick.phone, video);
    var key = pick.url + '|' + width;
    if (key === applied) return;
    applied = key;

    var sources = [];
    var best = transformed(pick.url, width);
    if (best) sources.push(best);
    sources.push(pick.url);

    var p = poster(pick.url, Math.min(width, 1920));
    if (p) video.setAttribute('poster', p);
    video.innerHTML = sources.map(function (s) { return '<source src="' + s.replace(/"/g, '&quot;') + '">'; }).join('');
    video.load();
    var play = video.play();
    if (play && play.catch) play.catch(function () { /* autoplay blocked: poster stays */ });
  }

  window.__sdHeroVideo = { apply: apply, DEFAULT_VIDEO: DEFAULT_VIDEO };
  apply(readCached());
})();
