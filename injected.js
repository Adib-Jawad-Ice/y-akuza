// Y-akuza v5 — Page Context Bridge
// Runs in PAGE context to access YouTube's player API.

(function () {
  'use strict';

  const QUALITY_RANK = ['highres','hd2160','hd1440','hd1080','hd720','large','medium','small','tiny','auto'];

  let lastQuality     = 'hd1080';
  let lastSpeed       = 1;
  let lastLoop        = false;
  let lastVolumeBoost = 1.0;
  let lastScrollWheel = true;
  let audioOnlyMode   = false;

  // WeakMap ensures gain entries are GC'd when video elements are removed.
  const gainNodes = new WeakMap();

  const getPlayer = () => document.getElementById('movie_player');
  const eachVideo = fn => document.querySelectorAll('video').forEach(fn);

  // Retries fn() up to maxTries times at interval ms until it returns truthy.
  function retryUntil(fn, maxTries, interval) {
    let n = 0;
    const attempt = () => { if (!fn() && n++ < maxTries) setTimeout(attempt, interval); };
    attempt();
  }

  // ── Audio-only mode ───────────────────────────────────────────────────────────
  // Hides the video element visually while keeping audio playing.
  // Uses visibility:hidden (not display:none) so the element stays in layout
  // and keeps its audio pipeline alive.

  const AUDIO_STYLE_ID = 'yakuza-audio-only';

  function setAudioOnly(enabled) {
    audioOnlyMode = enabled;
    let el = document.getElementById(AUDIO_STYLE_ID);
    if (enabled) {
      if (!el) {
        el = document.createElement('style');
        el.id = AUDIO_STYLE_ID;
        (document.head ?? document.documentElement).appendChild(el);
      }
      el.textContent = [
        '.html5-main-video { visibility: hidden !important; }',
        '.ytp-cued-thumbnail-overlay { display: none !important; }',
        /* Keep the player chrome visible so controls still work */
      ].join('\n');
    } else {
      el?.remove();
    }
  }

  // ── Shared AudioContext ───────────────────────────────────────────────────────
  // One context for the whole page — browsers cap simultaneous instances (~6).
  // Created lazily so autoplay policy is already satisfied by the time it's needed.

  let _ctx = null;
  function getAudioCtx() {
    if (_ctx) return _ctx;
    _ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (_ctx.state === 'suspended')
      document.addEventListener('click', () => _ctx.resume(), { once: true });
    return _ctx;
  }

  // ── Volume boost ──────────────────────────────────────────────────────────────
  // Chain: MediaElementSource → GainNode → DynamicsCompressor → destination.
  // The compressor prevents harsh clipping above 1.0 gain with a soft 3:1 knee
  // that is transparent at normal levels (only engages within 3 dBFS of ceiling).

  function setupVideoGain(video, level) {
    if (gainNodes.has(video)) {
      gainNodes.get(video).gain.value = level;
      return;
    }
    // Don't wire a graph at unity gain — MediaElementSource is a one-way connection.
    if (level <= 1.0) return;
    try {
      const ctx  = getAudioCtx();
      const gain = ctx.createGain();
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -3;
      comp.knee.value      =  6;
      comp.ratio.value     =  3;
      comp.attack.value    =  0.003;
      comp.release.value   =  0.15;
      gain.gain.value = level;
      ctx.createMediaElementSource(video).connect(gain).connect(comp).connect(ctx.destination);
      gainNodes.set(video, gain);
    } catch (_) {}
  }

  const applyVolumeBoost = level => {
    lastVolumeBoost = level;
    eachVideo(v => setupVideoGain(v, level));
  };

  // ── Quality ───────────────────────────────────────────────────────────────────

  function forceQuality(target) {
    const p = getPlayer();
    if (!p?.getAvailableQualityLevels) return false;
    const available = p.getAvailableQualityLevels();
    if (!available?.length) return false;

    // 'audio' is handled upstream — here we just force the lowest available quality.
    const resolvedTarget = target === 'audio' ? 'tiny' : target;

    const chosen = resolvedTarget === 'auto'
      ? 'auto'
      : (QUALITY_RANK.slice(QUALITY_RANK.indexOf(resolvedTarget)).find(q => available.includes(q)) ?? available[available.length - 1]);

    p.setPlaybackQualityRange?.(chosen, chosen);
    p.setPlaybackQuality?.(chosen);

    if (resolvedTarget !== 'auto') {
      try {
        window.ytcfg?.set('QUALITY_FLOOR',   chosen);
        window.ytcfg?.set('QUALITY_CEILING',  chosen);
      } catch (_) {}
    }
    return true;
  }

  // ── Speed ─────────────────────────────────────────────────────────────────────

  function forceSpeed(rate) {
    eachVideo(v => { v.playbackRate = rate; });
    try { getPlayer()?.setPlaybackRate?.(rate); } catch (_) {}
  }

  // ── Quality change listener ───────────────────────────────────────────────────

  let qualityListenerAttached = false;
  function attachQualityListener() {
    if (qualityListenerAttached) return;
    const p = getPlayer();
    if (!p || typeof p.addEventListener !== 'function') return;
    try {
      p.addEventListener('onPlaybackQualityChange', () => {
        if (lastQuality !== 'auto') setTimeout(() => forceQuality(lastQuality), 50);
      });
      qualityListenerAttached = true;
    } catch (_) {}
  }

  // ── Scroll-wheel volume on player ─────────────────────────────────────────────
  // Capture-phase so it fires before YouTube's own handlers.
  // Skips menus/overlays and only intercepts events physically over the player.

  function setupScrollWheel(enabled) {
    if (window.__yakScrollHandler) {
      document.removeEventListener('wheel', window.__yakScrollHandler, true);
      window.__yakScrollHandler = null;
    }
    if (!enabled) return;
    window.__yakScrollHandler = e => {
      if (e.target.closest?.('.ytp-settings-menu,.ytp-panel,.ytp-contextmenu')) return;
      const p = getPlayer();
      if (!p) return;
      const { left, right, top, bottom } = p.getBoundingClientRect();
      if (e.clientX < left || e.clientX > right || e.clientY < top || e.clientY > bottom) return;
      e.preventDefault();
      e.stopPropagation();
      p.setVolume?.(Math.max(0, Math.min(100, (p.getVolume?.() ?? 100) + (e.deltaY < 0 ? 5 : -5))));
    };
    document.addEventListener('wheel', window.__yakScrollHandler, { passive: false, capture: true });
  }

  // ── Re-apply all settings ────────────────────────────────────────────────────

  function reapplyAll() {
    qualityListenerAttached = false;
    attachQualityListener();
    if (lastQuality !== 'auto') retryUntil(() => forceQuality(lastQuality), 10, 400);
    forceSpeed(lastSpeed);
    applyVolumeBoost(lastVolumeBoost);
    eachVideo(v => { v.loop = lastLoop; });
    setupScrollWheel(lastScrollWheel);
    // Re-apply audio-only mode after navigation (style may have been wiped).
    setAudioOnly(audioOnlyMode);
  }

  // ── Message handler ───────────────────────────────────────────────────────────

  window.addEventListener('message', e => {
    if (e.data?.__yakuza !== true) return;
    const { cmd, payload } = e.data;
    switch (cmd) {
      case 'SET_QUALITY':
        lastQuality = payload;
        if (payload === 'audio') {
          // Audio-only: hide video element, force lowest quality to save bandwidth.
          setAudioOnly(true);
          retryUntil(() => forceQuality('tiny'), 12, 300);
        } else {
          // Restore video visibility when switching away from audio-only.
          setAudioOnly(false);
          retryUntil(() => forceQuality(payload), 12, 300);
        }
        break;
      case 'SET_SPEED':
        lastSpeed = payload;
        forceSpeed(payload);
        break;
      case 'SET_LOOP':
        lastLoop = payload;
        eachVideo(v => { v.loop = payload; });
        break;
      case 'SET_VOLUME_BOOST':
        applyVolumeBoost(payload);
        break;
      case 'SET_SCROLL_WHEEL':
        lastScrollWheel = payload;
        setupScrollWheel(payload);
        break;
      case 'PATCH_VIDEO':
        eachVideo(v => { v.loop = lastLoop; setupVideoGain(v, payload); });
        break;
    }
  });

  // ── Navigation ────────────────────────────────────────────────────────────────

  document.addEventListener('yt-player-updated', reapplyAll);

  document.addEventListener('yt-navigate-finish', () => {
    setTimeout(reapplyAll, 800);
    // Second quality pass for slow-loading streams.
    if (lastQuality !== 'auto')
      setTimeout(() => forceQuality(lastQuality), 2500);
  });

  // ── Boot ──────────────────────────────────────────────────────────────────────

  setupScrollWheel(lastScrollWheel);
  window.__yakuzaBridgeReady = true;
})();
