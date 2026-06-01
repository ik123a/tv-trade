/* TV AI Signal Pro - Background + OpenRouter + Dashboard relay */

let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 10000;
let dashboardTabId = null;

// ══════════════════════════════════════════════════════════
// AUTO-CONFIGURATION: Runs on install, update, and browser restart
// ══════════════════════════════════════════════════════════
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log(`TV Trade: ${details.reason} (v${chrome.runtime.getManifest().version})`);

  // Set default settings if not already configured
  const defaults = {
    aiEnabled: true,
    selectedModel: null,          // Will be set after key detection
    selectedPreset: 'technical_analysis_panel',
    autoTradeEnabled: false,
    minAutoConfidence: 65,
    tradeSettings: { tradeMode: 'dom', positionSize: 1000, maxOpenPositions: 3, riskPerTrade: 2 },
    openTrades: [],
    feedbackData: [],
    activityLog: []
  };

  const existing = await chrome.storage.local.get(Object.keys(defaults));

  // Only set values that don't already exist (preserve user settings on update)
  const toSet = {};
  for (const [key, val] of Object.entries(defaults)) {
    if (existing[key] === undefined || existing[key] === null) {
      toSet[key] = val;
    }
  }

  // Auto-detect and load API key
  if (!existing.apiKey) {
    let foundKey = null;
    // Try NVIDIA key first (user preference)
    try {
      const res = await fetch(chrome.runtime.getURL('NVIDIA_API_KEY.txt'));
      const text = await res.text();
      const key = text.trim();
      if (key.startsWith('nvapi-') && key.length > 20 && !key.includes('YOUR')) {
        foundKey = key;
      }
    } catch (e) {}
    // Fallback to OpenRouter key
    if (!foundKey) {
      try {
        const res = await fetch(chrome.runtime.getURL('OPENROUTER_API_KEY.txt'));
        const text = await res.text();
        const key = text.trim();
        if ((key.startsWith('sk-or-') || key.startsWith('sk-')) && key.length > 20 && !key.includes('YOUR') && !key.includes('PASTE')) {
          foundKey = key;
        }
      } catch (e) {}
    }
    if (foundKey) {
      toSet.apiKey = foundKey;
      // Set appropriate default model based on key type
      if (foundKey.startsWith('nvapi-')) {
        toSet.selectedModel = 'nvidia/llama-3.3-nemotron-super-49b-v1.5';
      } else {
        toSet.selectedModel = 'moonshotai/kimi-k2.6:free';
      }
    }
  } else if (!existing.selectedModel) {
    // Key exists but no model selected
    toSet.selectedModel = existing.apiKey.startsWith('nvapi-')
      ? 'nvidia/llama-3.3-nemotron-super-49b-v1.5'
      : 'moonshotai/kimi-k2.6:free';
  }

  if (Object.keys(toSet).length > 0) {
    await chrome.storage.local.set(toSet);
    console.log('TV Trade: Auto-configured settings:', Object.keys(toSet));
  }
});

// Keep service worker alive on startup
chrome.runtime.onStartup.addListener(() => {
  console.log('TV Trade: Service worker started');
});

async function ensureDashboardOpen() {
  if (dashboardTabId) {
    try {
      await chrome.tabs.get(dashboardTabId);
      return dashboardTabId;
    } catch {
      dashboardTabId = null;
    }
  }
  const existing = await chrome.tabs.query({ url: chrome.runtime.getURL('dashboard.html') });
  if (existing.length) {
    dashboardTabId = existing[0].id;
    return dashboardTabId;
  }
  const tab = await chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  dashboardTabId = tab.id;
  return dashboardTabId;
}

function forwardToChart(message) {
  chrome.tabs.query({ url: ['https://www.tradingview.com/chart/*', 'https://*.tradingview.com/chart/*'] }, (tabs) => {
    tabs.forEach(tab => chrome.tabs.sendMessage(tab.id, message).catch(() => {}));
  });
}

function notifyDashboard(message) {
  chrome.runtime.sendMessage(message).catch(() => {});
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'PREDICT') {
    console.log(`TV AI BG: Received prediction request for ${request.data?.symbol}`);
    const now = Date.now();
    if (now - lastRequestTime < MIN_REQUEST_INTERVAL) {
      const waitSec = Math.ceil((MIN_REQUEST_INTERVAL - (now - lastRequestTime)) / 1000);
      console.log(`TV AI BG: Rate limiting request, wait ${waitSec}s`);
      sendResponse({ error: `Rate limit: wait ${waitSec}s`, retryAfter: waitSec });
      return true;
    }
    lastRequestTime = now;
    handlePrediction(request.data)
      .then(result => {
        console.log(`TV AI BG: Prediction complete for ${request.data?.symbol}`);
        sendResponse(result);
      })
      .catch(err => {
        console.error(`TV AI BG: Prediction error for ${request.data?.symbol}:`, err);
        sendResponse({ error: "Background Error: " + err.message });
      });
    return true;
  }

  if (request.type === 'DASHBOARD_BROADCAST') {
    chrome.storage.local.set({ dashboardState: request.state });
    notifyDashboard({ type: 'DASHBOARD_UPDATE', state: request.state });
    return;
  }

  if (request.type === 'CHART_READY') {
    ensureDashboardOpen();
    return;
  }

  if (request.type === 'TRIGGER_PREDICT') {
    forwardToChart({ type: 'TRIGGER_PREDICT' });
    sendResponse({ ok: true });
    return true;
  }

  if (request.type === 'GET_EXPORT_DATA') {
    forwardToChart({ type: 'GET_EXPORT_DATA' });
    // Response handled by content script via sendResponse chain — use tab query
    chrome.tabs.query({ url: ['https://www.tradingview.com/chart/*', 'https://*.tradingview.com/chart/*'] }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_EXPORT_DATA' }, sendResponse);
      } else {
        sendResponse({ symbol: 'UNKNOWN', candles: [] });
      }
    });
    return true;
  }

  if (request.type === 'TOGGLE_AUTO_TRADE') {
    forwardToChart({ type: 'TOGGLE_AUTO_TRADE', enabled: request.enabled, minConfidence: request.minConfidence });
    return;
  }

  if (request.type === 'TOGGLE_AI') {
    forwardToChart({ type: 'TOGGLE_AI', enabled: request.enabled });
    return;
  }

  if (request.type === 'HISTORY_UPDATED') {
    notifyDashboard({ type: 'HISTORY_UPDATED' });
    return;
  }

  // --- New: Position Management ---
  if (request.type === 'CLOSE_POSITION') {
    chrome.tabs.query({ url: ['https://www.tradingview.com/chart/*', 'https://*.tradingview.com/chart/*'] }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'CLOSE_POSITION', tradeId: request.tradeId }, sendResponse);
      } else sendResponse({ error: 'No chart tab' });
    });
    return true;
  }

  if (request.type === 'MODIFY_POSITION') {
    chrome.tabs.query({ url: ['https://www.tradingview.com/chart/*', 'https://*.tradingview.com/chart/*'] }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'MODIFY_POSITION', tradeId: request.tradeId, newTP: request.newTP, newSL: request.newSL }, sendResponse);
      } else sendResponse({ error: 'No chart tab' });
    });
    return true;
  }

  if (request.type === 'CLOSE_ALL_POSITIONS') {
    chrome.tabs.query({ url: ['https://www.tradingview.com/chart/*', 'https://*.tradingview.com/chart/*'] }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'CLOSE_ALL_POSITIONS' }, sendResponse);
      } else sendResponse({ error: 'No chart tab' });
    });
    return true;
  }

  if (request.type === 'UPDATE_TRADE_SETTINGS') {
    forwardToChart({ type: 'UPDATE_TRADE_SETTINGS', settings: request.settings });
    return;
  }

  if (request.type === 'GET_POSITIONS') {
    chrome.tabs.query({ url: ['https://www.tradingview.com/chart/*', 'https://*.tradingview.com/chart/*'] }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_POSITIONS' }, sendResponse);
      } else sendResponse({ openTrades: [], feedbackData: [] });
    });
    return true;
  }

  if (request.type === 'GET_ACTIVITY_LOG') {
    chrome.tabs.query({ url: ['https://www.tradingview.com/chart/*', 'https://*.tradingview.com/chart/*'] }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'GET_ACTIVITY_LOG' }, sendResponse);
      } else sendResponse({ activityLog: [] });
    });
    return true;
  }

  // Relay activity log and position updates to dashboard
  if (request.type === 'ACTIVITY_LOG_ENTRY') {
    notifyDashboard({ type: 'ACTIVITY_LOG_ENTRY', entry: request.entry });
    return;
  }

  if (request.type === 'POSITIONS_UPDATED') {
    notifyDashboard({ type: 'POSITIONS_UPDATED', openTrades: request.openTrades, feedbackData: request.feedbackData, portfolioSummary: request.portfolioSummary });
    return;
  }
});

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

const MODEL_PRIORITY = [
  "moonshotai/kimi-k2.6:free",
  "deepseek/deepseek-v4-flash",
  "qwen/qwen3-coder:free",
  "nvidia/nemotron-3-super-120b-a12b:free",
  "minimax/minimax-m2.5:free",
  "z-ai/glm-4.5-air:free"
];

function isValidOpenRouterKey(key) {
  return key
    && (key.startsWith('sk-or-') || key.startsWith('sk-'))
    && !key.includes('PASTE_YOUR')
    && key.length > 20;
}

function isValidNvidiaKey(key) {
  return key
    && key.startsWith('nvapi-')
    && key.length > 20;
}

function formatModelLabel(modelId) {
  return modelId.split('/').pop().replace(':free', '');
}

async function handlePrediction(data) {
  try {
    let storage = await chrome.storage.local.get(['apiKey', 'selectedPreset', 'selectedModel']);
    let apiKey = (isValidOpenRouterKey(storage.apiKey) || isValidNvidiaKey(storage.apiKey)) ? storage.apiKey : null;
    let selectedPreset = storage.selectedPreset || "technical_analysis_panel";

    if (!apiKey) {
      if (storage.apiKey) {
        await chrome.storage.local.remove('apiKey');
      }
      try {
        const fileRes = await fetch(chrome.runtime.getURL('OPENROUTER_API_KEY.txt'));
        const text = await fileRes.text();
        apiKey = text.trim();
        if (isValidOpenRouterKey(apiKey) || isValidNvidiaKey(apiKey)) {
          await chrome.storage.local.set({ apiKey });
        } else {
          apiKey = null;
        }
      } catch (e) {}
    }

    if (!apiKey) {
      try {
        const fileRes = await fetch(chrome.runtime.getURL('NVIDIA_API_KEY.txt'));
        const text = await fileRes.text();
        const key = text.trim();
        if (isValidNvidiaKey(key)) {
          apiKey = key;
          await chrome.storage.local.set({ apiKey });
        }
      } catch (e) {}
    }

    if (!apiKey) return { error: "API Key missing. Check OPENROUTER_API_KEY.txt or NVIDIA_API_KEY.txt" };

    const isNvidia = apiKey.startsWith('nvapi-');

    // Build enhanced analysis prompt with news context
    const newsContext = data.news && data.news.length > 0 
      ? `\nRECENT NEWS:\n${data.news.map(n => `- ${n}`).join('\n')}`
      : '';

    const techContext = data.technicals 
      ? `\nTECHNICAL INDICATORS: ${data.technicals}`
      : '';

    const perfContext = data.performance 
      ? `\nPERFORMANCE: ${data.performance}`
      : '';

    // TV trade GLOBAL COMMAND ORCHESTRATOR — FULL SPEC
    const systemPrompt = `You are the TV trade Global Command Orchestrator coordinating 29 Agent Teams and 71 Finance Skills.

═══ YOUR 71 SPECIALIST SKILLS (7 Categories) ═══

DATA SOURCE (6): data-routing, tushare, yfinance, okx-market, akshare, ccxt
STRATEGY (17): strategy-generate, cross-market-strategy, technical-basic, candlestick-pattern, ichimoku-kinko-hyo, elliott-wave, smart-money-concepts, harmonic-patterns, multi-factor, ml-strategy, mean-reversion, momentum, breakout-detection, volume-profile, market-microstructure, pairs-trading, statistical-arbitrage
ANALYSIS (15): factor-research, macro-analysis, global-macro, valuation-model, earnings-forecast, credit-analysis, sentiment-analysis, intermarket-analysis, regime-detection, correlation-analysis, volatility-modeling, term-structure, flow-analysis, positioning-analysis, seasonal-analysis
ASSET CLASS (9): options-strategy, options-advanced, convertible-bond, etf-analysis, asset-allocation, sector-rotation, fixed-income, commodity-analysis, real-estate
CRYPTO (7): perp-funding-basis, liquidation-heatmap, stablecoin-flow, defi-yield, onchain-analysis, whale-tracking, token-economics
FLOW (7): hk-connect-flow, us-etf-flow, edgar-sec-filings, financial-statement, adr-hshare, institutional-flow, dark-pool-analysis
TOOL (8): backtest-diagnose, report-generate, pine-script, tdx-formula, mql5-export, doc-reader, web-reader, risk-calculator

═══ 29 AGENT TEAM PRESETS ═══

${selectedPreset === 'technical_analysis_panel' ? 
'ACTIVE: technical_analysis_panel — Classic TA + Ichimoku + Harmonic + Elliott + SMC → Consensus Signal. Deploy: technical-basic, candlestick, ichimoku, elliott-wave, smart-money-concepts, harmonic-patterns, volume-profile, breakout-detection' :
selectedPreset === 'investment_committee' ?
'ACTIVE: investment_committee — Bull/Bear Debate → Risk Review → PM Final Call. Deploy: macro-analysis, valuation-model, earnings-forecast, sentiment-analysis, factor-research, positioning-analysis' :
selectedPreset === 'crypto_trading_desk' ?
'ACTIVE: crypto_trading_desk — Funding/Basis + Liquidation + Flow → Risk Manager. Deploy: perp-funding-basis, liquidation-heatmap, stablecoin-flow, defi-yield, onchain-analysis, whale-tracking, okx-market, ccxt' :
selectedPreset === 'quant_strategy_desk' ?
'ACTIVE: quant_strategy_desk — Screening + Factor Research → Backtest → Risk Audit. Deploy: factor-research, multi-factor, ml-strategy, statistical-arbitrage, momentum, mean-reversion, volatility-modeling' :
selectedPreset === 'global_equities_desk' ?
'ACTIVE: global_equities_desk — A-share + HK/US + Crypto → Global Strategist. Deploy: yfinance, tushare, hk-connect-flow, us-etf-flow, cross-market-strategy, intermarket-analysis, correlation-analysis' :
selectedPreset === 'macro_rates_fx_desk' ?
'ACTIVE: macro_rates_fx_desk — Rates + FX + Commodity → Macro PM. Deploy: global-macro, macro-analysis, term-structure, fixed-income, commodity-analysis, regime-detection, seasonal-analysis' :
selectedPreset === 'earnings_research_desk' ?
'ACTIVE: earnings_research_desk — Fundamental + Revision + Options → Earnings Strategist. Deploy: earnings-forecast, financial-statement, valuation-model, options-strategy, sentiment-analysis, edgar-sec-filings' :
selectedPreset === 'risk_committee' ?
'ACTIVE: risk_committee — Drawdown + Tail Risk + Regime Review → Sign-off. Deploy: volatility-modeling, regime-detection, correlation-analysis, risk-calculator, positioning-analysis' :
selectedPreset === 'global_allocation_committee' ?
'ACTIVE: global_allocation_committee — A-shares + Crypto + HK/US → Cross-Market Allocation. Deploy: asset-allocation, sector-rotation, cross-market-strategy, etf-analysis, intermarket-analysis' :
selectedPreset === 'options_strategy_desk' ?
'ACTIVE: options_strategy_desk — Greeks + Vol Surface + Structure → Options Strategist. Deploy: options-strategy, options-advanced, volatility-modeling, term-structure' :
selectedPreset === 'defi_yield_desk' ?
'ACTIVE: defi_yield_desk — Yield Farming + LP + Protocol Analysis. Deploy: defi-yield, stablecoin-flow, onchain-analysis, token-economics' :
selectedPreset === 'flow_intelligence_desk' ?
'ACTIVE: flow_intelligence_desk — Institutional + Dark Pool + ETF Flow Analysis. Deploy: institutional-flow, dark-pool-analysis, us-etf-flow, hk-connect-flow, positioning-analysis' :
`ACTIVE: ${selectedPreset} — Full multi-department DAG orchestration with all available skills.`}

═══ ANALYSIS PROTOCOL ═══

1. PRICE ACTION (SMC/ICT): Order blocks, liquidity sweeps, FVGs, break of structure, change of character, premium/discount zones
2. NEWS & SENTIMENT: Impact of current headlines on asset direction and volatility
3. TECHNICAL CONFLUENCE: Classic TA, Ichimoku, Elliott Wave, harmonics, candlestick patterns
4. MACRO & FLOW: Institutional positioning, cross-market correlations, regime context
5. RISK MANAGEMENT: Realistic TP/SL from recent ATR, support/resistance, and risk/reward ratio

═══ OUTPUT FORMAT ═══

You MUST include a "time_horizon" field indicating the EXACT specific local time range the trade will play out (e.g. "10:30 AM - 2:15 PM" or "14:00 - 18:30"). DO NOT output days/hours like "1-3 Days".
Return ONLY a valid JSON object (no markdown, no backticks). probability must be 0-100 integer. Example:
{"signal":"SELL","probability":72,"time_horizon":"10:30 AM - 2:15 PM","tp":97.8,"sl":98.9,"reasoning":"SMC bearish OB + sell technicals + neutral news = high-prob short","departments":[{"name":"Price Action/SMC","status":"Optimized","verdict":"Bearish OB at 98.6","signal":"SELL","icon":"📊"},{"name":"Technical TA","status":"Optimized","verdict":"Ichimoku cloud bearish","signal":"SELL","icon":"📈"},{"name":"News & Sentiment","status":"Analyzed","verdict":"Neutral headlines","signal":"HOLD","icon":"📰"},{"name":"Macro & Flow","status":"Analyzed","verdict":"USD weakness cycle","signal":"SELL","icon":"🌍"},{"name":"Quant/Factor","status":"Validated","verdict":"Momentum negative","signal":"SELL","icon":"🧮"},{"name":"Risk Management","status":"Secured","verdict":"1:2 RR acceptable","signal":"SELL","icon":"🛡️"}],"skills_used":["smc","ichimoku","news_sentiment","macro","momentum","risk_mgmt"]}`;

    let historicalData = data.history.candles || [];
    
    const userContent = `Asset: ${data.symbol} (Current Price: ${data.current?.c || 'unknown'})
Current Local Time: ${data.currentTime || 'Unknown'}
Active Team Preset: ${selectedPreset}
OHLC Data (${historicalData.length} periods): ${JSON.stringify(historicalData.slice(-30))}${newsContext}${techContext}${perfContext}

IMPORTANT: Analyze with available data. If fewer than 20 candles, use current price action and visible chart context — do NOT return HOLD solely due to limited history. Provide BUY/SELL with TP/SL when technical bias is clear.
Previous Signal Feedback: ${JSON.stringify(data.feedback || [])}`;

    const defaultModel = isNvidia ? "nvidia/llama-3.3-nemotron-super-49b-v1.5" : MODEL_PRIORITY[0];
    const userModel = storage.selectedModel || defaultModel;

    let modelsToTry;
    if (isNvidia) {
      const NVIDIA_MODEL_PRIORITY = [
        "nvidia/llama-3.3-nemotron-super-49b-v1.5",
        "deepseek-ai/deepseek-v4-pro",
        "meta/llama-4-maverick-17b-128e-instruct",
        "z-ai/glm-5.1",
        "qwen/qwen3-coder-480b-a35b-instruct",
        "mistralai/mistral-large-3-675b-instruct-2512",
        "nvidia/nemotron-3-super-120b-a12b",
        "meta/llama-3.3-70b-instruct",
        "moonshotai/kimi-k2.6"
      ];
      modelsToTry = userModel === "auto" ? NVIDIA_MODEL_PRIORITY : [userModel];
    } else {
      modelsToTry = userModel === "auto" ? MODEL_PRIORITY : [userModel];
    }

    let lastError = null;
    for (const model of modelsToTry) {
      try {
        console.log(`TV AI BG: Trying ${model}...`);
        const result = await callModel(apiKey, model, systemPrompt, userContent);
        if (result.prediction) {
          result.prediction._model = formatModelLabel(model);
          return result;
        }
        if (result.error && result.error.includes('Rate limited')) {
          return result; // Don't try other models on rate limit
        }
        lastError = result.error;
        console.log(`TV AI BG: ${model} failed: ${result.error}, trying next...`);
      } catch (e) {
        lastError = e.message;
        console.log(`TV AI BG: ${model} threw: ${e.message}, trying next...`);
      }
    }
    return { error: lastError || "All models failed" };
  } catch (error) {
    console.error('TV AI BG Error:', error);
    return { error: "Background Error: " + error.message };
  }
}

async function callModel(apiKey, model, systemPrompt, userContent) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 90000); // 90s per model (Large models can take 40-50s)

  try {
    const requestBody = {
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userContent }
      ],
      temperature: 0.1,
      max_tokens: 1024
    };

    const isNvidia = apiKey.startsWith('nvapi-');
    const apiUrl = isNvidia ? 'https://integrate.api.nvidia.com/v1/chat/completions' : OPENROUTER_API_URL;

    const apiResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(isNvidia ? {} : {
          'HTTP-Referer': 'https://www.tradingview.com',
          'X-Title': 'TV trade AI Swarm'
        })
      },
      signal: controller.signal,
      body: JSON.stringify(requestBody)
    });

    clearTimeout(timeoutId);
    console.log(`TV AI BG: ${model} responded HTTP ${apiResponse.status}`);

    if (apiResponse.status === 429) {
      const retryAfter = apiResponse.headers.get('Retry-After') || '60';
      const waitSec = parseInt(retryAfter) || 60;
      lastRequestTime = Date.now() + (waitSec * 1000) - MIN_REQUEST_INTERVAL;
      return { error: `Rate limited. Retry in ${waitSec}s`, retryAfter: waitSec };
    }

    if (!apiResponse.ok) {
      const errText = await apiResponse.text();
      return { error: `API ${apiResponse.status}: ${errText.substring(0, 100)}` };
    }

    const result = await apiResponse.json();
    if (!result.choices || result.choices.length === 0) {
      return { error: "AI returned empty response" };
    }

    let content = result.choices[0].message.content;
    const reasoning = result.choices[0].message.reasoning;

    let textToParse = content || '';
    if (!textToParse.trim() && reasoning) {
      textToParse = reasoning;
    }

    textToParse = textToParse.replace(/```json/g, '').replace(/```/g, '').trim();

    const jsonMatch = textToParse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        return { prediction: JSON.parse(jsonMatch[0]) };
      } catch (e) {
        return { error: "JSON parse failed from " + model };
      }
    }

    if (result.choices[0].finish_reason === 'length') {
      return { error: "Response truncated" };
    }

    return { error: "No valid JSON in response" };
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') return { error: `${model} timed out (90s)` };
    return { error: error.message };
  }
}
