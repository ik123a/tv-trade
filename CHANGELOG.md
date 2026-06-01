# Changelog

All notable changes to TV Trade are documented here.

## [1.1.0] — 2025-06-01

### 🧠 New AI Models

- Added **5 new NVIDIA NIM models**: DeepSeek V4 Pro, Llama 4 Maverick 17B, GLM 5.1, Qwen3 Coder 480B, Mistral Large 3 675B
- Total model count: **16** (9 NVIDIA NIM + 7 OpenRouter)
- Updated Auto fallback priority chain to include all 9 NVIDIA models

### 📐 Documentation

- Added `ARCHITECTURE.md` — 8 Mermaid diagrams covering full system architecture
- Added `CONTRIBUTING.md` — developer setup and contribution guide
- Added `CHANGELOG.md` — version history
- Added `LICENSE` — MIT License
- Complete `README.md` rewrite with architecture overview, all 16 models, and full project docs

---

## [1.0.0] — 2025-06-01

### 🚀 Initial Release

#### AI Signal Engine
- Multi-model AI prediction with NVIDIA NIM and OpenRouter support
- 16 AI models with automatic fallback on failure (9 NVIDIA + 7 OpenRouter)
- Structured financial analysis prompts with OHLC, news, technicals
- BUY/SELL/HOLD signals with confidence %, Take Profit & Stop Loss

#### Automated Trading
- **DOM Automation** — Clicks TradingView Buy/Sell buttons, fills TP/SL, places orders
- **Simulated Paper Trading** — Internal trade engine for safe testing
- **Hybrid Mode** — DOM first with simulated fallback
- **Smart Gate System** — 7-point validation before auto-executing
- **TP/SL Monitoring** — Auto-closes positions when targets are hit

#### Dashboard (10 Tabs)
- **Signal** — Live signal display with confidence meter and investment calculator
- **Positions** — Open positions table (12 columns) with live P&L and close controls
- **Activity Log** — Real-time event feed with color-coded entries and filters
- **Trade Log** — Complete trade history (15 columns) with summary stats
- **Swarm** — Multi-agent DAG orchestration visualization
- **Teams** — 29 agent team presets across 6 departments
- **Skills** — 71 specialist analysis skills in 7 categories
- **History** — Equity curve and win/loss breakdown
- **Backtest** — 7 backtest engines (Monte Carlo, Walk-Forward, etc.)
- **Export** — Pine Script, TDX, MetaTrader 5, JSON export

#### Portfolio Management
- Always-visible portfolio summary bar (8 metrics)
- Configurable trade settings (execution mode, position size, max positions)
- CSV and JSON trade log export
- Position modification (update TP/SL on open trades)
- Close All Positions button

#### Infrastructure
- Chrome Extension Manifest V3
- `chrome.storage.local` for persistent state
- Message-passing architecture (content ↔ background ↔ dashboard)
- Activity logging system with 200-event buffer
- Auto-reconnect on chart navigation
