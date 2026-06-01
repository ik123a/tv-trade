# 📺 TV Trade — AI-Powered TradingView Auto-Trading Extension

A Chrome extension that brings **fully automated AI trading** to TradingView. It scrapes live chart data, sends it to AI models for analysis, and executes trades directly on TradingView's interface — all with real-time logging, position management, and comprehensive trade history.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-blue?logo=googlechrome)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-green)
![AI Powered](https://img.shields.io/badge/AI-Powered-purple)
![Models](https://img.shields.io/badge/AI_Models-16-blueviolet)
![Skills](https://img.shields.io/badge/Skills-71-orange)
![Teams](https://img.shields.io/badge/Agent_Teams-29-cyan)

---

## ✨ Key Highlights

- **16 AI Models** — 9 NVIDIA NIM + 7 OpenRouter (including free tier)
- **3 Execution Modes** — DOM automation, simulated paper trading, or hybrid
- **29 Agent Teams** with **71 Specialist Skills** across 7 categories
- **10-Tab Dashboard** — Signal, Positions, Activity Log, Trade Log, Swarm, Teams, Skills, History, Backtest, Export
- **Live Portfolio Tracking** — Real-time P&L, win rate, equity curve
- **Export Everywhere** — CSV, JSON, Pine Script, MetaTrader 5, TDX

---

## 🚀 Features

### 🧠 AI Signal Generation
- Scrapes **live OHLC data** directly from TradingView's DOM
- Extracts **news headlines**, **technical indicators**, and **performance data** from the chart page
- Sends everything to AI with a structured prompt covering **SMC/ICT**, Elliott Wave, Ichimoku, harmonics, and macro analysis
- Returns **BUY/SELL/HOLD** signals with confidence %, Take Profit, Stop Loss, time horizon, and multi-department reasoning
- **9-model fallback chain** — if one model fails or times out, automatically tries the next

### 🤖 Fully Automated Trading
- **DOM Automation** — Clicks TradingView's Buy/Sell buttons, fills TP/SL fields, clicks Place Order
- **Simulated Paper Trading** — Internal trade engine for risk-free testing
- **Hybrid Mode** — DOM first, auto-fallback to simulated if DOM fails
- **7-Point Gate Check** before every trade:
  1. Auto-trade enabled?
  2. Signal ≠ HOLD?
  3. Has TP & SL?
  4. Confidence ≥ threshold?
  5. Max positions not reached?
  6. No existing position on symbol?
  7. Not a duplicate signal?

### 📊 Live Dashboard (10 Tabs)

| Tab | Description |
|-----|-------------|
| **Signal** | Current AI signal with confidence meter, TP/SL, investment calculator, multi-department swarm display |
| **Positions** | Open positions table (12 columns) with live P&L, duration, and close/manage controls |
| **Activity Log** | Real-time color-coded event feed — signals, trades, TP/SL hits, errors — with filters |
| **Trade Log** | Complete trade history table (15 columns) with summary stats + CSV/JSON export |
| **Swarm** | Multi-agent DAG orchestration visualization (6 departments) |
| **Teams** | 29 agent team presets across trading desks |
| **Skills** | 71 specialist skills organized by 7 categories |
| **History** | Equity curve chart and win/loss breakdown |
| **Backtest** | 7 backtest engines (Monte Carlo, Walk-Forward, Bootstrap CI, etc.) |
| **Export** | Pine Script v5, TDX Formula, MetaTrader 5 MQL5, JSON Data |

### 💰 Portfolio Summary Bar (Always Visible)

| Metric | Description |
|--------|-------------|
| 📡 Symbol | Currently connected chart |
| 💰 Price | Live price from TradingView |
| 📊 Open Positions | Count of active trades |
| 📈 Unrealized P&L | Live P&L of open positions (green/red) |
| ✅ Realized P&L | Total from closed trades |
| 💎 Total P&L | Combined unrealized + realized |
| 🏆 Win Rate | Win percentage across all trades |
| W / L | Win/loss count |

### 📋 Comprehensive Trade Log

15-column table with every trade detail:

```
# | Opened | Closed | Symbol | Side | Entry | Exit | Size | P&L $ | P&L % | Result | Duration | TP | SL | Exit Reason
```

**Summary stats**: Total Trades, Win Rate, Total P&L, Avg P&L, Biggest Win, Biggest Loss, Avg Duration, W/L

**Export**: CSV spreadsheet or JSON data file

---

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Chrome Browser                        │
│                                                          │
│  ┌──────────────────┐     ┌────────────────────────┐    │
│  │  TradingView Tab  │     │   Dashboard Tab         │    │
│  │                    │     │                          │    │
│  │  ┌──────────────┐ │     │  ┌────────────────────┐ │    │
│  │  │  content.js   │ │     │  │  dashboard.js      │ │    │
│  │  │  • Scraper    │ │     │  │  • Portfolio Bar   │ │    │
│  │  │  • Trading    │◄─────►│  │  • 10 Tab Panels   │ │    │
│  │  │    Engine     │ │     │  │  • Settings        │ │    │
│  │  │  • Position   │ │     │  │  • Export          │ │    │
│  │  │    Manager    │ │     │  └────────────────────┘ │    │
│  │  │  • Activity   │ │     │  dashboard.css          │    │
│  │  │    Logger     │ │     │  dashboard-data.js      │    │
│  │  └──────┬───────┘ │     └───────────┬────────────┘    │
│  └─────────┼─────────┘                 │                  │
│            │         ┌─────────────────┤                  │
│            │         │                 │                  │
│            ▼         ▼                 ▼                  │
│       ┌────────────────────────────────────┐             │
│       │         background.js               │             │
│       │    Service Worker (Always-On)        │             │
│       │    • API Router (NVIDIA / OpenRouter)│             │
│       │    • Message Hub (20+ types)        │             │
│       │    • 9-Model Fallback Chain         │             │
│       └──────────┬─────────────────────────┘             │
│                  │                                        │
│       ┌──────────┴──────────┐                            │
│       │ chrome.storage.local │                            │
│       │ (Persistent State)   │                            │
│       └─────────────────────┘                            │
└──────────────────┬──────────────────────────────────────┘
                   │ HTTPS
      ┌────────────┴────────────┐
      ▼                         ▼
┌───────────────┐     ┌───────────────┐
│  NVIDIA NIM   │     │  OpenRouter   │
│  9 Models     │     │  7 Models     │
└───────────────┘     └───────────────┘
```

**Full architecture diagrams** with Mermaid flowcharts: [ARCHITECTURE.md](ARCHITECTURE.md)

---

## 🔧 Installation

1. **Clone this repository:**
   ```bash
   git clone https://github.com/ik123a/tv-trade.git
   ```

2. **Open Chrome** → go to `chrome://extensions/`

3. **Enable Developer mode** (toggle in top right)

4. **Click "Load unpacked"** → select the cloned `tv-trade` folder

5. **Add your API key** (choose one):
   - **NVIDIA NIM**: Create `NVIDIA_API_KEY.txt` → paste your `nvapi-...` key
   - **OpenRouter**: Create `OPENROUTER_API_KEY.txt` → paste your `sk-or-...` key

6. **Open a [TradingView chart](https://www.tradingview.com/chart/)** — the extension auto-connects

---

## ⚙️ Configuration

### API Keys

| File | Key Format | Endpoint | Free Tier |
|------|-----------|----------|-----------|
| `NVIDIA_API_KEY.txt` | `nvapi-...` | `integrate.api.nvidia.com` | 1000 free credits |
| `OPENROUTER_API_KEY.txt` | `sk-or-...` | `openrouter.ai` | Free models available |

### AI Models (16 Total)

**NVIDIA NIM Models (9):**

| # | Model | Label |
|---|-------|-------|
| 1 | `nvidia/llama-3.3-nemotron-super-49b-v1.5` | ⚡ Nemotron Super 49B v1.5 (Primary) |
| 2 | `deepseek-ai/deepseek-v4-pro` | 🧠 DeepSeek V4 Pro |
| 3 | `meta/llama-4-maverick-17b-128e-instruct` | 🦙 Llama 4 Maverick 17B |
| 4 | `z-ai/glm-5.1` | 💎 GLM 5.1 |
| 5 | `qwen/qwen3-coder-480b-a35b-instruct` | 🧪 Qwen3 Coder 480B |
| 6 | `mistralai/mistral-large-3-675b-instruct-2512` | 🌊 Mistral Large 3 675B |
| 7 | `nvidia/nemotron-3-super-120b-a12b` | 🦾 Nemotron 3 Super 120B |
| 8 | `meta/llama-3.3-70b-instruct` | 🚀 Llama 3.3 70B |
| 9 | `moonshotai/kimi-k2.6` | 🌙 Kimi K2.6 |

**OpenRouter Models (7):**

| # | Model | Label |
|---|-------|-------|
| 1 | `moonshotai/kimi-k2.6:free` | 🌙 Kimi K2.6 Free (Primary) |
| 2 | `deepseek/deepseek-v4-flash` | 🚀 DeepSeek V4 Flash |
| 3 | `qwen/qwen3-coder:free` | 🧠 Qwen3 Coder Free |
| 4 | `nvidia/nemotron-3-super-120b-a12b:free` | 🦾 Nemotron 3 Super 120B |
| 5 | `minimax/minimax-m2.5:free` | ✨ MiniMax M2.5 Free |
| 6 | `z-ai/glm-4.5-air:free` | 💨 GLM 4.5 Air Free |
| 7 | Auto | ⚡ Auto (all 6 models fallback) |

### Trade Settings (Dashboard Sidebar)

| Setting | Default | Options |
|---------|---------|---------|
| Execution Mode | DOM Only | `DOM Only` / `Simulated Only` / `DOM + Sim Fallback` |
| Position Size | $1,000 | $1 – unlimited |
| Max Positions | 3 | 1 – 20 |
| Min Confidence | 65% | 50% – 90% |

---

## 🔄 How It Works

```
1. TradingView chart loads
   └── content.js injected, scrapes OHLC + news + technicals every 5s

2. Data ready (8+ candles collected)
   └── Sends to AI model via background.js service worker

3. AI returns signal
   └── BUY/SELL/HOLD + confidence % + TP/SL + time horizon + reasoning

4. Auto-trade 7-point gate check
   ├── Auto-trade enabled? ✅
   ├── Signal ≠ HOLD? ✅
   ├── Has TP & SL levels? ✅
   ├── Confidence ≥ threshold? ✅
   ├── Max positions not reached? ✅
   ├── No existing position on symbol? ✅
   └── Not a duplicate signal? ✅

5. Order execution (DOM mode)
   ├── Click Buy/Sell tab on TradingView
   ├── Enable & fill Take Profit field
   ├── Enable & fill Stop Loss field
   └── Click Place Order button

6. Position monitoring (every 5 seconds)
   ├── Live P&L calculated and displayed
   ├── TP hit → auto-close with profit 🎯
   └── SL hit → auto-close with loss 🛑

7. Everything logged in real-time
   ├── Activity Feed — every bot action
   ├── Trade Log — complete history table
   └── Portfolio Bar — live summary metrics
```

---

## 📁 Project Structure

```
tv-trade/
├── manifest.json              # Chrome extension manifest (Manifest V3)
├── background.js              # Service worker: AI API calls, 20+ message handlers, 9-model fallback
├── content.js                 # TradingView injector: scraper, trading engine, position manager
├── dashboard.html             # Full dashboard UI (10 tabs, portfolio bar, sidebar settings)
├── dashboard.js               # Dashboard rendering, live P&L updates, CSV/JSON export
├── dashboard.css              # Dark theme styling (950+ lines, glassmorphism, animations)
├── dashboard-data.js          # 71 skills, 29 teams, 7 engines catalog data
├── popup.html                 # Browser action popup (API key setup)
├── popup.js                   # Popup controls and key detection
├── styles.css                 # TradingView overlay styles
├── icon.png                   # Extension icon (128x128)
├── ARCHITECTURE.md            # System architecture (8 Mermaid diagrams)
├── CONTRIBUTING.md            # Developer setup & contribution guide
├── CHANGELOG.md               # Version history
├── LICENSE                    # MIT License
├── .gitignore                 # Excludes API key files from git
├── OPENROUTER_API_KEY.txt.example  # API key placeholder (copy & rename)
├── NVIDIA_API_KEY.txt.example      # API key placeholder (copy & rename)
└── README.md                  # This file
```

---

## 📐 Architecture

Full system architecture with **8 Mermaid diagrams** in [ARCHITECTURE.md](ARCHITECTURE.md):

| Diagram | What It Shows |
|---------|---------------|
| **System Overview** | All components and their connections |
| **Content Script** | Trading engine internals (scrape → predict → gate → execute → monitor) |
| **Message Flow** | 20+ message types between content.js ↔ background.js ↔ dashboard.js |
| **API Flow** | NVIDIA/OpenRouter routing with 9-model fallback chain |
| **Auto-Trade Flow** | 7-point gate check decision tree |
| **DOM Automation** | Step-by-step TradingView button clicking sequence |
| **State Management** | chrome.storage.local data structure |
| **File Dependencies** | Which files depend on which |

---

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, branch strategy, and guidelines.

---

## 📋 Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history.

---

## ⚠️ Disclaimer

This extension is for **educational and paper trading purposes**. DOM automation on TradingView may violate their Terms of Service. Use at your own risk. The AI-generated signals are not financial advice. Always test with **Simulated Only** mode first.

---

## 📄 License

MIT License — see [LICENSE](LICENSE) for details.
