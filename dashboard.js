/* TV trade Dashboard — full-page UI synced with TradingView content script */

let feedbackData = [];
let openTrades = [];
let activityLog = [];
let isAutoTradeEnabled = false;
let minAutoConfidence = 65;
let lastPrediction = null;
let currentPrice = null;
let tradeSettings = { tradeMode: 'both', positionSize: 1000, maxOpenPositions: 3 };

function $(id) { return document.getElementById(id); }

function downloadFile(content, filename) {
  const blob = new Blob([content], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function applyAutoTradeUI() {
  const btn = $('tv-ai-autotrade-btn');
  if (!btn) return;
  if (isAutoTradeEnabled) {
    btn.innerText = 'AUTO: ON';
    btn.style.color = 'var(--vibe-bg)';
    btn.style.background = 'var(--vibe-red)';
    btn.style.borderColor = 'var(--vibe-red)';
  } else {
    btn.innerText = 'AUTO: OFF';
    btn.style.color = 'var(--vibe-text)';
    btn.style.background = 'transparent';
    btn.style.borderColor = 'var(--vibe-border)';
  }
}

function setAutoTradeEnabled(enabled) {
  isAutoTradeEnabled = !!enabled;
  chrome.storage.local.set({ autoTradeEnabled: isAutoTradeEnabled, minAutoConfidence });
  applyAutoTradeUI();
  const toggle = $('auto-trade-toggle');
  if (toggle) toggle.checked = isAutoTradeEnabled;
  chrome.runtime.sendMessage({ type: 'TOGGLE_AUTO_TRADE', enabled: isAutoTradeEnabled, minConfidence: minAutoConfidence });
}

function updateInvestmentCalc() {
  if (!lastPrediction || !currentPrice) return;
  const pred = lastPrediction;
  const cp = parseFloat(currentPrice);
  const amount = parseFloat($('tv-ai-invest-amount')?.value) || 0;
  const pctEl = $('tv-ai-expected-pct');
  const profEl = $('tv-ai-expected-profit');
  const riskEl = $('tv-ai-expected-risk');
  const tp = parseFloat(String(pred.tp).replace(/[^0-9.-]/g, ''));
  const sl = parseFloat(String(pred.sl).replace(/[^0-9.-]/g, ''));
  if (amount <= 0 || isNaN(cp) || isNaN(tp) || isNaN(sl)) {
    if (pctEl) pctEl.innerText = '--%';
    if (profEl) profEl.innerText = '$--';
    if (riskEl) riskEl.innerText = '$--';
    return;
  }
  let pctReturn = 0, pctRisk = 0;
  const sig = String(pred.signal).toUpperCase();
  if (sig === 'BUY') { pctReturn = ((tp - cp) / cp) * 100; pctRisk = ((cp - sl) / cp) * 100; }
  else if (sig === 'SELL') { pctReturn = ((cp - tp) / cp) * 100; pctRisk = ((sl - cp) / cp) * 100; }
  if (pctEl) { pctEl.innerText = pctReturn.toFixed(2) + '%'; pctEl.style.color = pctReturn > 0 ? 'var(--vibe-green)' : 'var(--vibe-text-dim)'; }
  if (profEl) profEl.innerText = '$' + (amount * (pctReturn / 100)).toFixed(2);
  if (riskEl) riskEl.innerText = '$' + (amount * (pctRisk / 100)).toFixed(2);
}

function updateDashboard(prediction, price) {
  if (!prediction) return;
  lastPrediction = prediction;
  if (price != null) currentPrice = price;
  const signalDisplay = $('tv-ai-signal-display');
  const probVal = $('tv-ai-prob');
  const probBar = $('tv-ai-prob-bar');
  const tpVal = $('tv-ai-tp');
  const slVal = $('tv-ai-sl');
  const reasoningText = $('tv-ai-reasoning');
  const skillsUsedEl = $('tv-ai-skills-used');
  const tpslSection = $('tv-ai-tpsl-section');
  const investSection = $('tv-ai-invest-section');

  if (signalDisplay) {
    signalDisplay.innerText = prediction.signal;
    const colors = { BUY: '#00ffa3', SELL: '#ff3b3b', HOLD: '#ffaa00' };
    const c = colors[prediction.signal] || '#ccc';
    signalDisplay.style.background = `linear-gradient(to bottom, ${c}, ${c}88)`;
    signalDisplay.style.webkitBackgroundClip = 'text';
    signalDisplay.style.webkitTextFillColor = 'transparent';
  }

  const prob = prediction.probability || 0;
  if (probVal) probVal.innerText = prob + '%';
  if (probBar) probBar.style.width = prob + '%';

  if (tpVal) tpVal.innerText = prediction.tp || '--';
  if (slVal) slVal.innerText = prediction.sl || '--';

  if (prediction.signal !== 'HOLD' && prediction.tp && prediction.sl) {
    if (tpslSection) tpslSection.style.display = 'grid';
    if (investSection) investSection.style.display = 'block';
    updateInvestmentCalc();
  }

  if (reasoningText) reasoningText.innerText = prediction.reasoning || '';

  if (skillsUsedEl) {
    const skills = prediction.skillsUsed || [];
    skillsUsedEl.innerHTML = skills.map(s =>
      `<span class="skill-tag" style="background:rgba(136,51,255,0.1);border-color:rgba(136,51,255,0.3);color:var(--vibe-accent);font-size:10px;">${s}</span>`
    ).join('');
  }
}

function setStatus(dotColor, statusText, reasoning) {
  const dot = $('tv-ai-status-dot');
  const text = $('tv-ai-status-text');
  const rsn = $('tv-ai-reasoning');
  if (dot) dot.style.background = dotColor;
  if (text) text.innerText = statusText;
  if (rsn && reasoning !== undefined) rsn.innerText = reasoning;
}

function resetUI(preserveReasoning = false) {
  lastPrediction = null;
  const el = (id, text) => { const e = $(id); if (e) e.innerText = text; };
  el('tv-ai-signal-display', '--');
  el('tv-ai-prob', '--%');
  el('tv-ai-tp', '--');
  el('tv-ai-sl', '--');
  const bar = $('tv-ai-prob-bar');
  if (bar) bar.style.width = '0%';
  if (!preserveReasoning) el('tv-ai-reasoning', 'Deploying 29 Agent Teams with 71 Skills…');
}

function setChartConnection(connected, symbol, price) {
  const dot = $('chart-connection-dot');
  const text = $('chart-connection-text');
  if (dot) {
    dot.classList.toggle('connected', connected);
  }
  if (text) {
    text.innerText = connected
      ? `Connected • ${symbol || 'chart'}`
      : 'Open a TradingView chart tab to connect';
  }
  if ($('dashboard-symbol')) $('dashboard-symbol').innerText = symbol || '—';
  if ($('dashboard-price') && price) $('dashboard-price').innerText = String(price);
}

// ============================================================
// PORTFOLIO SUMMARY BAR
// ============================================================
function updatePortfolioBar(summary) {
  if (!summary) return;
  const pnlClass = (val) => val > 0 ? 'positive' : val < 0 ? 'negative' : '';
  const pnlStr = (val) => (val >= 0 ? '+$' : '-$') + Math.abs(val).toFixed(2);

  const el = (id, text, cls) => {
    const e = $(id);
    if (!e) return;
    e.innerText = text;
    e.className = 'portfolio-value ' + (cls || '');
  };

  el('port-open-count', summary.openCount);
  el('port-unrealized-pnl', pnlStr(summary.unrealizedPnL), pnlClass(summary.unrealizedPnL));
  el('port-realized-pnl', pnlStr(summary.realizedPnL), pnlClass(summary.realizedPnL));
  el('port-total-pnl', pnlStr(summary.totalPnL), pnlClass(summary.totalPnL));
  el('port-win-rate', summary.winRate + '%');
  el('port-wl', `${summary.wins} / ${summary.losses}`);
}

// ============================================================
// OPEN POSITIONS TABLE
// ============================================================
function renderOpenPositions() {
  const body = $('open-positions-body');
  if (!body) return;

  const openOnly = openTrades.filter(t => t.status === 'OPEN');
  if (openOnly.length === 0) {
    body.innerHTML = '<tr class="empty-row"><td colspan="12">No open positions — enable auto-trade to start</td></tr>';
    return;
  }

  body.innerHTML = openOnly.map(t => {
    const pnl = t.livePnL || 0;
    const pnlPct = t.livePnLPct || 0;
    const pnlClass = pnl >= 0 ? 'pnl-positive' : 'pnl-negative';
    const sideClass = t.type === 'BUY' ? 'side-buy' : 'side-sell';
    return `<tr>
      <td>${t.timestamp || new Date(t.time).toLocaleTimeString()}</td>
      <td><strong>${t.symbol}</strong></td>
      <td class="${sideClass}">${t.type}</td>
      <td>${t.entry}</td>
      <td>${t.currentPrice || '—'}</td>
      <td>$${t.amount}</td>
      <td class="${pnlClass}">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</td>
      <td class="${pnlClass}">${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%</td>
      <td>${t.tp || '—'}</td>
      <td>${t.sl || '—'}</td>
      <td>${t.duration || '—'}</td>
      <td><button class="close-trade-btn" data-trade-id="${t.id}">Close</button></td>
    </tr>`;
  }).join('');

  body.querySelectorAll('.close-trade-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tradeId = parseInt(btn.dataset.tradeId);
      chrome.runtime.sendMessage({ type: 'CLOSE_POSITION', tradeId });
    });
  });
}

// ============================================================
// ACTIVITY FEED
// ============================================================
function getActivityCategory(type) {
  const map = {
    'SIGNAL_REQUESTED': 'signal', 'SIGNAL_RECEIVED': 'signal',
    'TRADE_OPENED': 'trade', 'SIM_ORDER_PLACED': 'trade', 'TRADE_WIN': 'win', 'TRADE_LOSS': 'loss',
    'TP_HIT': 'win', 'SL_HIT': 'loss', 'POSITION_CLOSED': 'trade',
    'AUTO_GATE_PASSED': 'auto', 'AUTO_GATE_BLOCKED': 'auto',
    'DOM_CLICK_ATTEMPTED': 'auto', 'DOM_CLICK_SUCCESS': 'auto', 'DOM_CLICK_FAILED': 'auto',
    'DOM_STEP': 'auto', 'DOM_FALLBACK': 'auto',
    'ERROR': 'error', 'RATE_LIMITED': 'error',
    'SYSTEM': 'system', 'SETTINGS': 'system', 'POSITION_MODIFIED': 'system'
  };
  return map[type] || 'system';
}

function renderActivityFeed(filter = 'all') {
  const feed = $('activity-feed');
  if (!feed) return;

  let filtered = activityLog;
  if (filter !== 'all') {
    filtered = activityLog.filter(e => {
      const cat = getActivityCategory(e.type);
      if (filter === 'signal') return cat === 'signal';
      if (filter === 'trade') return ['trade', 'win', 'loss'].includes(cat);
      if (filter === 'auto') return cat === 'auto';
      if (filter === 'system') return cat === 'system';
      if (filter === 'error') return cat === 'error';
      return true;
    });
  }

  if (filtered.length === 0) {
    feed.innerHTML = '<div class="activity-empty">No activity matching this filter</div>';
    return;
  }

  feed.innerHTML = filtered.slice(0, 100).map(entry => {
    const cat = getActivityCategory(entry.type);
    return `<div class="activity-entry type-${cat}">
      <span class="activity-time">${entry.timestamp}</span>
      <span class="activity-badge">${entry.type.replace(/_/g, ' ')}</span>
      <span class="activity-msg">${entry.message}</span>
    </div>`;
  }).join('');
}

function addActivityEntry(entry) {
  activityLog.unshift(entry);
  if (activityLog.length > 200) activityLog.pop();
  // Only re-render if activity tab is visible
  const activityView = $('vibe-view-activity');
  if (activityView && activityView.style.display !== 'none') {
    const filter = $('activity-filter')?.value || 'all';
    renderActivityFeed(filter);
  }
}

// ============================================================
// TRADE LOG TABLE
// ============================================================
function renderTradeLog() {
  const body = $('tradelog-body');
  const summary = $('tradelog-summary');
  if (!body) return;

  if (feedbackData.length === 0) {
    body.innerHTML = '<tr class="empty-row"><td colspan="15">No completed trades yet — trades appear here when TP/SL is hit or positions are closed</td></tr>';
    if (summary) summary.innerHTML = '';
    return;
  }

  // Calculate summary stats
  let totalPnL = 0, wins = 0, losses = 0, biggestWin = 0, biggestLoss = 0, totalDuration = 0;
  feedbackData.forEach(t => {
    const pnl = t.pnl || 0;
    totalPnL += pnl;
    if (t.result === 'win') { wins++; if (pnl > biggestWin) biggestWin = pnl; }
    else if (t.result === 'loss') { losses++; if (pnl < biggestLoss) biggestLoss = pnl; }
    if (t.closedAt && t.time) totalDuration += (t.closedAt - t.time);
  });

  const totalTrades = wins + losses;
  const winRate = totalTrades > 0 ? ((wins / totalTrades) * 100).toFixed(1) : '0';
  const avgDuration = totalTrades > 0 ? formatDuration(totalDuration / totalTrades) : '—';
  const avgPnL = totalTrades > 0 ? (totalPnL / totalTrades).toFixed(2) : '0';
  const pnlClass = (v) => v >= 0 ? 'pnl-positive' : 'pnl-negative';

  if (summary) {
    summary.innerHTML = `
      <div class="tradelog-stat"><div class="tradelog-stat-label">Total Trades</div><div class="tradelog-stat-value">${totalTrades}</div></div>
      <div class="tradelog-stat"><div class="tradelog-stat-label">Win Rate</div><div class="tradelog-stat-value ${pnlClass(wins)}">${winRate}%</div></div>
      <div class="tradelog-stat"><div class="tradelog-stat-label">Total P&L</div><div class="tradelog-stat-value ${pnlClass(totalPnL)}">${totalPnL >= 0 ? '+' : ''}$${totalPnL.toFixed(2)}</div></div>
      <div class="tradelog-stat"><div class="tradelog-stat-label">Avg P&L</div><div class="tradelog-stat-value ${pnlClass(avgPnL)}">${avgPnL >= 0 ? '+' : ''}$${avgPnL}</div></div>
      <div class="tradelog-stat"><div class="tradelog-stat-label">Biggest Win</div><div class="tradelog-stat-value pnl-positive">+$${biggestWin.toFixed(2)}</div></div>
      <div class="tradelog-stat"><div class="tradelog-stat-label">Biggest Loss</div><div class="tradelog-stat-value pnl-negative">-$${Math.abs(biggestLoss).toFixed(2)}</div></div>
      <div class="tradelog-stat"><div class="tradelog-stat-label">Avg Duration</div><div class="tradelog-stat-value">${avgDuration}</div></div>
      <div class="tradelog-stat"><div class="tradelog-stat-label">W / L</div><div class="tradelog-stat-value">${wins} / ${losses}</div></div>
    `;
  }

  body.innerHTML = feedbackData.map((t, i) => {
    const pnl = t.pnl || 0;
    const entry = parseFloat(t.entry) || 0;
    const exit = t.closePrice || '—';
    const pnlPct = entry > 0 && pnl !== 0 ? ((pnl / parseFloat(t.amount || 1000)) * 100).toFixed(2) : '0';
    const dur = t.closedAt && t.time ? formatDuration(t.closedAt - t.time) : '—';
    const exitReason = t.result === 'win' ? 'TP Hit' : t.result === 'loss' ? 'SL Hit' : 'Manual';
    const resultClass = t.result === 'win' ? 'result-win' : 'result-loss';
    const pnlCls = pnl >= 0 ? 'pnl-positive' : 'pnl-negative';
    const sideClass = t.type === 'BUY' ? 'side-buy' : 'side-sell';
    const opened = t.timestamp || new Date(t.time).toLocaleString();
    const closed = t.closedTimestamp || (t.closedAt ? new Date(t.closedAt).toLocaleString() : '—');

    return `<tr>
      <td>${feedbackData.length - i}</td>
      <td>${opened}</td>
      <td>${closed}</td>
      <td><strong>${t.symbol || '—'}</strong></td>
      <td class="${sideClass}">${t.type || '—'}</td>
      <td>${entry}</td>
      <td>${exit}</td>
      <td>$${t.amount || '1000'}</td>
      <td class="${pnlCls}">${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}</td>
      <td class="${pnlCls}">${pnlPct >= 0 ? '+' : ''}${pnlPct}%</td>
      <td><span class="${resultClass}">${t.result || '—'}</span></td>
      <td>${dur}</td>
      <td>${t.tp || '—'}</td>
      <td>${t.sl || '—'}</td>
      <td>${exitReason}</td>
    </tr>`;
  }).join('');
}

function formatDuration(ms) {
  if (!ms || ms <= 0) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  const d = Math.floor(h / 24);
  return `${d}d ${h % 24}h`;
}

// ============================================================
// STATE APPLICATION
// ============================================================
function applyState(state) {
  if (!state) return;
  setChartConnection(state.chartConnected !== false, state.symbol, state.currentPrice);
  if (state.statusDot || state.statusText) {
    setStatus(state.statusDot || 'orange', state.statusText || '—', state.reasoning);
  }
  if (state.prediction) updateDashboard(state.prediction, state.currentPrice);
  else if (state.prediction === null) resetUI(!!(state.statusDot || state.statusText));
  if (state.currentPrice) currentPrice = state.currentPrice;
  if (typeof state.isAutoTradeEnabled === 'boolean') {
    isAutoTradeEnabled = state.isAutoTradeEnabled;
    applyAutoTradeUI();
  }
  if (state.openTrades) {
    openTrades = state.openTrades;
    renderOpenPositions();
  }
  if (state.portfolioSummary) {
    updatePortfolioBar(state.portfolioSummary);
  }
  if (state.tradeSettings) {
    tradeSettings = state.tradeSettings;
    applyTradeSettingsUI();
  }
}

// ============================================================
// TRADE HISTORY (legacy tab)
// ============================================================
async function loadTradeHistory() {
  const data = await chrome.storage.local.get(['feedbackData', 'openTrades', 'autoTradeEnabled', 'minAutoConfidence', 'dashboardState', 'activityLog', 'tradeSettings']);
  feedbackData = data.feedbackData || [];
  openTrades = data.openTrades || [];
  activityLog = data.activityLog || [];
  isAutoTradeEnabled = data.autoTradeEnabled === true;
  if (typeof data.minAutoConfidence === 'number') minAutoConfidence = data.minAutoConfidence;
  if (data.tradeSettings) tradeSettings = { ...tradeSettings, ...data.tradeSettings };
  applyAutoTradeUI();
  applyTradeSettingsUI();
  if (data.dashboardState) applyState(data.dashboardState);
  renderHistoryTab();
  renderOpenPositions();
  renderTradeLog();
  renderActivityFeed();
}

function drawEquityCurve(canvas, data) {
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  if (data.length < 2) return;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const padding = 10;
  const usableH = h - padding * 2;
  const stepX = w / (data.length - 1);
  ctx.beginPath();
  ctx.moveTo(0, h - padding - ((data[0] - min) / range) * usableH);
  for (let i = 1; i < data.length; i++) {
    ctx.lineTo(i * stepX, h - padding - ((data[i] - min) / range) * usableH);
  }
  ctx.strokeStyle = data[data.length - 1] >= 0 ? '#00e676' : '#ff3b3b';
  ctx.lineWidth = 2;
  ctx.stroke();
}

function renderHistoryTab() {
  const pnlEl = $('vibe-history-pnl');
  const winrateEl = $('vibe-history-winrate');
  const logEl = $('vibe-history-log');
  const canvas = $('vibe-history-chart');
  if (!logEl) return;
  const baseAmount = parseFloat($('tv-ai-invest-amount')?.value) || 1000;
  let cumulativePnl = 0, wins = 0;
  const pnlHistory = [0];
  logEl.innerHTML = '';
  if (feedbackData.length === 0 && openTrades.length === 0) {
    logEl.innerHTML = '<div style="text-align:center;padding:12px;color:var(--vibe-text-dim);font-size:11px;">No trades yet</div>';
    if (pnlEl) pnlEl.innerText = '$0.00';
    if (winrateEl) winrateEl.innerText = '0%';
    drawEquityCurve(canvas, pnlHistory);
    return;
  }
  feedbackData.forEach((trade) => {
    const isWin = trade.result === 'win';
    if (isWin) wins++;
    if (trade.pnl !== undefined) { cumulativePnl += trade.pnl; }
    else {
      const tp = parseFloat(String(trade.tp).replace(/[^0-9.-]/g, ''));
      const sl = parseFloat(String(trade.sl).replace(/[^0-9.-]/g, ''));
      const entry = parseFloat(trade.entry);
      let pctResult = 0;
      if (trade.type === 'BUY') pctResult = isWin ? ((tp - entry) / entry) : ((sl - entry) / entry);
      else if (trade.type === 'SELL') pctResult = isWin ? ((entry - tp) / entry) : ((entry - sl) / entry);
      cumulativePnl += baseAmount * pctResult;
    }
    pnlHistory.push(cumulativePnl);
  });
  if (pnlEl) {
    pnlEl.innerText = (cumulativePnl >= 0 ? '+' : '') + '$' + cumulativePnl.toFixed(2);
    pnlEl.style.color = cumulativePnl >= 0 ? 'var(--vibe-green)' : 'var(--vibe-red)';
  }
  if (winrateEl) winrateEl.innerText = feedbackData.length ? ((wins / feedbackData.length) * 100).toFixed(0) + '%' : '0%';
  drawEquityCurve(canvas, pnlHistory);
  const countEl = $('feedback-count');
  if (countEl) countEl.innerText = feedbackData.length;
  const winRateEl = $('vibe-win-rate');
  if (winRateEl && feedbackData.length) winRateEl.innerText = ((wins / feedbackData.length) * 100).toFixed(1) + '%';

  [...openTrades].reverse().forEach(trade => {
    const row = document.createElement('div');
    row.style.cssText = 'background:rgba(0,209,255,0.05);border-left:2px solid var(--vibe-blue);padding:8px;border-radius:6px;margin-bottom:6px;font-size:11px;display:flex;justify-content:space-between;';
    row.innerHTML = `<span><b>${trade.type}</b> ${trade.symbol}</span><span style="color:var(--vibe-blue)">OPEN</span>`;
    logEl.appendChild(row);
  });

  [...feedbackData].reverse().forEach(trade => {
    const isWin = trade.result === 'win';
    const row = document.createElement('div');
    row.style.cssText = `background:rgba(255,255,255,0.03);border-left:2px solid ${isWin ? 'var(--vibe-green)' : 'var(--vibe-red)'};padding:8px;border-radius:6px;margin-bottom:6px;font-size:11px;display:flex;justify-content:space-between;`;
    const pnlText = trade.pnl !== undefined ? ` ($${trade.pnl >= 0 ? '+' : ''}${trade.pnl.toFixed(2)})` : '';
    row.innerHTML = `<span>${trade.type} ${trade.symbol || ''}${pnlText}</span><span style="color:${isWin ? 'var(--vibe-green)' : 'var(--vibe-red)'}">${isWin ? 'WIN' : 'LOSS'}</span>`;
    logEl.appendChild(row);
  });
}

// ============================================================
// TRADE SETTINGS UI
// ============================================================
function applyTradeSettingsUI() {
  const modeSelect = $('trade-mode-select');
  const sizeInput = $('position-size');
  const maxInput = $('max-positions');
  if (modeSelect) modeSelect.value = tradeSettings.tradeMode;
  if (sizeInput) sizeInput.value = tradeSettings.positionSize;
  if (maxInput) maxInput.value = tradeSettings.maxOpenPositions;
}

function initTradeSettings() {
  $('trade-mode-select')?.addEventListener('change', (e) => {
    tradeSettings.tradeMode = e.target.value;
    chrome.runtime.sendMessage({ type: 'UPDATE_TRADE_SETTINGS', settings: { tradeMode: e.target.value } });
    chrome.storage.local.set({ tradeSettings });
  });
  $('position-size')?.addEventListener('change', (e) => {
    tradeSettings.positionSize = parseInt(e.target.value, 10) || 1000;
    chrome.runtime.sendMessage({ type: 'UPDATE_TRADE_SETTINGS', settings: { positionSize: tradeSettings.positionSize } });
    chrome.storage.local.set({ tradeSettings });
  });
  $('max-positions')?.addEventListener('change', (e) => {
    tradeSettings.maxOpenPositions = parseInt(e.target.value, 10) || 3;
    chrome.runtime.sendMessage({ type: 'UPDATE_TRADE_SETTINGS', settings: { maxOpenPositions: tradeSettings.maxOpenPositions } });
    chrome.storage.local.set({ tradeSettings });
  });
}

// ============================================================
// CSV/JSON EXPORT
// ============================================================
function exportTradeLogCSV() {
  if (feedbackData.length === 0) return;
  const headers = ['#', 'Opened', 'Closed', 'Symbol', 'Side', 'Entry', 'Exit', 'Size', 'P&L $', 'P&L %', 'Result', 'Duration', 'TP', 'SL', 'Exit Reason'];
  const rows = feedbackData.map((t, i) => {
    const pnl = t.pnl || 0;
    const entry = parseFloat(t.entry) || 0;
    const pnlPct = entry > 0 ? ((pnl / parseFloat(t.amount || 1000)) * 100).toFixed(2) : '0';
    const dur = t.closedAt && t.time ? formatDuration(t.closedAt - t.time) : '';
    const exitReason = t.result === 'win' ? 'TP Hit' : t.result === 'loss' ? 'SL Hit' : 'Manual';
    return [feedbackData.length - i, t.timestamp || '', t.closedTimestamp || '', t.symbol || '', t.type || '', entry, t.closePrice || '', t.amount || 1000, pnl.toFixed(2), pnlPct, t.result || '', dur, t.tp || '', t.sl || '', exitReason].join(',');
  });
  downloadFile([headers.join(','), ...rows].join('\n'), `TVtrade_tradelog_${new Date().toISOString().slice(0, 10)}.csv`);
}

function exportTradeLogJSON() {
  if (feedbackData.length === 0) return;
  downloadFile(JSON.stringify({ trades: feedbackData, exported: new Date().toISOString() }, null, 2), `TVtrade_tradelog_${new Date().toISOString().slice(0, 10)}.json`);
}

// ============================================================
// CATALOGS & PRESETS
// ============================================================
function highlightActivePreset(presetId) {
  document.querySelectorAll('.team-card').forEach(card => {
    card.classList.toggle('active', card.dataset.preset === presetId);
  });
  const label = $('tv-ai-active-preset');
  if (label) label.innerText = presetId || 'technical_analysis_panel';
}

function renderCatalogs() {
  const skillCount = countSkills();
  const teamCount = countTeams();
  const engineCount = VIBE_CATALOG.engines.length;
  ['stat-skills', 'footer-skills'].forEach(id => { const e = $(id); if (e) e.innerText = skillCount; });
  ['stat-teams', 'footer-teams'].forEach(id => { const e = $(id); if (e) e.innerText = teamCount; });
  ['stat-engines', 'footer-engines'].forEach(id => { const e = $(id); if (e) e.innerText = engineCount; });

  const skillsEl = $('skills-catalog');
  if (skillsEl) {
    skillsEl.innerHTML = VIBE_CATALOG.skills.map(group => `
      <div class="skill-group">
        <div class="skill-group-header" style="color:${group.color}">${group.icon} ${group.cat} (${group.items.length})</div>
        <div class="skill-tags">${group.items.map(s =>
          `<span class="skill-tag" style="background:${group.color}15;border-color:${group.color}40;color:${group.color}">${s}</span>`
        ).join('')}</div>
      </div>`).join('');
  }

  const teamsEl = $('teams-catalog');
  if (teamsEl) {
    teamsEl.innerHTML = VIBE_CATALOG.teams.map(group => `
      <div class="catalog-group">
        <div class="catalog-group-title">${group.cat} (${group.items.length})</div>
        <div class="catalog-grid">${group.items.map(t => `
          <div class="team-card" data-preset="${t.id}">
            <div class="team-card-head"><span>${t.icon}</span><span>${t.name}</span></div>
            <div class="team-card-id">${t.id}</div>
          </div>`).join('')}</div>
      </div>`).join('');
    teamsEl.querySelectorAll('.team-card').forEach(card => {
      card.addEventListener('click', () => {
        const preset = card.dataset.preset;
        const sel = $('preset-select');
        if (sel) sel.value = preset;
        chrome.storage.local.set({ selectedPreset: preset });
        highlightActivePreset(preset);
      });
    });
  }

  const enginesEl = $('engines-catalog');
  const sidebarEngines = $('engines-sidebar');
  const engineHtml = (compact) => VIBE_CATALOG.engines.map(e => compact
    ? `<div class="engine-mini-item"><span>${e.icon}</span><span>${e.name}</span></div>`
    : `<div class="engine-card"><div class="engine-card-icon">${e.icon}</div><div class="engine-card-name">${e.name}</div><div class="engine-card-desc">${e.desc}</div></div>`
  ).join('');
  if (enginesEl) enginesEl.innerHTML = engineHtml(false);
  if (sidebarEngines) sidebarEngines.innerHTML = `<h3>7 Backtest Engines</h3>${engineHtml(true)}`;
}

function initSettings() {
  const modelSelect = $('model-select');
  const presetSelect = $('preset-select');
  if (!modelSelect || !presetSelect) return;
  presetSelect.innerHTML = VIBE_CATALOG.teams.map(g =>
    `<optgroup label="${g.cat}">${g.items.map(t =>
      `<option value="${t.id}">${t.icon} ${t.name}</option>`
    ).join('')}</optgroup>`
  ).join('');

  chrome.storage.local.get(['selectedModel', 'selectedPreset', 'autoTradeEnabled', 'minAutoConfidence', 'apiKey'], (data) => {
    const isNvidia = data.apiKey && data.apiKey.startsWith('nvapi-');
    let models, defaultModel;
    if (isNvidia) {
      models = [
        { v: 'nvidia/llama-3.3-nemotron-super-49b-v1.5', l: '⚡ Nemotron Super 49B v1.5 (Primary)' },
        { v: 'auto', l: '⚡ Auto (Priority Swarm)' },
        { v: 'meta/llama-3.3-70b-instruct', l: '🚀 Llama 3.3 70B' },
        { v: 'nvidia/nemotron-3-super-120b-a12b', l: '🦾 Nemotron 3 Super 120B' },
        { v: 'moonshotai/kimi-k2.6', l: '🌙 Kimi K2.6 (Moonshot)' }
      ];
      defaultModel = 'nvidia/llama-3.3-nemotron-super-49b-v1.5';
    } else {
      models = [
        { v: 'moonshotai/kimi-k2.6:free', l: '🌙 Kimi K2.6 Free (Primary)' },
        { v: 'auto', l: '⚡ Auto (all 6 models)' },
        { v: 'deepseek/deepseek-v4-flash', l: '🚀 DeepSeek V4 Flash' },
        { v: 'qwen/qwen3-coder:free', l: '🧠 Qwen3 Coder Free' },
        { v: 'nvidia/nemotron-3-super-120b-a12b:free', l: '🦾 Nemotron 3 Super 120B' },
        { v: 'minimax/minimax-m2.5:free', l: '✨ MiniMax M2.5 Free' },
        { v: 'z-ai/glm-4.5-air:free', l: '💨 GLM 4.5 Air Free' }
      ];
      defaultModel = 'moonshotai/kimi-k2.6:free';
    }
    modelSelect.innerHTML = models.map(m => `<option value="${m.v}">${m.l}</option>`).join('');
    modelSelect.value = data.selectedModel || defaultModel;
    if (!modelSelect.value) { modelSelect.value = defaultModel; chrome.storage.local.set({ selectedModel: defaultModel }); }
    presetSelect.value = data.selectedPreset || 'technical_analysis_panel';
    highlightActivePreset(presetSelect.value);
    if (data.autoTradeEnabled) {
      isAutoTradeEnabled = true;
      applyAutoTradeUI();
      const t = $('auto-trade-toggle');
      if (t) t.checked = true;
    }
    if (typeof data.minAutoConfidence === 'number') {
      minAutoConfidence = data.minAutoConfidence;
      const r = $('min-confidence');
      const v = $('confidence-val');
      if (r) r.value = minAutoConfidence;
      if (v) v.innerText = minAutoConfidence;
    }
  });

  const newModelSelect = modelSelect.cloneNode(true);
  modelSelect.parentNode.replaceChild(newModelSelect, modelSelect);
  newModelSelect.addEventListener('change', () => chrome.storage.local.set({ selectedModel: newModelSelect.value }));

  const newPresetSelect = presetSelect.cloneNode(true);
  presetSelect.parentNode.replaceChild(newPresetSelect, presetSelect);
  newPresetSelect.addEventListener('change', () => {
    chrome.storage.local.set({ selectedPreset: newPresetSelect.value });
    highlightActivePreset(newPresetSelect.value);
  });

  $('auto-trade-toggle')?.addEventListener('change', (e) => setAutoTradeEnabled(e.target.checked));
  $('min-confidence')?.addEventListener('input', (e) => {
    minAutoConfidence = parseInt(e.target.value, 10);
    $('confidence-val').innerText = minAutoConfidence;
    chrome.storage.local.set({ minAutoConfidence });
    if (isAutoTradeEnabled) {
      chrome.runtime.sendMessage({ type: 'TOGGLE_AUTO_TRADE', enabled: true, minConfidence: minAutoConfidence });
    }
  });
}

// ============================================================
// TABS
// ============================================================
function initTabs() {
  const tabs = document.querySelectorAll('.vibe-tab');
  const views = document.querySelectorAll('.vibe-view');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      views.forEach(v => v.style.display = 'none');
      tab.classList.add('active');
      const view = $('vibe-view-' + tab.dataset.tab);
      if (view) view.style.display = 'block';
      // Render tab-specific content on switch
      if (tab.dataset.tab === 'history') renderHistoryTab();
      if (tab.dataset.tab === 'positions') renderOpenPositions();
      if (tab.dataset.tab === 'activity') renderActivityFeed($('activity-filter')?.value || 'all');
      if (tab.dataset.tab === 'tradelog') renderTradeLog();
    });
  });
}

// ============================================================
// CONTROLS
// ============================================================
function initControls() {
  $('tv-ai-autotrade-btn')?.addEventListener('click', () => setAutoTradeEnabled(!isAutoTradeEnabled));
  $('tv-ai-reload')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'TRIGGER_PREDICT' });
    setStatus('var(--vibe-blue)', 'AI ANALYZING...', 'TV trade Swarm is analyzing chart…');
  });
  $('tv-ai-invest-amount')?.addEventListener('input', updateInvestmentCalc);

  // Close All Positions
  $('close-all-positions-btn')?.addEventListener('click', () => {
    if (confirm('Close all open positions at current market price?')) {
      chrome.runtime.sendMessage({ type: 'CLOSE_ALL_POSITIONS' });
    }
  });

  // Activity filter
  $('activity-filter')?.addEventListener('change', (e) => renderActivityFeed(e.target.value));
  $('clear-activity-btn')?.addEventListener('click', () => {
    activityLog = [];
    chrome.storage.local.set({ activityLog: [] });
    renderActivityFeed();
  });

  // Trade log exports
  $('export-tradelog-csv')?.addEventListener('click', exportTradeLogCSV);
  $('export-tradelog-json')?.addEventListener('click', exportTradeLogJSON);

  // Existing exports
  $('vibe-export-pine')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'GET_EXPORT_DATA' }, (res) => {
      const symbol = res?.symbol || 'SYMBOL';
      const pine = `//@version=5\nindicator("TV trade ${symbol}", overlay=true)\nlongCondition = ta.crossover(ta.sma(close, 20), ta.sma(close, 50))\nshortCondition = ta.crossunder(ta.sma(close, 20), ta.sma(close, 50))\nplotshape(longCondition, location=location.belowbar, color=color.new(#00ffa3,0), style=shape.triangleup, text="BUY")\nplotshape(shortCondition, location=location.abovebar, color=color.new(#ff5f6d,0), style=shape.triangledown, text="SELL")`;
      downloadFile(pine, `TVtrade_${symbol}_PineScript.txt`);
    });
  });

  $('vibe-export-json')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'GET_EXPORT_DATA' }, (res) => {
      downloadFile(JSON.stringify({
        product: 'TV trade',
        symbol: res?.symbol,
        timestamp: new Date().toISOString(),
        candles: res?.candles || [],
        feedback: feedbackData,
        openTrades,
        skills: countSkills(),
        teams: countTeams(),
        engines: VIBE_CATALOG.engines.length
      }, null, 2), `TVtrade_${res?.symbol || 'data'}_export.json`);
    });
  });

  $('vibe-export-tdx')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'GET_EXPORT_DATA' }, (res) => {
      const symbol = res?.symbol || 'SYMBOL';
      downloadFile(`{TV trade ${symbol}}\nMA20:=MA(CLOSE,20);\nMA50:=MA(CLOSE,50);`, `TVtrade_${symbol}_TDX.txt`);
    });
  });

  $('vibe-export-mt5')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'GET_EXPORT_DATA' }, (res) => {
      downloadFile(`// TV trade ${res?.symbol || 'SYMBOL'} MQL5`, `TVtrade_${res?.symbol || 'SYMBOL'}_MT5.mq5`);
    });
  });

  $('vibe-run-backtest')?.addEventListener('click', () => {
    setStatus('var(--vibe-blue)', 'BACKTEST RUNNING', '7 engines processing historical signals…');
  });
}

// ============================================================
// MESSAGE LISTENERS
// ============================================================
chrome.runtime.onMessage.addListener((request) => {
  if (request.type === 'DASHBOARD_UPDATE') applyState(request.state);
  if (request.type === 'HISTORY_UPDATED') loadTradeHistory();
  if (request.type === 'ACTIVITY_LOG_ENTRY' && request.entry) addActivityEntry(request.entry);
  if (request.type === 'POSITIONS_UPDATED') {
    if (request.openTrades) { openTrades = request.openTrades; renderOpenPositions(); }
    if (request.feedbackData) { feedbackData = request.feedbackData; renderTradeLog(); }
    if (request.portfolioSummary) updatePortfolioBar(request.portfolioSummary);
  }
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.dashboardState?.newValue) applyState(changes.dashboardState.newValue);
  if (changes.feedbackData || changes.openTrades) loadTradeHistory();
  if (changes.apiKey) initSettings();
});

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  renderCatalogs();
  initSettings();
  initTabs();
  initControls();
  initTradeSettings();
  loadTradeHistory();

  // Auto-refresh positions every 10 seconds
  setInterval(() => {
    if (openTrades.length > 0) {
      chrome.runtime.sendMessage({ type: 'GET_POSITIONS' }, (res) => {
        if (res && res.openTrades) {
          openTrades = res.openTrades;
          renderOpenPositions();
        }
      });
    }
  }, 10000);
});
