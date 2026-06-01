console.log('%c TV trade: content script loaded ', 'background: #8833ff; color: #fff; font-weight: bold; padding: 4px;');

// --- State ---
let candleHistory = [];
let lastProcessedTime = 0;
let feedbackData = [];  // Closed Trades
let openTrades = [];     // Active Trades
let isEnabled = true;
let currentSymbol = '';
let isAutoTradeEnabled = false;
let minAutoConfidence = 65;
let isPredicting = false;
let lastPredictionAttempt = 0;
let lastAutoExecutedSignalId = null;
let activityLog = [];

// Trade settings
let tradeSettings = {
  tradeMode: 'dom',          // 'dom' | 'simulated' | 'both'
  positionSize: 1000,        // $ per trade
  maxOpenPositions: 3,
  riskPerTrade: 2            // % of position size
};

const PREDICTION_COOLDOWN = 10000;
const MIN_CANDLES_FOR_PREDICTION = 8;
const PREDICT_INTERVAL_IDLE = 600000;
const PREDICT_INTERVAL_AUTO = 120000;
const MAX_ACTIVITY_LOG = 200;

// ============================================================
// ACTIVITY LOG SYSTEM
// ============================================================
function logActivity(type, message, data = {}) {
  const entry = {
    id: Date.now() + Math.random(),
    time: Date.now(),
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    type,
    message,
    data
  };
  activityLog.unshift(entry);
  if (activityLog.length > MAX_ACTIVITY_LOG) activityLog.pop();
  chrome.storage.local.set({ activityLog: activityLog.slice(0, 100) });
  chrome.runtime.sendMessage({ type: 'ACTIVITY_LOG_ENTRY', entry }).catch(() => {});
}

async function loadActivityLog() {
  const data = await chrome.storage.local.get(['activityLog']);
  if (data.activityLog) activityLog = data.activityLog;
}

// ============================================================
// MESSAGE HANDLERS
// ============================================================
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'TOGGLE_AI') {
    isEnabled = request.enabled;
    logActivity('SYSTEM', isEnabled ? 'AI engine enabled' : 'AI engine disabled');
    if (isEnabled) checkDataStatus();
  }
  if (request.type === 'TOGGLE_AUTO_TRADE') {
    setAutoTradeEnabled(request.enabled, request.minConfidence);
  }
  if (request.type === 'TRIGGER_PREDICT') {
    if (!isPredicting) triggerPrediction(true);
    sendResponse({ ok: true });
  }
  if (request.type === 'GET_EXPORT_DATA') {
    sendResponse({
      symbol: getSymbol(),
      candles: candleHistory.slice(-50),
      feedback: feedbackData
    });
  }
  if (request.type === 'CLOSE_POSITION') {
    closePosition(request.tradeId);
    sendResponse({ ok: true });
  }
  if (request.type === 'MODIFY_POSITION') {
    modifyPosition(request.tradeId, request.newTP, request.newSL);
    sendResponse({ ok: true });
  }
  if (request.type === 'UPDATE_TRADE_SETTINGS') {
    updateTradeSettings(request.settings);
    sendResponse({ ok: true });
  }
  if (request.type === 'GET_POSITIONS') {
    updateOpenTradesPnL();
    sendResponse({ openTrades, feedbackData: feedbackData.slice(0, 50) });
  }
  if (request.type === 'GET_ACTIVITY_LOG') {
    sendResponse({ activityLog: activityLog.slice(0, 100) });
  }
  if (request.type === 'CLOSE_ALL_POSITIONS') {
    closeAllPositions();
    sendResponse({ ok: true });
  }
  return true;
});

// ============================================================
// DASHBOARD STATE BROADCASTING
// ============================================================
function broadcastDashboardState(partial = {}) {
  updateOpenTradesPnL();
  const portfolioSummary = calculatePortfolioSummary();
  const state = {
    symbol: getSymbol(),
    chartConnected: true,
    currentPrice: window._currentPrice ?? (candleHistory.length ? candleHistory[candleHistory.length - 1].c : null),
    prediction: window._lastPrediction || null,
    isAutoTradeEnabled,
    isPredicting,
    candleCount: candleHistory.length,
    openTrades,
    tradeSettings,
    portfolioSummary,
    ...partial,
    lastUpdate: Date.now()
  };
  chrome.storage.local.set({ dashboardState: state });
  chrome.runtime.sendMessage({ type: 'DASHBOARD_BROADCAST', state }).catch(() => {});
}

function setDashboardStatus(dotColor, statusText, reasoning) {
  broadcastDashboardState({ statusDot: dotColor, statusText, reasoning });
}

function broadcastPositions() {
  updateOpenTradesPnL();
  chrome.runtime.sendMessage({
    type: 'POSITIONS_UPDATED',
    openTrades,
    feedbackData: feedbackData.slice(0, 50),
    portfolioSummary: calculatePortfolioSummary()
  }).catch(() => {});
}

// ============================================================
// TRADE SETTINGS
// ============================================================
function updateTradeSettings(newSettings) {
  if (newSettings.tradeMode) tradeSettings.tradeMode = newSettings.tradeMode;
  if (typeof newSettings.positionSize === 'number') tradeSettings.positionSize = Math.max(1, newSettings.positionSize);
  if (typeof newSettings.maxOpenPositions === 'number') tradeSettings.maxOpenPositions = Math.max(1, Math.min(20, newSettings.maxOpenPositions));
  if (typeof newSettings.riskPerTrade === 'number') tradeSettings.riskPerTrade = Math.max(0.5, Math.min(100, newSettings.riskPerTrade));
  chrome.storage.local.set({ tradeSettings });
  logActivity('SETTINGS', `Trade settings updated: mode=${tradeSettings.tradeMode}, size=$${tradeSettings.positionSize}, max=${tradeSettings.maxOpenPositions}`);
  broadcastDashboardState();
}

async function loadTradeSettings() {
  const data = await chrome.storage.local.get(['tradeSettings']);
  if (data.tradeSettings) {
    tradeSettings = { ...tradeSettings, ...data.tradeSettings };
  }
}

// ============================================================
// AUTO-TRADE LOGIC
// ============================================================
function setAutoTradeEnabled(enabled, confidence) {
  isAutoTradeEnabled = !!enabled;
  if (typeof confidence === 'number' && confidence >= 50 && confidence <= 95) {
    minAutoConfidence = confidence;
  }
  chrome.storage.local.set({ autoTradeEnabled: isAutoTradeEnabled, minAutoConfidence });
  logActivity('SYSTEM', isAutoTradeEnabled
    ? `Auto-trade ENABLED (min confidence: ${minAutoConfidence}%)`
    : 'Auto-trade DISABLED');
  broadcastDashboardState({ isAutoTradeEnabled });
  if (isAutoTradeEnabled && window._lastPrediction) {
    maybeExecuteAutoTrade(window._lastPrediction);
  }
}

async function loadAutoTradeSettings() {
  const data = await chrome.storage.local.get(['autoTradeEnabled', 'minAutoConfidence']);
  isAutoTradeEnabled = data.autoTradeEnabled === true;
  if (typeof data.minAutoConfidence === 'number') {
    minAutoConfidence = data.minAutoConfidence;
  }
}

function hasOpenTradeForSymbol() {
  const symbol = getSymbol();
  return openTrades.some(t => t.symbol === symbol && t.status === 'OPEN');
}

function shouldAutoExecute(prediction) {
  if (!isAutoTradeEnabled || !prediction) return { execute: false, reason: 'Auto-trade disabled' };
  if (prediction.signal === 'HOLD') return { execute: false, reason: 'Signal is HOLD' };
  if (!prediction.tp || !prediction.sl) return { execute: false, reason: 'Missing TP/SL levels' };

  const prob = prediction.probability || 0;
  if (prob < minAutoConfidence) return { execute: false, reason: `Confidence ${prob}% < threshold ${minAutoConfidence}%` };
  if (openTrades.filter(t => t.status === 'OPEN').length >= tradeSettings.maxOpenPositions) {
    return { execute: false, reason: `Max open positions (${tradeSettings.maxOpenPositions}) reached` };
  }
  if (hasOpenTradeForSymbol()) return { execute: false, reason: 'Position already open for this symbol' };

  const signalKey = `${getSymbol()}-${prediction.signal}-${prediction.tp}-${prediction.sl}-${prob}`;
  if (lastAutoExecutedSignalId === signalKey) return { execute: false, reason: 'Duplicate signal (already executed)' };

  return { execute: true, reason: 'All checks passed' };
}

function maybeExecuteAutoTrade(prediction) {
  const check = shouldAutoExecute(prediction);

  if (!check.execute) {
    if (isAutoTradeEnabled && prediction && prediction.signal !== 'HOLD') {
      logActivity('AUTO_GATE_BLOCKED', `Auto-trade blocked: ${check.reason}`, {
        signal: prediction.signal, probability: prediction.probability
      });
      broadcastDashboardState({
        prediction: { ...prediction, reasoning: (prediction.reasoning || '') + ` [AUTO: ${check.reason}]` }
      });
    }
    return;
  }

  const signalKey = `${getSymbol()}-${prediction.signal}-${prediction.tp}-${prediction.sl}-${prediction.probability || 0}`;
  lastAutoExecutedSignalId = signalKey;

  logActivity('AUTO_GATE_PASSED', `✅ Auto-trade executing ${prediction.signal} @ ${prediction.probability}% confidence`, {
    signal: prediction.signal, tp: prediction.tp, sl: prediction.sl, probability: prediction.probability
  });

  executeOrder(prediction);
}

// ============================================================
// ORDER EXECUTION ENGINE
// ============================================================
function executeOrder(prediction) {
  if (!prediction || prediction.signal === 'HOLD') return;

  const mode = tradeSettings.tradeMode;

  if (mode === 'simulated') {
    simulateOrder(prediction);
    return;
  }

  if (mode === 'dom') {
    autoFillOrderPanel(prediction);
    return;
  }

  // mode === 'both': try DOM first, fall back to simulated
  const domResult = autoFillOrderPanel(prediction, true);
  // DOM automation is async, so set a timeout fallback
  setTimeout(() => {
    // If the trade wasn't recorded by DOM automation, simulate it
    const signalKey = `${getSymbol()}-${prediction.signal}-${Date.now()}`;
    const recentTrade = openTrades.find(t =>
      t.symbol === getSymbol() && t.type === prediction.signal && (Date.now() - t.time) < 5000
    );
    if (!recentTrade) {
      logActivity('DOM_FALLBACK', 'DOM automation uncertain, creating simulated trade as fallback');
      simulateOrder(prediction);
    }
  }, 3000);
}

function simulateOrder(prediction) {
  const symbol = getSymbol();
  const entryPrice = window._currentPrice || (candleHistory.length > 0 ? candleHistory[candleHistory.length - 1].c : 0);
  const side = prediction.signal.toUpperCase();

  logActivity('SIM_ORDER_PLACED',
    `📝 Simulated ${side} ${symbol} @ ${entryPrice} | TP: ${prediction.tp} | SL: ${prediction.sl} | Size: $${tradeSettings.positionSize}`,
    { symbol, side, entry: entryPrice, tp: prediction.tp, sl: prediction.sl, size: tradeSettings.positionSize }
  );

  recordTrade(prediction, side);
}

// ============================================================
// TRADINGVIEW DOM AUTOMATION
// ============================================================
function autoFillOrderPanel(prediction, returnStatus = false) {
  if (!prediction || prediction.signal === 'HOLD') return false;

  const isBuy = prediction.signal === 'BUY';
  const tpValue = String(prediction.tp || '').replace(/[^0-9.-]/g, '');
  const slValue = String(prediction.sl || '').replace(/[^0-9.-]/g, '');
  const sideText = isBuy ? 'Buy' : 'Sell';
  let stepResults = [];

  logActivity('DOM_CLICK_ATTEMPTED', `🖱️ Attempting DOM automation: ${sideText} order on TradingView`);
  console.log(`TV AI: Attempting to automate ${sideText} order...`);

  // Step 1: Find and click Buy or Sell tab
  const allElements = Array.from(document.querySelectorAll('span, div, button'));
  const tab = allElements.find(el => {
    const text = (el.textContent || '').trim();
    return (text === sideText) && (el.className.includes('button') || el.className.includes('tab') || el.className.includes('item'));
  });

  if (tab) {
    tab.click();
    if (tab.parentElement) tab.parentElement.click();
    stepResults.push({ step: 'Select Side', success: true });
    logActivity('DOM_STEP', `✅ Clicked ${sideText} tab`);
  } else {
    stepResults.push({ step: 'Select Side', success: false });
    logActivity('DOM_STEP', `⚠️ Could not find ${sideText} tab — trying keyboard shortcut`);
    // Fallback: Try keyboard shortcut
    try {
      const key = isBuy ? 'b' : 's';
      document.activeElement?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    } catch (e) { /* ignore */ }
  }

  // Step 2: Enable TP/SL and inject values
  const tryInject = (labelText, targetValue) => {
    if (!targetValue) return false;
    const lowerLabel = labelText.toLowerCase();
    let injected = false;

    const labels = Array.from(document.querySelectorAll('span, div, label, p')).filter(el => {
      const text = (el.textContent || '').toLowerCase();
      return text.includes(lowerLabel) && el.childElementCount === 0;
    });

    for (let label of labels) {
      let container = label.parentElement;
      for (let i = 0; i < 6; i++) {
        if (!container) break;
        const toggle = container.querySelector('input[type="checkbox"], [role="switch"], [class*="switch"], [class*="toggle"], [class*="check-"]');
        const input = container.querySelector('input[type="text"], input[type="number"], input[class*="input-"], [class*="input-"] input');

        if (toggle) {
          const isOff = !toggle.checked && toggle.getAttribute('aria-checked') !== 'true' && !toggle.className.includes('checked');
          if (isOff || !input || input.disabled) {
            toggle.click();
          }
          if (input) {
            const forceSet = () => {
              input.focus();
              const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
              if (nativeSetter) {
                nativeSetter.call(input, targetValue);
              } else {
                input.value = targetValue;
              }
              input.dispatchEvent(new Event('input', { bubbles: true }));
              input.dispatchEvent(new Event('change', { bubbles: true }));
              input.dispatchEvent(new Event('blur', { bubbles: true }));
            };
            forceSet();
            setTimeout(forceSet, 100);
            setTimeout(forceSet, 500);
            injected = true;
            return true;
          }
        }
        container = container.parentElement;
      }
    }

    // Fallback: global search
    if (!injected) {
      const allInputs = Array.from(document.querySelectorAll('input'));
      const fallback = allInputs.find(inp => {
        const attr = ((inp.getAttribute('aria-label') || '') + (inp.getAttribute('name') || '')).toLowerCase();
        return attr.includes(lowerLabel.split(' ')[0]);
      });
      if (fallback) {
        fallback.value = targetValue;
        fallback.dispatchEvent(new Event('input', { bubbles: true }));
        injected = true;
      }
    }
    return injected;
  };

  // Run injection with delay after tab click
  setTimeout(() => {
    const tpOk = tryInject('Take profit', tpValue);
    const slOk = tryInject('Stop loss', slValue);

    if (tpOk) logActivity('DOM_STEP', `✅ Set Take Profit: ${tpValue}`);
    else logActivity('DOM_STEP', `⚠️ Could not set Take Profit input`);

    if (slOk) logActivity('DOM_STEP', `✅ Set Stop Loss: ${slValue}`);
    else logActivity('DOM_STEP', `⚠️ Could not set Stop Loss input`);

    // Step 3: Click execute button
    setTimeout(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      let execBtn = buttons.find(btn => {
        const name = (btn.getAttribute('data-name') || '').toLowerCase();
        return name.includes('place-order') || name.includes('submit');
      });

      if (!execBtn) {
        execBtn = buttons.find(btn => {
          const text = (btn.textContent || '').toLowerCase();
          return text.includes(sideText.toLowerCase()) && (text.includes('market') || text.includes('place') || text.includes('create'));
        });
      }

      if (execBtn && isAutoTradeEnabled) {
        logActivity('DOM_CLICK_SUCCESS', `🎯 Clicking "${execBtn.textContent.trim()}" button`);
        console.log(`TV AI: EXECUTING ${sideText} order now!`);
        recordTrade(prediction, sideText);

        const events = ['mousedown', 'mouseup', 'click'];
        events.forEach(t => execBtn.dispatchEvent(new MouseEvent(t, { bubbles: true, cancelable: true, view: window, buttons: 1 })));
      } else {
        logActivity('DOM_CLICK_FAILED', `❌ Could not find execute button for ${sideText} order`);
      }
    }, 1500);
  }, 300);

  return true;
}

// ============================================================
// POSITION MANAGEMENT
// ============================================================
function closePosition(tradeId) {
  const trade = openTrades.find(t => t.id === tradeId);
  if (!trade) return;

  const cp = window._currentPrice || (candleHistory.length > 0 ? candleHistory[candleHistory.length - 1].c : trade.entry);
  const entry = parseFloat(trade.entry);
  const amount = parseFloat(trade.amount);
  let pnl = 0;

  if (trade.type === 'BUY') {
    pnl = ((cp - entry) / entry) * amount;
  } else {
    pnl = ((entry - cp) / entry) * amount;
  }

  const closedTrade = {
    ...trade,
    status: 'CLOSED',
    closePrice: cp,
    pnl: parseFloat(pnl.toFixed(2)),
    result: pnl >= 0 ? 'win' : 'loss',
    closedAt: Date.now(),
    closedTimestamp: new Date().toLocaleString()
  };

  feedbackData.unshift(closedTrade);
  if (feedbackData.length > 100) feedbackData.pop();
  openTrades = openTrades.filter(t => t.id !== tradeId);

  logActivity(pnl >= 0 ? 'TRADE_WIN' : 'TRADE_LOSS',
    `${pnl >= 0 ? '💰' : '💸'} Closed ${trade.type} ${trade.symbol} @ ${cp} | P&L: $${pnl.toFixed(2)}`,
    closedTrade
  );

  chrome.storage.local.set({ feedbackData, openTrades });
  broadcastPositions();
  notifyHistoryUpdated();
}

function closeAllPositions() {
  const trades = [...openTrades];
  trades.forEach(t => closePosition(t.id));
  logActivity('SYSTEM', `Closed all ${trades.length} positions`);
}

function modifyPosition(tradeId, newTP, newSL) {
  const trade = openTrades.find(t => t.id === tradeId);
  if (!trade) return;

  if (newTP !== undefined) trade.tp = newTP;
  if (newSL !== undefined) trade.sl = newSL;

  logActivity('POSITION_MODIFIED', `✏️ Modified ${trade.type} ${trade.symbol}: TP=${trade.tp}, SL=${trade.sl}`);
  chrome.storage.local.set({ openTrades });
  broadcastPositions();
}

function updateOpenTradesPnL() {
  const cp = window._currentPrice || (candleHistory.length > 0 ? candleHistory[candleHistory.length - 1].c : null);
  if (!cp) return;

  openTrades.forEach(trade => {
    if (trade.status !== 'OPEN') return;
    const entry = parseFloat(trade.entry);
    const amount = parseFloat(trade.amount);
    if (trade.type === 'BUY') {
      trade.livePnL = parseFloat((((cp - entry) / entry) * amount).toFixed(2));
      trade.livePnLPct = parseFloat((((cp - entry) / entry) * 100).toFixed(2));
    } else {
      trade.livePnL = parseFloat((((entry - cp) / entry) * amount).toFixed(2));
      trade.livePnLPct = parseFloat((((entry - cp) / entry) * 100).toFixed(2));
    }
    trade.currentPrice = cp;
    trade.duration = formatDuration(Date.now() - trade.time);
  });
}

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
}

function calculatePortfolioSummary() {
  const openCount = openTrades.filter(t => t.status === 'OPEN').length;
  let unrealizedPnL = 0;
  openTrades.forEach(t => { if (t.livePnL) unrealizedPnL += t.livePnL; });

  let realizedPnL = 0;
  let wins = 0;
  let losses = 0;
  feedbackData.forEach(t => {
    if (t.pnl !== undefined) realizedPnL += t.pnl;
    if (t.result === 'win') wins++;
    else if (t.result === 'loss') losses++;
  });

  const totalTrades = wins + losses;
  const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : '0.0';

  return {
    openCount,
    unrealizedPnL: parseFloat(unrealizedPnL.toFixed(2)),
    realizedPnL: parseFloat(realizedPnL.toFixed(2)),
    totalPnL: parseFloat((unrealizedPnL + realizedPnL).toFixed(2)),
    wins,
    losses,
    totalTrades,
    winRate
  };
}

// ============================================================
// SYMBOL DETECTION
// ============================================================
function getSymbol() {
  // 1. Try TradingView header
  try {
    const selectors = [
      'div[data-name="legend-source-title"] span',
      'div[class*="headerTitle-"] span',
      'div[class*="title-"] > span',
      '#header-toolbar-symbol-search span',
      '[data-name="symbol-name-label"]'
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && el.textContent.trim().length > 1) {
        return el.textContent.trim().replace(/\s+/g, '');
      }
    }
  } catch (e) {}

  // 2. Title fallback
  const titleMatch = document.title.match(/^([A-Z0-9.\/]+)/);
  return titleMatch ? titleMatch[1] : 'UNKNOWN';
}

// ============================================================
// DASHBOARD UPDATE
// ============================================================
function updateDashboard(prediction, triggerPrice = null) {
  window._lastPrediction = prediction;
  window._currentPrice = triggerPrice !== null
    ? triggerPrice
    : (candleHistory.length > 0 ? candleHistory[candleHistory.length - 1].c : null);

  broadcastDashboardState({
    prediction,
    currentPrice: window._currentPrice
  });

  if (prediction.signal !== 'HOLD' && prediction.tp && prediction.sl) {
    try {
      maybeExecuteAutoTrade(prediction);
    } catch (e) {
      console.warn('TV AI: auto trade failed', e);
      logActivity('ERROR', `Auto-trade execution error: ${e.message}`);
    }
  }
}

// ============================================================
// DATA COLLECTION
// ============================================================
function accumulateCandle() {
  const current = scrapeOHLC();
  if (!current) return null;
  const now = Date.now();
  const last = candleHistory[candleHistory.length - 1];
  if (!last || last.c !== current.c || now - last.time >= 5000) {
    candleHistory.push({ ...current, time: now });
    if (candleHistory.length > 500) candleHistory.shift();
  }
  return current;
}

function checkDataStatus() {
  const symbol = getSymbol();

  if (symbol && symbol !== 'UNKNOWN' && symbol !== currentSymbol) {
    console.log(`TV AI: Detected symbol change to ${symbol}. Resetting memory...`);
    logActivity('SYSTEM', `Symbol changed to ${symbol} — resetting state`);
    currentSymbol = symbol;
    candleHistory = [];
    window.hasFirstSignal = false;
    lastPredictionAttempt = 0;
    lastAutoExecutedSignalId = null;
    resetUI();
  }

  const current = accumulateCandle();
  if (current) {
    const dataReady = candleHistory.length >= MIN_CANDLES_FOR_PREDICTION;
    if (!window.hasFirstSignal && !isPredicting) {
      const now = Date.now();
      if (dataReady && now - lastPredictionAttempt >= PREDICTION_COOLDOWN) {
        setDashboardStatus('var(--vibe-green)', 'DATA READY', 'Ready to analyze chart.');
        lastPredictionAttempt = now;
        triggerPrediction();
      } else if (!dataReady) {
        const secsLeft = Math.max(1, (MIN_CANDLES_FOR_PREDICTION - candleHistory.length) * 5);
        setDashboardStatus('orange', `COLLECTING ${candleHistory.length}/${MIN_CANDLES_FOR_PREDICTION}`, `Building price history (~${secsLeft}s)...`);
      }
    }
    broadcastDashboardState({ symbol, currentPrice: current.c });
  } else {
    setDashboardStatus('var(--vibe-red)', 'NO DATA', 'Waiting for Price Data...');
    broadcastDashboardState({ chartConnected: true, symbol: getSymbol() });
  }
}

function resetUI() {
  window._lastPrediction = null;
  setDashboardStatus('orange', 'SWARM INITIALIZING', 'New chart detected. Deploying 29 teams...');
  broadcastDashboardState({ prediction: null });
}

// ============================================================
// SCRAPING FUNCTIONS
// ============================================================
function scrapeOHLC() {
  const legend = document.querySelector('div[data-name="legend-series-item"]') ||
                 document.querySelector('div[class*="legend-"]') ||
                 document.querySelector('.series-l31H9iuA');

  if (!legend) {
    return null;
  }

  const valueElements = Array.from(legend.querySelectorAll('span[class*="valueValue-"]'));

  if (valueElements.length >= 4) {
    const values = valueElements.map(el => parseFloat(el.innerText.replace(/[^0-9.]/g, '')));
    const [o, h, l, c] = values;
    if (!isNaN(c)) return { time: Date.now(), o, h, l, c };
  }

  const allSpans = Array.from(document.querySelectorAll('span[class*="price-"], span[class*="valueValue-"]'));
  for (let span of allSpans) {
    const val = parseFloat(span.innerText.replace(/[^0-9.]/g, ''));
    if (!isNaN(val) && val > 0) {
      return { time: Date.now(), o: val, h: val, l: val, c: val };
    }
  }

  const titleMatch = document.title.match(/[\d,]+\.\d+/);
  if (titleMatch) {
    const val = parseFloat(titleMatch[0].replace(/,/g, ''));
    if (!isNaN(val) && val > 0) {
      return { time: Date.now(), o: val, h: val, l: val, c: val };
    }
  }

  return null;
}

function scrapeNews() {
  const headlines = [];
  const newsElements = document.querySelectorAll(
    '[class*="news-"] a, [class*="headline"] a, [data-name="news"] a, ' +
    '[class*="tickerItem"] span, [class*="news-widget"] a'
  );

  newsElements.forEach(el => {
    const text = el.textContent?.trim();
    if (text && text.length > 15 && text.length < 200 && !headlines.includes(text)) {
      headlines.push(text);
    }
  });

  if (headlines.length === 0) {
    const allText = document.querySelectorAll('[class*="description"], [class*="widget"] div');
    allText.forEach(el => {
      const text = el.textContent?.trim();
      if (text && text.length > 20 && text.length < 200 &&
          /[A-Z]/.test(text[0]) && !text.includes('{') && !text.includes('function')) {
        headlines.push(text);
      }
    });
  }

  return headlines.slice(0, 5);
}

function scrapeTechnicals() {
  const techElements = document.querySelectorAll(
    '[class*="speedometer"] [class*="text"], [class*="gauge"] span, ' +
    '[class*="summary"] [class*="signal"], [data-name="technicals-gauge"]'
  );

  for (const el of techElements) {
    const text = el.textContent?.trim().toUpperCase();
    if (text === 'BUY' || text === 'SELL' || text === 'NEUTRAL' ||
        text === 'STRONG BUY' || text === 'STRONG SELL') {
      return text;
    }
  }
  return null;
}

function scrapePerformance() {
  const perfData = {};
  const perfElements = document.querySelectorAll('[class*="perf"] [class*="value"], [class*="change"]');

  perfElements.forEach(el => {
    const text = el.textContent?.trim();
    if (text && text.includes('%')) {
      const parent = el.closest('[class*="item"]') || el.parentElement;
      const label = parent?.querySelector('[class*="label"], [class*="title"]')?.textContent?.trim();
      if (label) {
        perfData[label] = text;
      }
    }
  });

  const titleMatch = document.title.match(/([\-+]?\d+\.?\d*%)/);
  if (titleMatch && Object.keys(perfData).length === 0) {
    perfData['change'] = titleMatch[1];
  }

  return Object.keys(perfData).length > 0 ? JSON.stringify(perfData) : null;
}

// ============================================================
// PREDICTION LOGIC
// ============================================================
async function triggerPrediction(manual = false) {
  if (!isEnabled || isPredicting) return;
  isPredicting = true;

  const current = scrapeOHLC();
  setDashboardStatus('var(--vibe-blue)', 'AI ANALYZING...', 'TV trade Swarm is analyzing chart...');
  broadcastDashboardState({ isPredicting: true });
  logActivity('SIGNAL_REQUESTED', `🔍 Requesting AI prediction for ${getSymbol()}${manual ? ' (manual)' : ''}`);

  if (!current) {
    setDashboardStatus('var(--vibe-red)', 'DATA MISSING', 'Chart Data Missing');
    isPredicting = false;
    broadcastDashboardState({ isPredicting: false });
    return;
  }

  accumulateCandle();
  const symbol = getSymbol();

  const predictionTimeout = setTimeout(() => {
    if (isPredicting) {
      isPredicting = false;
      setDashboardStatus('var(--vibe-red)', 'TIMEOUT', 'AI Request Timeout. Click refresh to retry.');
      broadcastDashboardState({ isPredicting: false });
      logActivity('ERROR', '⏱️ AI prediction timed out after 95s');
    }
  }, 95000);

  const newsHeadlines = scrapeNews();
  const technicals = scrapeTechnicals();
  const performance = scrapePerformance();

  chrome.runtime.sendMessage({
    type: 'PREDICT',
    data: {
      symbol,
      current,
      history: { candles: candleHistory },
      feedback: feedbackData.slice(-10),
      news: newsHeadlines,
      technicals,
      performance,
      currentTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  }, (response) => {
    clearTimeout(predictionTimeout);
    isPredicting = false;
    broadcastDashboardState({ isPredicting: false });

    if (chrome.runtime.lastError) {
      setDashboardStatus('var(--vibe-red)', 'EXTENSION ERROR', 'Extension Error: ' + chrome.runtime.lastError.message);
      logActivity('ERROR', `Extension error: ${chrome.runtime.lastError.message}`);
      return;
    }

    if (response && response.prediction) {
      window.hasFirstSignal = true;
      const modelName = response.prediction._model || 'AI';
      const signal = response.prediction.signal;
      const prob = response.prediction.probability || 0;

      logActivity('SIGNAL_RECEIVED',
        `${signal === 'BUY' ? '🟢' : signal === 'SELL' ? '🔴' : '🟡'} ${signal} signal @ ${prob}% confidence (${modelName})`,
        { signal, probability: prob, tp: response.prediction.tp, sl: response.prediction.sl, model: modelName }
      );

      setDashboardStatus('var(--vibe-green)', `SIGNAL • ${modelName}`, response.prediction.reasoning || '');
      updateDashboard(response.prediction, current.c);
      trackSignal(response.prediction, current);
    } else {
      const errMsg = response ? response.error : 'Unknown Response Error';
      const isRateLimit = response && response.retryAfter;

      if (isRateLimit) {
        setDashboardStatus('orange', 'RATE LIMITED', `API rate limited. Retrying in ${response.retryAfter}s...`);
        lastPredictionAttempt = Date.now() + (response.retryAfter * 1000) - PREDICTION_COOLDOWN;
        logActivity('RATE_LIMITED', `Rate limited — retrying in ${response.retryAfter}s`);
      } else {
        setDashboardStatus('var(--vibe-red)', 'AI ERROR', 'ERROR: ' + errMsg);
        logActivity('ERROR', `AI error: ${errMsg}`);
      }
    }
  });
}

// ============================================================
// TRADE HISTORY & P&L SYSTEM
// ============================================================
async function loadTradeHistory() {
  const data = await chrome.storage.local.get(['feedbackData', 'openTrades']);
  if (data.feedbackData) feedbackData = data.feedbackData;
  if (data.openTrades) openTrades = data.openTrades;
}
loadTradeHistory();

async function recordTrade(prediction, side) {
  const symbol = getSymbol();
  const entryPrice = window._currentPrice || (candleHistory.length > 0 ? candleHistory[candleHistory.length - 1].c : 0);

  const trade = {
    id: Date.now(),
    time: Date.now(),
    timestamp: new Date().toLocaleString(),
    symbol,
    type: side.toUpperCase(),
    entry: entryPrice,
    tp: prediction.tp,
    sl: prediction.sl,
    amount: String(tradeSettings.positionSize),
    status: 'OPEN',
    pnl: 0,
    livePnL: 0,
    livePnLPct: 0
  };

  openTrades.unshift(trade);
  await chrome.storage.local.set({ openTrades });

  logActivity('TRADE_OPENED',
    `📈 Opened ${side} ${symbol} @ ${entryPrice} | Size: $${tradeSettings.positionSize} | TP: ${prediction.tp} | SL: ${prediction.sl}`,
    trade
  );

  trackSignal(prediction, { time: trade.time, c: entryPrice }, trade.id);
  broadcastPositions();
  notifyHistoryUpdated();
}

function notifyHistoryUpdated() {
  chrome.runtime.sendMessage({ type: 'HISTORY_UPDATED' }).catch(() => {});
}

function trackSignal(prediction, entryData, tradeId = null) {
  const signal = {
    id: tradeId || Date.now(),
    time: entryData.time,
    type: prediction.signal,
    entry: entryData.c,
    tp: prediction.tp,
    sl: prediction.sl,
    resolved: false
  };

  const monitor = setInterval(async () => {
    const live = scrapeOHLC();
    if (!live) return;

    const tp = parseFloat(String(signal.tp).replace(/[^0-9.-]/g, ''));
    const sl = parseFloat(String(signal.sl).replace(/[^0-9.-]/g, ''));

    let isWin = false;
    let isLoss = false;

    if (signal.type === 'BUY') {
      if (live.c >= tp) isWin = true;
      else if (live.c <= sl) isLoss = true;
    } else if (signal.type === 'SELL') {
      if (live.c <= tp) isWin = true;
      else if (live.c >= sl) isLoss = true;
    }

    if (isWin || isLoss) {
      resolveSignal(signal, isWin ? 'win' : 'loss', monitor, tradeId);
    }

    // Safety: stop monitoring after 24 hours
    if (Date.now() - signal.time > 24 * 3600000) {
      logActivity('SYSTEM', `⏰ Position monitor expired after 24h for trade #${signal.id}`);
      clearInterval(monitor);
    }
  }, 5000);
}

async function resolveSignal(signal, result, interval, tradeId) {
  clearInterval(interval);
  lastAutoExecutedSignalId = null;

  const cp = window._currentPrice || (candleHistory.length > 0 ? candleHistory[candleHistory.length - 1].c : signal.entry);
  const entry = parseFloat(signal.entry);

  // If there's a matching open trade, close it properly
  if (tradeId) {
    const trade = openTrades.find(t => t.id === tradeId);
    if (trade) {
      const amount = parseFloat(trade.amount);
      let pnl = 0;
      if (trade.type === 'BUY') pnl = ((cp - entry) / entry) * amount;
      else pnl = ((entry - cp) / entry) * amount;

      trade.pnl = parseFloat(pnl.toFixed(2));
      trade.result = result;
      trade.closePrice = cp;
      trade.status = 'CLOSED';
      trade.closedAt = Date.now();

      feedbackData.unshift({ ...trade });
      openTrades = openTrades.filter(t => t.id !== tradeId);

      logActivity(result === 'win' ? 'TP_HIT' : 'SL_HIT',
        `${result === 'win' ? '🎯 TP HIT' : '🛑 SL HIT'} — ${trade.type} ${trade.symbol} | P&L: $${pnl.toFixed(2)}`,
        trade
      );

      await chrome.storage.local.set({ feedbackData, openTrades });
      broadcastPositions();
      notifyHistoryUpdated();
      return;
    }
  }

  // Fallback: just record in feedback
  const resolvedTrade = { ...signal, result, closedAt: Date.now() };
  feedbackData.unshift(resolvedTrade);
  if (feedbackData.length > 100) feedbackData.pop();
  await chrome.storage.local.set({ feedbackData });

  logActivity(result === 'win' ? 'TP_HIT' : 'SL_HIT',
    `${result === 'win' ? '🎯 TP HIT' : '🛑 SL HIT'} — ${signal.type} signal resolved as ${result}`,
    resolvedTrade
  );

  notifyHistoryUpdated();
}

// ============================================================
// INITIALIZATION
// ============================================================
let isInitialized = false;
const init = () => {
  if (isInitialized) return;
  if (!document.body) {
    setTimeout(init, 100);
    return;
  }

  isInitialized = true;
  console.log('%c TV trade: engine running on chart ', 'background: #8833ff; color: #fff; font-weight: bold; padding: 4px; border-radius: 4px;');

  loadAutoTradeSettings();
  loadTradeSettings();
  loadActivityLog();

  chrome.runtime.sendMessage({ type: 'CHART_READY' }).catch(() => {});
  setDashboardStatus('orange', 'SWARM INITIALIZING', 'Open the dashboard tab to view signals.');
  logActivity('SYSTEM', '🚀 TV trade engine initialized on chart');

  setInterval(checkDataStatus, 5000);

  // Broadcast positions every 10 seconds for live P&L updates
  setInterval(() => {
    if (openTrades.length > 0) broadcastPositions();
  }, 10000);

  setInterval(() => {
    if (!isPredicting && window.hasFirstSignal) triggerPrediction();
  }, PREDICT_INTERVAL_IDLE);

  setInterval(() => {
    if (!isPredicting && isAutoTradeEnabled && window.hasFirstSignal) triggerPrediction();
  }, PREDICT_INTERVAL_AUTO);
};

// Handle SPA navigation and various load states
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  init();
} else {
  window.addEventListener('DOMContentLoaded', init);
  window.addEventListener('load', init);
}

setTimeout(init, 1000);
setTimeout(init, 3000);
setTimeout(init, 5000);
