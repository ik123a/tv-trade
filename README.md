# 📺 TV Trade — AI-Powered TradingView Auto-Trading Extension

A Chrome extension that brings **fully automated AI trading** to TradingView. It scrapes live chart data, sends it to AI models for analysis, and executes trades directly on TradingView's interface — all with real-time logging, position management, and comprehensive trade history.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)
![AI Powered](https://img.shields.io/badge/AI-Powered-purple)

---

## 🚀 Features

### 🧠 AI Signal Generation
- Scrapes **live OHLC data** directly from TradingView's DOM
- Sends chart data to AI models with structured financial analysis prompts
- Returns **BUY/SELL/HOLD** signals with confidence %, Take Profit & Stop Loss levels
- Multi-model fallback system (tries next model if one fails)

### 🤖 Fully Automated Trading
- **DOM Automation** — Clicks TradingView's Buy/Sell buttons, fills TP/SL fields, clicks Place Order
- **Simulated Paper Trading** — Internal trade simulation (no DOM interaction)
- **Hybrid Mode** — DOM first, simulated fallback
- **Smart Gate Checks** — Confidence threshold, max positions, duplicate detection, symbol check

### 📊 Live Dashboard
| Tab | Description |
|-----|-------------|
| **Signal** | Current AI signal with confidence meter, TP/SL, investment calculator |
| **Positions** | Open positions with live P&L, close buttons, duration |
| **Activity Log** | Real-time feed of every bot action (signals, orders, TP/SL hits) |
| **Trade Log** | Full trade history table (15 columns) with CSV/JSON export |
| **Swarm** | Multi-agent orchestration visualization |
| **Teams** | 29 agent team presets |
| **Skills** | 71 specialist analysis skills |
| **History** | Equity curve and win/loss breakdown |
| **Backtest** | 7 backtest engines |
| **Export** | Pine Script, TDX, MT5, JSON export |

### 💰 Portfolio Summary Bar
Always-visible top bar showing:
- Open Positions count
- Unrealized P&L (live)
- Realized P&L
- Total P&L
- Win Rate
- Win/Loss count

### 📋 Comprehensive Trade Log
15-column table with every trade detail:
`# | Opened | Closed | Symbol | Side | Entry | Exit | Size | P&L $ | P&L % | Result | Duration | TP | SL | Exit Reason`

Export as **CSV** or **JSON** for spreadsheet analysis.

---

## 🔧 Installation

1. Clone this repository:
   ```bash
   git clone https://github.com/YOUR_USERNAME/tv-trade.git
   ```

2. Open Chrome and go to `chrome://extensions/`

3. Enable **Developer mode** (toggle in top right)

4. Click **Load unpacked** and select the cloned folder

5. Add your API key:
   - For **NVIDIA NIM**: Paste your key in `NVIDIA_API_KEY.txt`
   - For **OpenRouter**: Paste your key in `OPENROUTER_API_KEY.txt`

6. Open a [TradingView chart](https://www.tradingview.com/chart/) — the extension auto-connects

---

## ⚙️ Configuration

### API Keys
| File | Key Format | Endpoint |
|------|-----------|----------|
| `NVIDIA_API_KEY.txt` | `nvapi-...` | `integrate.api.nvidia.com` |
| `OPENROUTER_API_KEY.txt` | `sk-or-...` | `openrouter.ai` |

### AI Models

**NVIDIA NIM Models:**
- ⚡ Nemotron Super 49B v1.5 (Primary)
- 🚀 Llama 3.3 70B
- 🦾 Nemotron 3 Super 120B
- 🌙 Kimi K2.6

**OpenRouter Models (Free Tier):**
- 🌙 Kimi K2.6 Free (Primary)
- 🚀 DeepSeek V4 Flash
- 🧠 Qwen3 Coder Free
- 🦾 Nemotron 3 Super 120B
- ✨ MiniMax M2.5 Free
- 💨 GLM 4.5 Air Free

### Trade Settings (Dashboard Sidebar)
| Setting | Default | Description |
|---------|---------|-------------|
| Execution Mode | DOM Only | `DOM Only` / `Simulated Only` / `DOM + Sim Fallback` |
| Position Size | $1,000 | Amount per trade |
| Max Positions | 3 | Maximum concurrent open positions |
| Min Confidence | 65% | Minimum AI confidence to auto-execute |

---

## 📁 Project Structure

```
TV trade/
├── manifest.json          # Chrome extension manifest (MV3)
├── background.js          # Service worker: AI API calls, message routing
├── content.js             # TradingView injector: scraping, auto-trading engine
├── dashboard.html         # Full dashboard UI
├── dashboard.js           # Dashboard rendering & controls
├── dashboard.css          # Dashboard styling (dark theme)
├── dashboard-data.js      # Skills, teams, engines catalog data
├── popup.html             # Browser action popup
├── popup.js               # Popup controls
├── styles.css             # Legacy overlay styles
├── icon.png               # Extension icon
├── OPENROUTER_API_KEY.txt # OpenRouter API key (user-provided)
├── NVIDIA_API_KEY.txt     # NVIDIA NIM API key (user-provided)
├── .gitignore             # Git ignore rules
└── README.md              # This file
```

---

## 🔄 How It Works

```
1. TradingView chart loads
   └── content.js injected, scrapes OHLC data every 5 seconds

2. Data ready (8+ candles)
   └── Sends to AI model via background.js service worker

3. AI returns signal
   └── BUY/SELL/HOLD + confidence % + TP/SL levels

4. Auto-trade gate check
   ├── Confidence ≥ threshold? ✅
   ├── Max positions not exceeded? ✅
   ├── No duplicate signal? ✅
   └── No existing position on symbol? ✅

5. Order execution (DOM mode)
   ├── Click Buy/Sell tab on TradingView
   ├── Enable & fill Take Profit field
   ├── Enable & fill Stop Loss field
   └── Click Place Order button

6. Position monitoring
   ├── Live P&L updated every 5 seconds
   ├── TP hit → auto-close with profit ✅
   └── SL hit → auto-close with loss ❌

7. Everything logged
   └── Activity feed, trade log table, portfolio summary
```

---

## ⚠️ Disclaimer

This extension is for **educational and paper trading purposes**. DOM automation on TradingView may violate their Terms of Service. Use at your own risk. The AI-generated signals are not financial advice.

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
