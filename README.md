# Y-akuza v5
> **The absolute fastest, most aggressive YouTube experience.**

Y-akuza is a high-performance browser extension built to strip YouTube down to its absolute essentials. By utilizing network-level blocking and zero-flicker CSS injection, it transforms the cluttered interface into a cinematic, distraction-free player.

## ⚡ Performance First
Unlike other "hiders," Y-akuza prioritizes speed by stopping the bloat before it even loads:
- **Network-Level Blocking**: Uses `declarativeNetRequest` to block tracking, telemetry, and ads at the browser level.
- **Zero-Flicker Injection**: Injects styles at `document_start` to ensure the sidebar and comments never even appear on your screen.
- **Minimal Footprint**: Event-driven architecture that only runs when needed.

## 🎨 Visual Improvements
- **Y-akuza Red UI**: A custom aesthetic featuring high-contrast "Y-akuza Red" accents.
- **Minimalist Typography**: Overrides default fonts with a clean, professional Helvetica stack.
- **Focus Mode**: Hides the navigation rail, recommendations, comments, and video metadata.
- **Ultra-Slim Scrollbars**: Modernized, thin scrollbars that stay out of your way.
- **Custom Grid**: Toggle between the native 3-column layout or a compact 4-column view.

## 🛠 Features
- **Volume Boost**: Increase audio gain up to 300% using the Web Audio API.
- **Forced Quality**: Lock videos to 4K, 1080p, or **Audio-only mode** to save bandwidth.
- **Shorts Redirect**: Automatically sends `/shorts/` URLs to the standard video player.
- **Embed Redirect**: Launch videos directly into the lightweight `/embed/` player for maximum speed.
- **Playback Speed**: Persistent speed controls from 0.25x to 4x.

## 🚀 Installation
1. Download this repository as a `.zip` and extract it.
2. Go to `chrome://extensions/` in your browser.
3. Turn on **Developer mode** (top right corner).
4. Click **Load unpacked** and select the folder containing these files.

## 📜 License
MIT © [Your Name]
