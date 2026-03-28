// Y-akuza v5 — Popup

const DEFAULTS = {
  hideComments: true, hideSidebar:  true, hideMeta:     true,
  hideEndCards: true, hideLiveChat: true, hideNav:      true,
  hideShorts:   true,
  playbackRate: 1, volumeBoost: 100, quality: 'hd1080', nativeGrid: false,
};

// ── Tab switching ──────────────────────────────────────────────────────────────

let activeTab   = document.querySelector('.tab-btn.active');
let activePanel = document.querySelector('.panel.active');

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    activeTab?.classList.remove('active');
    activePanel?.classList.remove('active');
    btn.classList.add('active');
    const panel = document.getElementById(`panel-${btn.dataset.tab}`);
    panel.classList.add('active');
    activeTab   = btn;
    activePanel = panel;
  });
});

// ── Sliders ────────────────────────────────────────────────────────────────────

function makeSlider(sliderId, fillId, valId, min, max, format, saveKey) {
  const slider = document.getElementById(sliderId);
  const fill   = document.getElementById(fillId);
  const val    = document.getElementById(valId);
  const pct    = v => ((v - min) / (max - min) * 100).toFixed(2) + '%';
  const update = v => { fill.style.width = pct(v); val.textContent = format(v); };
  slider.addEventListener('input',  () => update(+slider.value));
  slider.addEventListener('change', () => save(saveKey, +slider.value));
  return { slider, update };
}

const { slider: speedSlider, update: updateSpeedUI } = makeSlider(
  'speedSlider', 'speedFill', 'speedVal', 0.25, 4,
  v => { const n = +v; return (Number.isInteger(n) ? n : +n.toFixed(2)) + '×'; },
  'playbackRate'
);

const { slider: volumeSlider, update: updateVolumeUI } = makeSlider(
  'volumeSlider', 'volumeFill', 'volumeVal', 100, 300,
  v => { const n = v / 100; return (Number.isInteger(n) ? n : +n.toFixed(1)) + '×'; },
  'volumeBoost'
);

// ── Quality pills ──────────────────────────────────────────────────────────────

let activeQPill = null;
document.querySelectorAll('.q-pill').forEach(pill => {
  pill.addEventListener('click', () => {
    activeQPill?.classList.remove('active');
    pill.classList.add('active');
    activeQPill = pill;
    save('quality', pill.dataset.q);
  });
});

// ── Grid column selector ───────────────────────────────────────────────────────

let activeGridBtn = null;
document.querySelectorAll('.grid-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    activeGridBtn?.classList.remove('active');
    btn.classList.add('active');
    activeGridBtn = btn;
    save('nativeGrid', btn.dataset.grid === '3');
  });
});

// ── Interface element icon-toggles ─────────────────────────────────────────────
// Active (lit accent) means the element IS being hidden.

document.querySelectorAll('.if-btn[data-key]').forEach(btn => {
  btn.addEventListener('click', () => {
    const isActive = btn.classList.toggle('active');
    save(btn.dataset.key, isActive);
  });
});

// ── Tooltip — anchored above the triggering element ────────────────────────────
// Does NOT chase the cursor. Appears centered above the hovered element and
// animates upward into place. Works for both scrubber rows and icon buttons.

const tooltip = document.getElementById('tooltip');

function positionTip(el) {
  tooltip.style.display = 'block';
  // Wait one frame so the browser has painted and offsetWidth is real.
  requestAnimationFrame(() => {
    const r   = el.getBoundingClientRect();
    const tw  = tooltip.offsetWidth;
    const th  = tooltip.offsetHeight;
    const bw  = document.body.clientWidth;
    // Center above the element; clamp to popup viewport.
    const left = Math.max(2, Math.min(r.left + (r.width - tw) / 2, bw - tw - 2));
    const top  = r.top - th - 6;
    tooltip.style.left = left + 'px';
    tooltip.style.top  = top  + 'px';
  });
}

document.querySelectorAll('[data-tip]').forEach(el => {
  el.addEventListener('mouseenter', () => {
    tooltip.textContent = el.dataset.tip;
    // Reset animation so it re-fires even if already visible.
    tooltip.style.animation = 'none';
    void tooltip.offsetWidth; // reflow flush
    tooltip.style.animation = '';
    positionTip(el);
  });
  el.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
});

// ── Save + broadcast to all YouTube tabs ───────────────────────────────────────

function save(key, val) {
  chrome.storage.sync.set({ [key]: val });
  chrome.tabs.query({ url: '*://*.youtube.com/*' }, tabs =>
    tabs.forEach(t =>
      chrome.tabs.sendMessage(t.id, { type: 'SETTINGS_CHANGED', payload: { [key]: val } })
        .catch(() => {})
    )
  );
}

// ── Init: hydrate UI from stored settings ─────────────────────────────────────
// Falls back to DEFAULTS for any key absent from storage (no onInstalled needed).

const NON_BOOL = new Set(['playbackRate', 'volumeBoost', 'quality', 'nativeGrid']);

chrome.storage.sync.get(DEFAULTS, s => {

  // Sliders
  const rate = s.playbackRate ?? 1;
  speedSlider.value = rate;
  updateSpeedUI(rate);

  const vol = s.volumeBoost ?? 100;
  volumeSlider.value = vol;
  updateVolumeUI(vol);

  // Quality pills
  const q = s.quality ?? 'hd1080';
  document.querySelectorAll('.q-pill').forEach(p => {
    if (p.dataset.q === q) { p.classList.add('active'); activeQPill = p; }
  });

  // Grid buttons
  const col = s.nativeGrid ? '3' : '4';
  document.querySelectorAll('.grid-btn').forEach(b => {
    if (b.dataset.grid === col) { b.classList.add('active'); activeGridBtn = b; }
  });

  // Interface icon-toggles (all boolean keys)
  document.querySelectorAll('.if-btn[data-key]').forEach(btn => {
    const key = btn.dataset.key;
    if (key in s) btn.classList.toggle('active', !!s[key]);
  });

});
