document.addEventListener('DOMContentLoaded', () => {
  const statusText = document.getElementById('status-text');
  const keyInfo = document.getElementById('key-info');

  function isValidOpenRouterKey(key) {
    return key
      && (key.startsWith('sk-or-') || key.startsWith('sk-'))
      && !key.includes('PASTE_YOUR')
      && key.length > 20;
  }

  function isValidNvidiaKey(key) {
    return key && key.startsWith('nvapi-') && key.length > 20;
  }

  // Load existing key or auto-load from file
  chrome.storage.local.get(['apiKey'], async (result) => {
    if (isValidOpenRouterKey(result.apiKey) || isValidNvidiaKey(result.apiKey)) {
      const label = isValidNvidiaKey(result.apiKey) ? 'NVIDIA' : 'OpenRouter';
      statusText.innerText = `✅ ${label} Key Active`;
      statusText.style.color = '#00ffa3';
      keyInfo.innerText = 'Key is securely stored.';
    } else {
      if (result.apiKey) {
        await chrome.storage.local.remove('apiKey');
      }
      // Try OpenRouter key file first
      let keyFound = false;
      try {
        const response = await fetch(chrome.runtime.getURL('OPENROUTER_API_KEY.txt'));
        const text = await response.text();
        const key = text.trim();
        if (isValidOpenRouterKey(key) || isValidNvidiaKey(key)) {
          chrome.storage.local.set({ apiKey: key });
          const label = isValidNvidiaKey(key) ? 'NVIDIA' : 'OpenRouter';
          statusText.innerText = `✅ ${label} Key Auto-Loaded`;
          statusText.style.color = '#00ffa3';
          keyInfo.innerText = 'Detected from OPENROUTER_API_KEY.txt';
          keyFound = true;
        }
      } catch (e) { /* file not found, continue */ }
      // Try NVIDIA key file as fallback
      if (!keyFound) {
        try {
          const response = await fetch(chrome.runtime.getURL('NVIDIA_API_KEY.txt'));
          const text = await response.text();
          const key = text.trim();
          if (isValidNvidiaKey(key)) {
            chrome.storage.local.set({ apiKey: key });
            statusText.innerText = '✅ NVIDIA Key Auto-Loaded';
            statusText.style.color = '#00ffa3';
            keyInfo.innerText = 'Detected from NVIDIA_API_KEY.txt';
            keyFound = true;
          }
        } catch (e) { /* file not found, continue */ }
      }
      if (!keyFound) {
        statusText.innerText = '❌ Key Not Found';
        statusText.style.color = '#ff3b3b';
        keyInfo.innerText = 'Paste key in OPENROUTER_API_KEY.txt or NVIDIA_API_KEY.txt';
      }
    }
  });

  const toggle = document.getElementById('ai-toggle');
  const autoTradeToggle = document.getElementById('auto-trade-toggle');
  const minConfidence = document.getElementById('min-confidence');
  const confidenceVal = document.getElementById('confidence-val');
  const modelSelect = document.getElementById('model-select');
  const presetSelect = document.getElementById('preset-select');

  function syncAutoTradeToTab(enabled, confidence) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, {
          type: 'TOGGLE_AUTO_TRADE',
          enabled,
          minConfidence: confidence
        });
      }
    });
  }

  // Load state
  chrome.storage.local.get(['aiEnabled', 'selectedModel', 'selectedPreset', 'autoTradeEnabled', 'minAutoConfidence'], (result) => {
    toggle.checked = result.aiEnabled !== false;
    autoTradeToggle.checked = result.autoTradeEnabled === true;
    const conf = typeof result.minAutoConfidence === 'number' ? result.minAutoConfidence : 65;
    minConfidence.value = conf;
    confidenceVal.innerText = conf;
    const savedModel = result.selectedModel || 'moonshotai/kimi-k2.6:free';
    const hasModelOption = Array.from(modelSelect.options).some(o => o.value === savedModel);
    modelSelect.value = hasModelOption ? savedModel : 'moonshotai/kimi-k2.6:free';
    presetSelect.value = result.selectedPreset || 'technical_analysis_panel';
    // Ensure defaults are saved if they were missing
    if (!result.selectedModel || !result.selectedPreset) {
      chrome.storage.local.set({ 
        selectedModel: modelSelect.value,
        selectedPreset: presetSelect.value
      });
    }
  });

  toggle.addEventListener('change', (e) => {
    const isEnabled = e.target.checked;
    chrome.storage.local.set({ aiEnabled: isEnabled });
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_AI', enabled: isEnabled });
    });
  });

  modelSelect.addEventListener('change', (e) => {
    chrome.storage.local.set({ selectedModel: e.target.value });
  });

  presetSelect.addEventListener('change', (e) => {
    chrome.storage.local.set({ selectedPreset: e.target.value });
  });

  autoTradeToggle.addEventListener('change', (e) => {
    const enabled = e.target.checked;
    const confidence = parseInt(minConfidence.value, 10);
    chrome.storage.local.set({ autoTradeEnabled: enabled, minAutoConfidence: confidence });
    syncAutoTradeToTab(enabled, confidence);
  });

  minConfidence.addEventListener('input', (e) => {
    const confidence = parseInt(e.target.value, 10);
    confidenceVal.innerText = confidence;
    chrome.storage.local.set({ minAutoConfidence: confidence });
    if (autoTradeToggle.checked) {
      syncAutoTradeToTab(true, confidence);
    }
  });

  document.getElementById('open-dashboard-btn')?.addEventListener('click', () => {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
  });
});
