# Contributing to TV Trade

Thanks for your interest in contributing! Here's how to get started.

## 🛠️ Development Setup

1. **Clone the repo:**
   ```bash
   git clone https://github.com/ik123a/tv-trade.git
   cd tv-trade
   ```

2. **Set up API keys:**
   ```bash
   cp NVIDIA_API_KEY.txt.example NVIDIA_API_KEY.txt
   cp OPENROUTER_API_KEY.txt.example OPENROUTER_API_KEY.txt
   # Edit the files and paste your actual keys
   ```

3. **Load in Chrome:**
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked" → select the project folder

4. **Open TradingView:**
   - Navigate to any chart on [tradingview.com/chart](https://www.tradingview.com/chart/)
   - The extension auto-connects

5. **Open Dashboard:**
   - Click the extension icon → "Open Dashboard"
   - Or right-click the icon → "Dashboard"

## 📁 Project Structure

```
├── manifest.json          # Extension config (Manifest V3)
├── background.js          # Service worker (AI calls, routing)
├── content.js             # TradingView injector (scraping, trading)
├── dashboard.html/js/css  # Full dashboard UI
├── dashboard-data.js      # Skills/teams/engines catalog
├── popup.html/js          # Browser action popup
├── styles.css             # Legacy overlay styles
├── ARCHITECTURE.md        # System architecture diagrams
└── README.md              # User-facing documentation
```

## 🔀 Branch Strategy

- `main` — Stable, production-ready code
- `feature/*` — New features
- `fix/*` — Bug fixes

## 📝 Commit Messages

Follow [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add new AI model support
fix: resolve DOM selector for TP input
docs: update architecture diagram
refactor: extract position manager into module
```

## 🧪 Testing

Since this is a Chrome extension, testing involves:

1. **Syntax check:** `node --check <filename>.js`
2. **Load in Chrome:** Reload extension at `chrome://extensions/`
3. **Console logs:** Check DevTools console on TradingView tab and Dashboard tab
4. **Activity Log:** Monitor the Activity Feed tab for errors

## 🐛 Reporting Issues

Include:
- Chrome version
- TradingView page URL
- Console errors (DevTools → Console)
- Activity Log entries (Dashboard → Activity tab)
- Steps to reproduce

## ⚠️ Important Notes

- **Never commit API keys** — they are in `.gitignore`
- **DOM selectors are fragile** — TradingView changes their UI frequently
- **Rate limits** — AI APIs have rate limits; the extension has a 10-second cooldown
- **Test with Simulated mode first** before using DOM automation
