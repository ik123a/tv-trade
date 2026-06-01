# 🏗️ Architecture — TV Trade

## System Overview

TV Trade is a **Chrome Extension (Manifest V3)** with four main layers: the TradingView content script, the background service worker, the dashboard UI, and the popup.

```mermaid
graph TB
    subgraph Chrome["Chrome Browser"]
        subgraph TV["TradingView Tab"]
            DOM["TradingView DOM<br/>(Chart, Order Panel)"]
            CS["content.js<br/>Trading Engine"]
        end

        subgraph BG["Service Worker"]
            SW["background.js<br/>API Router & Model Manager"]
        end

        subgraph Dash["Dashboard Tab"]
            DH["dashboard.html"]
            DJ["dashboard.js<br/>UI Renderer"]
            DC["dashboard.css"]
            DD["dashboard-data.js<br/>Catalog Data"]
        end

        subgraph Popup["Popup"]
            PH["popup.html"]
            PJ["popup.js"]
        end

        STORE["chrome.storage.local<br/>Persistent State"]
    end

    subgraph APIs["External APIs"]
        NV["NVIDIA NIM<br/>integrate.api.nvidia.com"]
        OR["OpenRouter<br/>openrouter.ai/api/v1"]
    end

    CS -->|scrapes OHLC| DOM
    CS -->|clicks Buy/Sell| DOM
    CS <-->|messages| SW
    SW <-->|messages| DJ
    SW -->|HTTPS POST| NV
    SW -->|HTTPS POST| OR
    CS --> STORE
    DJ --> STORE
    PJ --> STORE
    SW --> STORE

    style CS fill:#8833ff,color:#fff
    style SW fill:#00d1ff,color:#000
    style DJ fill:#00ffa3,color:#000
    style DOM fill:#1a2230,color:#fff
    style STORE fill:#ffaa00,color:#000
```

---

## Component Breakdown

### 1. Content Script — `content.js` (Trading Engine)

The core brain. Injected into every `tradingview.com/chart/*` page.

```mermaid
graph LR
    subgraph ContentScript["content.js"]
        SCRAPE["scrapeOHLC()<br/>scrapeNews()<br/>scrapeTechnicals()"]
        ACCUM["accumulateCandle()<br/>Build 500-candle history"]
        PREDICT["triggerPrediction()<br/>Send to AI"]
        GATE["shouldAutoExecute()<br/>Gate Checks"]
        EXEC["executeOrder()<br/>DOM / Simulated"]
        POS["Position Manager<br/>open, close, modify"]
        LOG["Activity Logger<br/>logActivity()"]
        MONITOR["trackSignal()<br/>TP/SL Monitor"]
    end

    SCRAPE --> ACCUM --> PREDICT --> GATE --> EXEC --> POS --> MONITOR
    EXEC --> LOG
    POS --> LOG
    GATE --> LOG
```

**Key Responsibilities:**
| Function | Purpose |
|----------|---------|
| `scrapeOHLC()` | Reads Open/High/Low/Close from TradingView legend DOM |
| `scrapeNews()` | Extracts headline text from news widgets |
| `scrapeTechnicals()` | Reads speedometer gauge (Buy/Sell/Neutral) |
| `accumulateCandle()` | Builds rolling 500-candle price history |
| `triggerPrediction()` | Packages data → sends to background.js for AI |
| `shouldAutoExecute()` | 7-point gate check before auto-trading |
| `executeOrder()` | Routes to DOM or simulated execution |
| `autoFillOrderPanel()` | DOM automation: click tabs, fill inputs, submit |
| `simulateOrder()` | Internal paper trade recording |
| `trackSignal()` | Monitors price every 5s for TP/SL hits |
| `closePosition()` | Closes trade, calculates P&L, moves to history |
| `logActivity()` | Writes timestamped event to activity feed |
| `broadcastDashboardState()` | Pushes full state to dashboard via storage + messages |

---

### 2. Service Worker — `background.js` (API Router)

Persistent background process handling AI API calls and message routing.

```mermaid
sequenceDiagram
    participant CS as content.js
    participant BG as background.js
    participant API as AI API
    participant DJ as dashboard.js

    CS->>BG: PREDICT {symbol, candles, news}
    BG->>API: POST /chat/completions
    API-->>BG: {signal, probability, tp, sl, reasoning}
    BG-->>CS: prediction response

    CS->>BG: ACTIVITY_LOG_ENTRY {entry}
    BG->>DJ: relay ACTIVITY_LOG_ENTRY

    DJ->>BG: CLOSE_POSITION {tradeId}
    BG->>CS: forward CLOSE_POSITION
    CS-->>BG: {ok: true}
    BG-->>DJ: response

    CS->>BG: POSITIONS_UPDATED {openTrades, feedbackData}
    BG->>DJ: relay POSITIONS_UPDATED
```

**Message Types Handled (20+):**

| Message | Direction | Purpose |
|---------|-----------|---------|
| `PREDICT` | CS → BG → API | Request AI prediction |
| `TOGGLE_AI` | DJ → BG → CS | Enable/disable AI engine |
| `TOGGLE_AUTO_TRADE` | DJ → BG → CS | Enable/disable auto-trading |
| `TRIGGER_PREDICT` | DJ → BG → CS | Manual prediction request |
| `CLOSE_POSITION` | DJ → BG → CS | Close a specific trade |
| `MODIFY_POSITION` | DJ → BG → CS | Update TP/SL on a trade |
| `CLOSE_ALL_POSITIONS` | DJ → BG → CS | Close all open trades |
| `UPDATE_TRADE_SETTINGS` | DJ → BG → CS | Change mode/size/max |
| `GET_POSITIONS` | DJ → BG → CS | Fetch current positions |
| `GET_ACTIVITY_LOG` | DJ → BG → CS | Fetch activity history |
| `GET_EXPORT_DATA` | DJ → BG → CS | Fetch candles for export |
| `ACTIVITY_LOG_ENTRY` | CS → BG → DJ | Real-time activity event |
| `POSITIONS_UPDATED` | CS → BG → DJ | Live position/P&L update |
| `HISTORY_UPDATED` | CS → BG → DJ | Trade closed notification |
| `DASHBOARD_BROADCAST` | CS → storage | Full state snapshot |
| `CHART_READY` | CS → BG | Chart tab connected |

**AI API Flow:**
```mermaid
graph TD
    REQ["PREDICT Request"] --> DETECT{"API Key Type?"}
    DETECT -->|nvapi-*| NV["NVIDIA NIM Endpoint<br/>integrate.api.nvidia.com"]
    DETECT -->|sk-or-*| OR["OpenRouter Endpoint<br/>openrouter.ai/api/v1"]

    NV --> MODEL1["Primary Model"]
    OR --> MODEL1

    MODEL1 -->|Success| PARSE["Parse JSON Response"]
    MODEL1 -->|Error/Timeout| MODEL2["Fallback Model"]
    MODEL2 -->|Success| PARSE
    MODEL2 -->|Error| MODEL3["Next Fallback"]
    MODEL3 --> PARSE

    PARSE --> VALIDATE{"Valid signal?<br/>BUY/SELL/HOLD?"}
    VALIDATE -->|Yes| RETURN["Return Prediction"]
    VALIDATE -->|No| RETRY["Retry with next model"]
```

---

### 3. Dashboard — `dashboard.html` + `dashboard.js`

Full-page UI rendered in its own Chrome tab.

```mermaid
graph TD
    subgraph DashboardLayout["Dashboard Layout"]
        HEADER["Header Bar<br/>Logo, Connection Status, Link"]
        PORTFOLIO["Portfolio Summary Bar<br/>8 metrics always visible"]

        subgraph Sidebar["Sidebar (sticky)"]
            ENGINE["AI Engine Select"]
            PRESET["Swarm Preset Select"]
            AUTO["Auto-Trade Toggle + Confidence"]
            SETTINGS["Trade Settings<br/>Mode, Size, Max Positions"]
            ENGINES["7 Backtest Engines List"]
        end

        subgraph Tabs["Main Content (10 tabs)"]
            T1["Signal Tab<br/>Signal, Confidence, TP/SL, Calculator"]
            T2["Positions Tab<br/>Open trades table (12 cols)"]
            T3["Activity Tab<br/>Live event feed with filter"]
            T4["Trade Log Tab<br/>History table (15 cols) + Export"]
            T5["Swarm Tab<br/>Multi-agent visualization"]
            T6["Teams Tab<br/>29 team presets"]
            T7["Skills Tab<br/>71 skills by category"]
            T8["History Tab<br/>Equity curve + W/L"]
            T9["Backtest Tab<br/>7 engines + stats"]
            T10["Export Tab<br/>Pine/TDX/MT5/JSON"]
        end

        FOOTER["Footer"]
    end

    HEADER --> PORTFOLIO --> Sidebar
    Sidebar --> Tabs --> FOOTER
```

**Data Flow into Dashboard:**
```mermaid
graph LR
    STORAGE["chrome.storage.local"] -->|dashboardState| DJ["dashboard.js"]
    STORAGE -->|feedbackData| DJ
    STORAGE -->|openTrades| DJ
    STORAGE -->|activityLog| DJ
    STORAGE -->|tradeSettings| DJ

    MSG["chrome.runtime.onMessage"] -->|POSITIONS_UPDATED| DJ
    MSG -->|ACTIVITY_LOG_ENTRY| DJ
    MSG -->|HISTORY_UPDATED| DJ

    DJ --> RENDER["Render Functions"]
    RENDER --> R1["renderOpenPositions()"]
    RENDER --> R2["renderActivityFeed()"]
    RENDER --> R3["renderTradeLog()"]
    RENDER --> R4["renderHistoryTab()"]
    RENDER --> R5["updatePortfolioBar()"]
```

---

### 4. Popup — `popup.html` + `popup.js`

Lightweight browser-action popup for quick API key setup and toggle controls.

---

## State Management

All persistent state lives in `chrome.storage.local`:

```mermaid
graph TD
    subgraph Storage["chrome.storage.local"]
        S1["apiKey — NVIDIA or OpenRouter key"]
        S2["selectedModel — Active AI model ID"]
        S3["selectedPreset — Active team preset"]
        S4["autoTradeEnabled — Boolean"]
        S5["minAutoConfidence — 50-90"]
        S6["tradeSettings — {mode, size, max}"]
        S7["openTrades — Array of active trades"]
        S8["feedbackData — Array of closed trades"]
        S9["activityLog — Array of events"]
        S10["dashboardState — Full UI snapshot"]
    end
```

---

## Auto-Trade Execution Flow

```mermaid
flowchart TD
    SIGNAL["AI Signal Received<br/>BUY @ 78% confidence"]
    CHECK1{"Auto-trade<br/>enabled?"}
    CHECK2{"Signal ≠ HOLD?"}
    CHECK3{"Has TP & SL?"}
    CHECK4{"Confidence ≥<br/>threshold?"}
    CHECK5{"Max positions<br/>not reached?"}
    CHECK6{"No existing position<br/>on this symbol?"}
    CHECK7{"Not a duplicate<br/>signal?"}

    SIGNAL --> CHECK1
    CHECK1 -->|No| BLOCKED["❌ Blocked:<br/>Auto-trade disabled"]
    CHECK1 -->|Yes| CHECK2
    CHECK2 -->|No| BLOCKED2["❌ Blocked:<br/>HOLD signal"]
    CHECK2 -->|Yes| CHECK3
    CHECK3 -->|No| BLOCKED3["❌ Blocked:<br/>Missing TP/SL"]
    CHECK3 -->|Yes| CHECK4
    CHECK4 -->|No| BLOCKED4["❌ Blocked:<br/>Low confidence"]
    CHECK4 -->|Yes| CHECK5
    CHECK5 -->|No| BLOCKED5["❌ Blocked:<br/>Max positions"]
    CHECK5 -->|Yes| CHECK6
    CHECK6 -->|No| BLOCKED6["❌ Blocked:<br/>Duplicate symbol"]
    CHECK6 -->|Yes| CHECK7
    CHECK7 -->|No| BLOCKED7["❌ Blocked:<br/>Duplicate signal"]
    CHECK7 -->|Yes| EXECUTE

    EXECUTE["✅ EXECUTE ORDER"]
    EXECUTE --> MODE{"Execution<br/>Mode?"}
    MODE -->|DOM| DOM_EXEC["Click Buy/Sell tab<br/>Fill TP/SL inputs<br/>Click Place Order"]
    MODE -->|Simulated| SIM_EXEC["Record internal trade<br/>Monitor TP/SL"]
    MODE -->|Both| BOTH_EXEC["Try DOM first<br/>Fallback to Simulated"]

    DOM_EXEC --> RECORD["Record Trade<br/>Start TP/SL Monitor"]
    SIM_EXEC --> RECORD
    BOTH_EXEC --> RECORD

    style EXECUTE fill:#00ffa3,color:#000
    style BLOCKED fill:#ff3b3b,color:#fff
    style BLOCKED2 fill:#ff3b3b,color:#fff
    style BLOCKED3 fill:#ff3b3b,color:#fff
    style BLOCKED4 fill:#ff3b3b,color:#fff
    style BLOCKED5 fill:#ff3b3b,color:#fff
    style BLOCKED6 fill:#ff3b3b,color:#fff
    style BLOCKED7 fill:#ff3b3b,color:#fff
```

---

## DOM Automation Detail

```mermaid
sequenceDiagram
    participant Engine as Trading Engine
    participant DOM as TradingView DOM
    participant Log as Activity Log

    Engine->>Log: 🖱️ Attempting DOM automation
    Engine->>DOM: Find Buy/Sell tab (text match)
    alt Tab found
        Engine->>DOM: Click tab
        Engine->>Log: ✅ Clicked Buy/Sell tab
    else Not found
        Engine->>DOM: Dispatch keyboard shortcut (B/S)
        Engine->>Log: ⚠️ Tab not found, trying shortcut
    end

    Note over Engine,DOM: 300ms delay

    Engine->>DOM: Find "Take Profit" label
    Engine->>DOM: Enable toggle if off
    Engine->>DOM: Set input value via native setter
    Engine->>Log: ✅/⚠️ TP result

    Engine->>DOM: Find "Stop Loss" label
    Engine->>DOM: Enable toggle if off
    Engine->>DOM: Set input value via native setter
    Engine->>Log: ✅/⚠️ SL result

    Note over Engine,DOM: 1500ms delay

    Engine->>DOM: Find Place Order button
    alt Button found + auto-trade ON
        Engine->>DOM: Dispatch mousedown→mouseup→click
        Engine->>Log: 🎯 Order placed!
    else Not found
        Engine->>Log: ❌ Execute button not found
    end
```

---

## File Dependency Graph

```mermaid
graph TD
    MANIFEST["manifest.json"] -->|registers| BG["background.js"]
    MANIFEST -->|injects| CS["content.js"]
    MANIFEST -->|declares| POPUP_H["popup.html"]
    MANIFEST -->|hosts| DASH_H["dashboard.html"]

    POPUP_H --> PJ["popup.js"]
    POPUP_H --> SS["styles.css"]

    DASH_H --> DJ["dashboard.js"]
    DASH_H --> DC["dashboard.css"]
    DASH_H --> DD["dashboard-data.js"]

    BG <-->|messages| CS
    BG <-->|messages| DJ
    CS <-->|storage| DJ

    MANIFEST -->|permissions| APIS["NVIDIA NIM<br/>OpenRouter<br/>TradingView"]

    style MANIFEST fill:#ffaa00,color:#000
    style BG fill:#00d1ff,color:#000
    style CS fill:#8833ff,color:#fff
    style DJ fill:#00ffa3,color:#000
```

---

## AI Model Inventory (16 Models)

### NVIDIA NIM (9 models)
| Priority | Model ID | Parameters |
|----------|----------|------------|
| 1 | `nvidia/llama-3.3-nemotron-super-49b-v1.5` | 49B |
| 2 | `deepseek-ai/deepseek-v4-pro` | — |
| 3 | `meta/llama-4-maverick-17b-128e-instruct` | 17B (128 experts) |
| 4 | `z-ai/glm-5.1` | — |
| 5 | `qwen/qwen3-coder-480b-a35b-instruct` | 480B (35B active) |
| 6 | `mistralai/mistral-large-3-675b-instruct-2512` | 675B |
| 7 | `nvidia/nemotron-3-super-120b-a12b` | 120B (12B active) |
| 8 | `meta/llama-3.3-70b-instruct` | 70B |
| 9 | `moonshotai/kimi-k2.6` | — |

### OpenRouter (7 models)
| Priority | Model ID | Cost |
|----------|----------|------|
| 1 | `moonshotai/kimi-k2.6:free` | Free |
| 2 | `deepseek/deepseek-v4-flash` | Free |
| 3 | `qwen/qwen3-coder:free` | Free |
| 4 | `nvidia/nemotron-3-super-120b-a12b:free` | Free |
| 5 | `minimax/minimax-m2.5:free` | Free |
| 6 | `z-ai/glm-4.5-air:free` | Free |

When **Auto** is selected, models are tried in priority order. If one fails (error, timeout, rate limit), the next model in the chain is attempted automatically.

---

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Platform | Chrome Extension (Manifest V3) |
| Language | Vanilla JavaScript (ES2022) |
| Styling | Vanilla CSS (950+ lines, dark theme, glassmorphism) |
| Storage | `chrome.storage.local` (10 state keys) |
| Messaging | `chrome.runtime.sendMessage` / `onMessage` (20+ types) |
| AI Models | NVIDIA NIM API (9 models), OpenRouter API (7 models) |
| DOM Interaction | `querySelector`, native input setters, `MouseEvent` dispatch |
| Charts | HTML5 Canvas (equity curve) |
| Export | CSV, JSON, Pine Script v5, MQL5, TDX |
