// Y-akuza v5 — Canonical Default Configuration
// Single source of truth. The extension reads chrome.storage.sync and falls
// back to these values for any key absent from storage.
// Mirror structural changes here to content.js and popup.js.

const DEFAULTS = {
  hideShorts:   true,     // Hide Shorts shelf + redirect /shorts/ URLs
  hideComments: true,     // Hide comment section (IO-safe height collapse)
  hideSidebar:  true,     // Hide recommendations sidebar on watch page
  hideMeta:     true,     // Hide title, channel info, and action buttons
  hideNav:      true,     // Hide left navigation rail
  hideEndCards: true,     // Hide end-card overlays and card teasers
  hideLiveChat: true,     // Hide live chat frame on streams
  playbackRate: 1,        // Speed multiplier (0.25–4)
  volumeBoost:  100,      // Gain % (100–300). 100 = native. Uses Web Audio API.
  quality:      'hd1080', // 'hd2160' | 'hd1440' | 'hd1080' | 'hd720' | 'audio'
  nativeGrid:   false,    // false = 4-col grid (default), true = 3-col
};
