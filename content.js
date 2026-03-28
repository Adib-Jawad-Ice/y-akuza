// Y-akuza v5 — Content Script (isolated world)
// Bridges settings → page-context injected.js for player API calls.

(function () {
  'use strict';

  const DEFAULTS = {
    hideShorts:    true,
    hideComments:  true,
    hideSidebar:   true,
    hideMeta:      true,
    hideNav:       true,
    hideEndCards:  true,
    hideLiveChat:  true,
    playbackRate:  1,
    volumeBoost:   100,   // 100–300 (%). 100 = no boost. Uses Web Audio gain node.
    quality:       'hd1080',
    nativeGrid:    false, // false = 4-col (default), true = 3-col
    embedRedirect: false, // Intercept thumbnail clicks → lightweight /embed/ player
  };

  let S = { ...DEFAULTS };

  // ── Page-context bridge ──────────────────────────────────────────────────────

  let bridgeInjected = false;
  function injectBridge() {
    if (bridgeInjected) return;
    bridgeInjected = true;
    const s = document.createElement('script');
    s.src = chrome.runtime.getURL('injected.js');
    s.onload = () => s.remove();
    (document.head || document.documentElement).appendChild(s);
  }

  const toPage = (cmd, payload) =>
    window.postMessage({ __yakuza: true, cmd, payload }, '*');

  // ── CSS: two-tier approach ───────────────────────────────────────────────────
  //
  // STATIC  (#yakuza-static)  — written once at boot, never rebuilt.
  //   Contains: noise suppression, liquid glass theme, GPU hints, row-flattening.
  //   These rules are unconditional and never depend on user settings.
  //
  // DYNAMIC (#yakuza-dynamic) — rebuilt only when settings change.
  //   Contains: feature toggles (hide sidebar, comments, etc.) and grid columns.
  //
  // Splitting the two eliminates the most expensive part of the old approach:
  // the entire CSS string (including the multi-rule liquid glass block) was
  // reconstructed and written to the DOM on every SPA navigation and settings
  // message, forcing a style recalculation for rules that hadn't changed.

  const STATIC_CSS = [
    // Always-hidden noise
    `ytd-merch-shelf-renderer,ytd-ticket-shelf-renderer,ytd-primetime-promo-renderer,` +
    `ytd-mealbar-promo-renderer,ytd-statement-banner-renderer,ytd-banner-promo-renderer,` +
    `ytd-survey-renderer,ytd-horizontal-card-list-renderer,` +
    `.ytp-autonav-toggle-button-container,yt-chip-cloud-renderer,` +
    `#feed-filter-header{display:none!important}`,

    // Ambient mode (GPU canvas waste)
    `ytd-ambient-mode-renderer,.ytp-ambientmode-container,.ytp-ambient-mode{display:none!important}`,

    // Playables section (:has() resolves correctly on the initial HTML payload)
    `ytd-rich-section-renderer:has(a[href^="/playables"]){display:none!important}`,

    // Flatten row wrappers — display:contents removes the box; margin/padding
    // on these elements are spec-ignored, so grid spacing is via gap below.
    `ytd-rich-grid-row,#contents.ytd-rich-grid-row{display:contents!important}`,

    // Suppress ghost flex items inside the grid
    `ytd-rich-grid-renderer #contents>ytd-rich-section-renderer,` +
    `ytd-rich-grid-renderer #contents>ytd-ad-slot-renderer,` +
    `ytd-rich-grid-renderer #contents>ytd-rich-shelf-renderer,` +
    `ytd-rich-grid-row>ytd-rich-section-renderer,` +
    `ytd-rich-grid-row>ytd-ad-slot-renderer,` +
    `ytd-rich-grid-row>ytd-rich-shelf-renderer{display:none!important}`,

    // Kill hover preview before first paint
    `#video-preview,ytd-video-preview,#video-preview-container` +
    `{display:none!important;pointer-events:none!important}`,

    // Instant fullscreen & theater — removes YouTube's 250–400ms transition jank
    `ytd-watch-flexy,#player-container,#player-theater-container,` +
    `#ytd-player,.html5-video-player,.html5-main-video` +
    `{transition-duration:0s!important;transition-delay:0s!important}`,
    `.ytp-fullscreen-backdrop{transition:opacity 0s!important}`,

    // Static player cleanliness
    `.ytp-ce-element,.iv-click-target,.ytp-paid-content-overlay,` +
    `.ytp-cards-button,.ytp-cards-teaser,.iv-branding{display:none!important}`,

    // GPU-accelerate the player area — compositor thread handles paint,
    // main thread stays free.
    `#movie_player,ytd-player,.html5-video-player,video{` +
    `will-change:transform;transform:translateZ(0);` +
    `backface-visibility:hidden;-webkit-backface-visibility:hidden}`,

    // ── Premium Liquid Glass & Bento Box ────────────────────────────────────
    //
    // All blur effects delegate to the platform compositor via backdrop-filter,
    // so there is zero main-thread or layout cost at runtime.
    //
    // Conflict resolutions vs. original snippet:
    //   · ytd-rich-grid-row margin-bottom → replaced by gap on #contents
    //     (margin on display:contents is a spec no-op)
    //   · ytd-rich-item-renderer margin-right → omitted; gap covers column
    //     spacing without inflating the flex-basis width formula
    //   · pointer-events:none on #details — title text is non-clickable
    //     directly, but the thumbnail anchor beneath still routes correctly.

    // 1. Cinematic background
    `html[dark],[dark]{--yt-spec-base-background:#0a0a0c!important}`,
    `ytd-app,#page-manager{` +
    `background:radial-gradient(circle at top right,#1a1a24 0%,#0a0a0c 100%)!important;` +
    `background-attachment:fixed!important}`,

    // 2. Liquid glass masthead — GPU blur via backdrop-filter
    // ::after intentionally excluded: YouTube uses it as a shadow/border element
    // and applying backdrop-filter to it created a visible blurry bar floating
    // over the first video row.
    `#masthead-container{` +
    `background:rgba(10,10,12,0.72)!important;` +
    `backdrop-filter:blur(20px) saturate(180%)!important;` +
    `-webkit-backdrop-filter:blur(20px) saturate(180%)!important;` +
    `border-bottom:1px solid rgba(255,255,255,0.05)!important;` +
    `box-shadow:none!important}`,
    `#masthead-container::after{display:none!important}`,

    // 3. Bento box video cards
    `ytd-rich-grid-media{` +
    `position:relative!important;border-radius:16px!important;overflow:hidden!important;` +
    `background-color:transparent!important;` +
    `box-shadow:0 10px 30px rgba(0,0,0,0.5)!important;` +
    `transition:transform 0.3s cubic-bezier(0.2,0,0,1),box-shadow 0.3s ease!important;` +
    `border:1px solid rgba(255,255,255,0.05)!important}`,

    // Hover: premium pop-out lift
    `ytd-rich-grid-media:hover{` +
    `transform:translateY(-4px) scale(1.02)!important;` +
    `box-shadow:0 14px 40px rgba(0,0,0,0.7)!important;` +
    `border:1px solid rgba(255,255,255,0.15)!important}`,

    // 4. Liquid glass metadata overlay — floats over bottom of the thumbnail
    `ytd-rich-grid-media #details{` +
    `position:absolute!important;bottom:0!important;left:0!important;width:100%!important;` +
    `margin:0!important;padding:30px 16px 16px!important;` +
    `background:linear-gradient(to bottom,` +
      `rgba(0,0,0,0) 0%,rgba(10,10,12,0.7) 30%,rgba(10,10,12,0.95) 100%)!important;` +
    `backdrop-filter:blur(10px) saturate(120%)!important;` +
    `-webkit-backdrop-filter:blur(10px) saturate(120%)!important;` +
    `z-index:10!important;pointer-events:none!important;` +
    `border-top:1px solid rgba(255,255,255,0.03)!important}`,

    // 5. Premium typography
    `ytd-rich-grid-media #video-title{` +
    `color:#fff!important;font-size:1.5rem!important;font-weight:600!important;` +
    `letter-spacing:0.3px!important;text-shadow:0 2px 8px rgba(0,0,0,0.9)!important;` +
    `line-height:1.3!important;margin-bottom:4px!important}`,

    `ytd-rich-grid-media ytd-video-meta-block *{` +
    `color:rgba(255,255,255,0.75)!important;font-size:1.25rem!important;` +
    `text-shadow:0 1px 4px rgba(0,0,0,0.8)!important}`,

    // 6. Hide channel avatar — minimalist card
    `ytd-rich-grid-media #avatar-link{display:none!important}`,

    // 7. content-visibility: auto — browser skips paint + layout for off-screen
    // cards entirely. Most impactful render optimisation on long feeds.
    // 'auto' keyword re-uses the last-known real height after first render;
    // 220px fallback ≈ thumbnail height on a 1440p 4-col grid.
    `ytd-rich-item-renderer{content-visibility:auto;contain-intrinsic-size:auto 220px}`,

    // 8. Kill ALL Polymer/YouTube UI animations — instant interactions everywhere.
    // Placed LAST so it overrides the bento-box transition declarations above.
    // 0.001ms ≈ instant but non-zero, so transitionend events still fire and
    // Polymer state machines that depend on them stay intact.
    `*,*::before,*::after{` +
    `animation-duration:0.001ms!important;animation-delay:0ms!important;` +
    `animation-iteration-count:1!important;` +
    `transition-duration:0.001ms!important;transition-delay:0ms!important}`,
  ].join('\n');

  function buildDynamicCSS() {
    const r = [];

    if (S.hideShorts) r.push(
      `ytd-rich-shelf-renderer[is-shorts],ytd-reel-shelf-renderer,ytd-shorts,` +
      `#shorts-container,[overlay-style="SHORTS"]{display:none!important}`
    );

    if (S.hideNav) r.push(
      `#guide-wrapper,ytd-mini-guide-renderer,#mini-guide{display:none!important}`,
      `ytd-app[guide-persistent-and-visible] #page-manager,` +
      `#page-manager{margin-left:0!important}`
    );

    if (S.hideSidebar) r.push(
      `#secondary,#related,ytd-watch-next-secondary-results-renderer{display:none!important}`,
      `ytd-watch-flexy[flexy_][is-two-columns_] #primary.ytd-watch-flexy` +
        `{max-width:100%!important;width:calc(100% - 24px)!important}` +
      `ytd-watch-flexy #primary{margin-right:0!important}`
    );

    // display:none for zero layout cost. Comments reveal is handled by
    // triggerCommentsReveal() which re-fires YouTube's IntersectionObserver.
    if (S.hideComments) r.push(`ytd-comments,#comments{display:none!important}`);

    if (S.hideMeta) r.push(
      `ytd-watch-metadata,#info,#meta,#secondary-inner #meta,` +
      `ytd-watch-metadata #above-the-fold,ytd-watch-metadata #description,` +
      `ytd-watch-metadata ytd-text-inline-expander,ytd-video-owner-renderer,` +
      `#owner,#top-level-buttons-computed,#actions.ytd-watch-metadata,` +
      `#subscribe-button,ytd-subscribe-button-renderer,#sponsor-button,` +
      `#notification-preference-button,ytd-video-primary-info-renderer,` +
      `ytd-video-secondary-info-renderer,ytd-watch-info-renderer,` +
      `#structured-description,ytd-watch-flexy #meta.ytd-watch-flexy{display:none!important}`
    );

    if (S.hideEndCards) r.push(
      `.ytp-ce-element,.ytp-cards-teaser,.ytp-cards-button,` +
      `#cards-button,.iv-branding{display:none!important}`
    );

    if (S.hideLiveChat) r.push(`#chat,ytd-live-chat-frame{display:none!important}`);

    // Grid layout — CSS custom properties go on the renderer (YouTube reads them
    // there); the flex container and item sizing go on #contents / the item.
    const cols  = S.nativeGrid ? 3 : 4;
    const GAP   = 24; // px — matches bento box column and row gap
    const itemW = `calc((100% - ${(cols - 1) * GAP}px) / ${cols})`;

    r.push(
      `ytd-rich-grid-renderer{` +
      `--ytd-rich-grid-items-per-row:${cols}!important;` +
      `--ytd-rich-grid-slim-items-per-row:${cols}!important}`,

      `ytd-rich-grid-renderer #contents{` +
      `display:flex!important;flex-wrap:wrap!important;align-content:flex-start!important;` +
      `gap:${GAP}px!important;padding:0!important;box-sizing:border-box!important}`,

      `ytd-rich-grid-renderer ytd-rich-item-renderer{` +
      `flex:0 0 ${itemW}!important;width:${itemW}!important;max-width:${itemW}!important;` +
      `margin:0!important;box-sizing:border-box!important}`
    );

    return r.join('\n');
  }

  // Two persistent <style> elements. Kept across SPA navigations.
  let staticEl  = null;
  let dynamicEl = null;

  function ensureStyleEls() {
    const root = document.head || document.documentElement;
    if (!staticEl) {
      staticEl = document.createElement('style');
      staticEl.id = 'yakuza-static';
      staticEl.textContent = STATIC_CSS; // written exactly once
      root.appendChild(staticEl);
    }
    if (!dynamicEl) {
      dynamicEl = document.createElement('style');
      dynamicEl.id = 'yakuza-dynamic';
      root.appendChild(dynamicEl);
    }
  }

  function applyStyles() {
    ensureStyleEls();
    dynamicEl.textContent = buildDynamicCSS();
  }

  // ── Meta hide: inline override for Polymer re-stamps ────────────────────────
  //
  // CSS already hides meta elements when hideMeta is on. This inline pass
  // exists purely to fight Polymer re-stamping elements with inline styles that
  // would otherwise win the specificity battle. Gated to /watch pages only —
  // running querySelectorAll on the home feed is wasteful since those selectors
  // never match there.

  const META_SEL =
    'ytd-watch-metadata,ytd-video-primary-info-renderer,' +
    'ytd-video-secondary-info-renderer,ytd-video-owner-renderer,' +
    'ytd-watch-info-renderer,#info,#meta';

  function applyMetaHide() {
    if (!location.pathname.startsWith('/watch')) return;
    document.querySelectorAll(META_SEL).forEach(el =>
      S.hideMeta
        ? el.style.setProperty('display', 'none', 'important')
        : el.style.removeProperty('display')
    );
  }

  // ── Comments: micro-scroll IO revival ────────────────────────────────────────
  //
  // When ytd-comments transitions from display:none → display:block, YouTube's
  // IntersectionObserver is not re-invoked automatically — its threshold only
  // re-evaluates on a real scroll delta. The four-punch sequence below is the
  // minimum reliable set of steps to make Polymer's lazy-bootstrapper receive
  // isIntersecting=true and begin loading comment data.
  //
  //   1. 100ms delay   — one paint cycle after applyStyles() removes display:none,
  //                       so Polymer can reflow the element into the layout.
  //   2. resize event  — forces the browser to recalculate all IO rootBounds.
  //   3. scroll event  — re-queues scroll-gated IO callbacks deferred while hidden.
  //   4. scrollBy(0,1) → scrollBy(0,-1)
  //                     — the physical micro-scroll (imperceptible) that creates
  //                       a real scroll delta, the only reliable IO trigger.
  //
  // Called only on the hidden→visible transition; never on page load.

  function triggerCommentsReveal() {
    setTimeout(() => {
      window.dispatchEvent(new Event('resize'));
      window.dispatchEvent(new Event('scroll'));
      window.scrollBy(0, 1);
      window.scrollBy(0, -1);
    }, 100);
  }

  // ── Shorts ───────────────────────────────────────────────────────────────────

  function redirectShorts() {
    if (!S.hideShorts || !location.pathname.startsWith('/shorts/')) return;
    const id = location.pathname.split('/shorts/')[1]?.split(/[/?]/)[0];
    location.replace(id
      ? `https://www.youtube.com/watch?v=${id}`
      : 'https://www.youtube.com/'
    );
  }

  // Single compound selector — one querySelectorAll instead of three.
  const SHORTS_SEL =
    'ytd-rich-shelf-renderer,ytd-guide-entry-renderer,ytd-mini-guide-entry-renderer';

  function cleanShorts() {
    if (!S.hideShorts) return;
    document.querySelectorAll(SHORTS_SEL).forEach(el => {
      if (
        el.hasAttribute('is-shorts') ||
        el.querySelector('a[href^="/shorts"]') ||
        el.querySelector('yt-formatted-string')?.textContent?.trim().toLowerCase() === 'shorts'
      ) el.style.setProperty('display', 'none', 'important');
    });
  }

  // ── Video: speed & volume ────────────────────────────────────────────────────

  // WeakSet instead of el._yp — avoids leaking properties onto DOM nodes and
  // allows GC to collect detached video elements normally.
  const patchedVideos = new WeakSet();

  function patchVideo(video) {
    if (patchedVideos.has(video)) return;
    patchedVideos.add(video);
    const guard = () => {
      if (S.playbackRate !== 1 && video.playbackRate !== S.playbackRate)
        video.playbackRate = S.playbackRate;
    };
    video.addEventListener('ratechange', guard, { passive: true });
    video.addEventListener('loadstart',  guard, { passive: true });
    video.addEventListener('canplay',    guard, { passive: true });
    if (S.playbackRate !== 1) video.playbackRate = S.playbackRate;
  }

  function applySpeed(rate) {
    document.querySelectorAll('video').forEach(v => { v.playbackRate = rate; });
    toPage('SET_SPEED', rate);
  }

  function applyVolumeBoost(boost) {
    const gain = boost / 100;
    document.querySelectorAll('video').forEach(video => {
      if (video._yakuzaGain) {
        video._yakuzaGain.gain.value = gain;
        if (video._yakuzaCtx?.state === 'suspended') video._yakuzaCtx.resume().catch(() => {});
        return;
      }
      if (boost <= 100) return;
      try {
        const ctx      = new AudioContext();
        const gainNode = ctx.createGain();
        gainNode.gain.value = gain;
        ctx.createMediaElementSource(video).connect(gainNode).connect(ctx.destination);
        video._yakuzaCtx  = ctx;
        video._yakuzaGain = gainNode;
        ctx.resume().catch(() => {});
      } catch (_) {}
    });
  }

  // ── Embed interceptor ────────────────────────────────────────────────────────

  const THUMB_SEL   = 'a#thumbnail,a.ytd-thumbnail';
  const PASSTHROUGH = /^\/((@|channel\/|c\/|user\/)|playlist\?|post\/|shorts\/)/;

  function extractVideoId(href) {
    try {
      const url = new URL(href, location.origin);
      if (url.hostname && !url.hostname.endsWith('youtube.com')) return null;
      if (url.pathname !== '/watch') return null;
      const v = url.searchParams.get('v');
      return v && /^[A-Za-z0-9_-]{11}$/.test(v) ? v : null;
    } catch { return null; }
  }

  function onThumbnailClick(e) {
    if (!S.embedRedirect) return;
    const anchor = e.target.closest(THUMB_SEL);
    if (!anchor) return;
    const href = anchor.getAttribute('href') || '';
    if (PASSTHROUGH.test(href)) return;
    const id = extractVideoId(href);
    if (!id) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    location.href = `https://www.youtube.com/embed/${id}?autoplay=1&rel=0`;
  }

  let embedListenerActive = false;
  function applyEmbedRedirect() {
    const want = !!S.embedRedirect;
    if (want === embedListenerActive) return;
    document[want ? 'addEventListener' : 'removeEventListener']('click', onThumbnailClick, true);
    embedListenerActive = want;
  }

  // ── DNS preconnect injector ───────────────────────────────────────────────────
  // Warms up TCP+TLS connections to the thumbnail and channel-art CDNs before
  // the first image request fires. Called once at boot and after SPA navigations
  // so new page contexts get the connections too. Idempotent: skips if already
  // present in <head>.

  function injectPreconnects() {
    const h = document.head || document.documentElement;
    [
      'https://i.ytimg.com',   // thumbnail images
      'https://yt3.ggpht.com', // channel art / avatars
    ].forEach(origin => {
      if (h.querySelector(`link[rel="preconnect"][href="${origin}"]`)) return;
      const pc = document.createElement('link');
      pc.rel = 'preconnect'; pc.href = origin; pc.crossOrigin = 'anonymous';
      h.appendChild(pc);
      const dns = document.createElement('link');
      dns.rel = 'dns-prefetch'; dns.href = origin; // fallback for older engines
      h.appendChild(dns);
    });
  }

  // ── Predictive hover-prefetcher ──────────────────────────────────────────────
  // Pre-connects to video pages before the user clicks, eliminating DNS+TCP+TLS
  // latency. Event-delegated so it covers Polymer-injected thumbnails too.
  //
  // Set is capped at PREFETCH_CAP entries to prevent unbounded memory growth on
  // long sessions; it rolls over by clearing (not evicting) since all entries by
  // that point are either visited or stale.

  const prefetchedURLs = new Set();
  const PREFETCH_CAP   = 200;
  let   prefetchTimer  = null;

  // Speculation Rules API (Chrome 109+): full speculative prerender — page
  // is parsed, resources fetched, and JS executed in a hidden BrowsingContext
  // before the click. Falls back to <link rel=prefetch> on older engines.
  let speculationEl = null;
  function speculativePrefetch(href) {
    if (prefetchedURLs.size >= PREFETCH_CAP) prefetchedURLs.clear();
    prefetchedURLs.add(href);

    if ('HTMLScriptElement' in window && document.createElement('script').type !== undefined) {
      try {
        if (!speculationEl) {
          speculationEl = document.createElement('script');
          speculationEl.type = 'speculationrules';
          speculationEl.id   = 'yakuza-speculation';
          (document.head || document.documentElement).appendChild(speculationEl);
        }
        const existing = JSON.parse(speculationEl.textContent || '{}');
        const urls = (existing.prefetch?.[0]?.urls ?? []);
        if (!urls.includes(href)) {
          urls.push(href);
          speculationEl.textContent = JSON.stringify({
            prefetch: [{ source: 'list', eagerness: 'moderate', urls }]
          });
        }
        return;
      } catch (_) {}
    }
    // Fallback: <link rel=prefetch>
    const link = document.createElement('link');
    link.rel  = 'prefetch';
    link.as   = 'document';
    link.href = href;
    (document.head || document.documentElement).appendChild(link);
  }

  document.addEventListener('mouseover', e => {
    const anchor = e.target.closest?.(THUMB_SEL);
    if (!anchor) return;
    const href = anchor.href;
    if (!href || prefetchedURLs.has(href)) return;
    clearTimeout(prefetchTimer);
    prefetchTimer = setTimeout(() => {
      if (prefetchedURLs.has(href)) return;
      speculativePrefetch(href);
    }, 100); // tightened from 150ms → 100ms
  }, { passive: true });

  document.addEventListener('mouseout', e => {
    if (e.target.closest?.(THUMB_SEL)) clearTimeout(prefetchTimer);
  }, { passive: true });

  // ── Look-ahead scroll preloader ──────────────────────────────────────────────
  // Eagerly loads the next 24 off-screen thumbnails before the user scrolls to
  // them, scanning a 2-viewport window below the fold. Runs inside
  // requestIdleCallback so it never competes with scroll or paint work.
  //
  // decoding='async' moves JPEG decode off the main thread to the image decoder
  // thread. fetchPriority='low' lets critical resources go first over the wire.
  //
  // We iterate with a counter (not Array.from slice) to avoid allocating a
  // temporary array over the full NodeList on every scroll event.

  let preloadScheduled = false;

  function runLookAhead() {
    preloadScheduled = false;
    const vh      = window.innerHeight;
    const ceiling = vh * 3; // scan from 1 to 3 viewport-heights from top = 2vh below fold
    let count = 0;
    document.querySelectorAll('yt-image img,img[loading="lazy"]').forEach(img => {
      if (count >= 24) return;
      const top = img.getBoundingClientRect().top;
      if (top <= vh || top > ceiling) return; // only the 2-viewport band below fold
      count++;
      img.loading  = 'eager';
      img.decoding = 'async';
      if ('fetchPriority' in img) img.fetchPriority = 'low';
      const lazySrc = img.dataset.src || img.getAttribute('data-thumb');
      if (lazySrc && !img.src) img.src = lazySrc;
    });
  }

  function scheduleLookAhead() {
    if (preloadScheduled) return;
    preloadScheduled = true;
    if (window.requestIdleCallback) {
      requestIdleCallback(runLookAhead, { timeout: 80 });
    } else {
      setTimeout(runLookAhead, 80);
    }
  }

  window.addEventListener('scroll', scheduleLookAhead, { passive: true });

  // ── MutationObserver (rAF-debounced) ─────────────────────────────────────────
  // At most one batch per frame regardless of mutation volume.
  // Each callback is gated by its feature flag — no DOM work when the feature
  // is disabled.

  let rafPending = false;
  new MutationObserver(() => {
    if (rafPending) return;
    rafPending = true;
    requestAnimationFrame(() => {
      rafPending = false;
      if (S.hideShorts) cleanShorts();
      if (S.hideMeta)   applyMetaHide();
      document.querySelectorAll('video').forEach(patchVideo);
    });
  }).observe(document.documentElement, { childList: true, subtree: true });

  // ── SPA navigation ────────────────────────────────────────────────────────────

  document.addEventListener('yt-navigate-finish', () => {
    redirectShorts();
    applyStyles();
    injectPreconnects();
    window.dispatchEvent(new Event('resize'));
    applyMetaHide();
    scheduleLookAhead();
    setTimeout(() => applySpeed(S.playbackRate), 400);
  });

  document.addEventListener('yt-page-data-updated', () => {
    if (S.hideShorts) cleanShorts();
    if (S.hideMeta)   applyMetaHide();
  });

  // ── Settings from popup ───────────────────────────────────────────────────────

  chrome.runtime.onMessage.addListener(msg => {
    if (msg.type !== 'SETTINGS_CHANGED') return;
    const prev = S;
    S = { ...S, ...msg.payload };

    applyStyles();
    window.dispatchEvent(new Event('resize'));
    applyMetaHide();
    if (S.hideShorts) cleanShorts();

    if ('playbackRate'  in msg.payload) applySpeed(S.playbackRate);
    if ('volumeBoost'   in msg.payload) applyVolumeBoost(S.volumeBoost);
    if ('quality'       in msg.payload) toPage('SET_QUALITY', S.quality);
    if ('hideShorts'    in msg.payload) redirectShorts();
    if ('embedRedirect' in msg.payload) applyEmbedRedirect();

    // Comments toggled OFF (hidden → visible): applyStyles() has already removed
    // the display:none rule. triggerCommentsReveal() re-fires the IO 100ms later
    // once Polymer has reflowed the element back into the layout.
    if ('hideComments' in msg.payload && !S.hideComments && prev.hideComments) {
      triggerCommentsReveal();
    }
  });

  // ── Apply all ─────────────────────────────────────────────────────────────────

  function applyAll() {
    applyStyles();
    applyMetaHide();
    cleanShorts();
    redirectShorts();
    applySpeed(S.playbackRate);
    applyVolumeBoost(S.volumeBoost);
    applyEmbedRedirect();
    toPage('SET_QUALITY', S.quality);
    scheduleLookAhead();
  }

  // ── Boot ──────────────────────────────────────────────────────────────────────
  // applyStyles() fires synchronously before chrome.storage resolves, injecting
  // DEFAULTS as both static and dynamic CSS before the first browser paint.
  // This suppresses Shorts, sidebar, end-cards, and live chat with zero flicker.

  injectBridge();
  injectPreconnects();
  applyStyles(); // AGGRESSIVE INIT — must remain the first DOM operation

  chrome.storage.sync.get(DEFAULTS, saved => {
    S = { ...DEFAULTS, ...saved };
    applyAll();
    document.querySelectorAll('video').forEach(patchVideo);
  });

})();
