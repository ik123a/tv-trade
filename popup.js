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

  // Load state and dynamically populate model list based on key type
  chrome.storage.local.get(['aiEnabled', 'selectedModel', 'selectedPreset', 'autoTradeEnabled', 'minAutoConfidence', 'apiKey'], (result) => {
    toggle.checked = result.aiEnabled !== false;
    autoTradeToggle.checked = result.autoTradeEnabled === true;
    const conf = typeof result.minAutoConfidence === 'number' ? result.minAutoConfidence : 65;
    minConfidence.value = conf;
    confidenceVal.innerText = conf;

    // Dynamically populate model dropdown based on detected key type
    const isNvidia = result.apiKey && result.apiKey.startsWith('nvapi-');
    let models;
    let defaultModel;

    if (isNvidia) {
      models = [
        { v: 'nvidia/llama-3.3-nemotron-super-49b-v1.5', l: '⚡ Nemotron Super 49B v1.5' },
        { v: 'auto', l: '⚡ Auto (all 9 models fallback)' },
        { v: 'deepseek-ai/deepseek-v4-pro', l: '🧠 DeepSeek V4 Pro' },
        { v: 'meta/llama-4-maverick-17b-128e-instruct', l: '🦙 Llama 4 Maverick 17B' },
        { v: 'z-ai/glm-5.1', l: '💎 GLM 5.1' },
        { v: 'qwen/qwen3-coder-480b-a35b-instruct', l: '🧪 Qwen3 Coder 480B' },
        { v: 'mistralai/mistral-large-3-675b-instruct-2512', l: '🌊 Mistral Large 3 675B' },
        { v: 'nvidia/nemotron-3-super-120b-a12b', l: '🦾 Nemotron 3 Super 120B' },
        { v: 'meta/llama-3.3-70b-instruct', l: '🚀 Llama 3.3 70B' },
        { v: 'moonshotai/kimi-k2.6', l: '🌙 Kimi K2.6' }
      ];
      defaultModel = 'nvidia/llama-3.3-nemotron-super-49b-v1.5';
    } else {
      models = [
        { v: 'moonshotai/kimi-k2.6:free', l: '🌙 Kimi K2.6 Free' },
        { v: 'auto', l: '⚡ Auto (all models fallback)' },
        { v: 'deepseek/deepseek-v4-flash', l: '🚀 DeepSeek V4 Flash' },
        { v: 'qwen/qwen3-coder:free', l: '🧠 Qwen3 Coder Free' },
        { v: 'nvidia/nemotron-3-super-120b-a12b:free', l: '🦾 Nemotron 3 Super 120B' },
        { v: 'minimax/minimax-m2.5:free', l: '✨ MiniMax M2.5 Free' },
        { v: 'z-ai/glm-4.5-air:free', l: '💨 GLM 4.5 Air Free' }
      ];
      defaultModel = 'moonshotai/kimi-k2.6:free';
    }

    modelSelect.innerHTML = models.map(m => `<option value="${m.v}">${m.l}</option>`).join('');

    const savedModel = result.selectedModel || defaultModel;
    const hasModelOption = Array.from(modelSelect.options).some(o => o.value === savedModel);
    modelSelect.value = hasModelOption ? savedModel : defaultModel;
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
