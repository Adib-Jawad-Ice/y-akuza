// Y-akuza v5 — Background Service Worker
//
// Intentionally empty of onInstalled defaults.
//
// All settings fall back to the DEFAULTS object in config.js via the
// chrome.storage.sync.get(DEFAULTS, …) call in content.js and popup.js.
// Writing hardcoded defaults here would shadow user customisations on update,
// and the old background.js contained key-name bugs (volume vs volumeBoost,
// antiClickbaitThumbnails vs hideThumbnails) that have now been eliminated.
//
// The storage layer is fully event-driven: values are written only when the
// user changes a setting in the popup, and read-with-fallback everywhere else.
