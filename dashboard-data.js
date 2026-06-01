const VIBE_CATALOG = {
  skills: [
    { cat: 'DATA SOURCE', color: '#ff6b6b', icon: '📊', items: ['data-routing', 'tushare', 'yfinance', 'okx-market', 'akshare', 'ccxt'] },
    { cat: 'STRATEGY', color: '#4ecdc4', icon: '⚡', items: ['strategy-generate', 'cross-market-strategy', 'technical-basic', 'candlestick-pattern', 'ichimoku-kinko-hyo', 'elliott-wave', 'smart-money-concepts', 'harmonic-patterns', 'multi-factor', 'ml-strategy', 'mean-reversion', 'momentum', 'breakout-detection', 'volume-profile', 'market-microstructure', 'pairs-trading', 'statistical-arbitrage', 'grid-trading', 'scalping-signals'] },
    { cat: 'ANALYSIS', color: '#45b7d1', icon: '🔬', items: ['factor-research', 'macro-analysis', 'global-macro', 'valuation-model', 'earnings-forecast', 'credit-analysis', 'sentiment-analysis', 'intermarket-analysis', 'regime-detection', 'correlation-analysis', 'volatility-modeling', 'term-structure', 'flow-analysis', 'positioning-analysis', 'seasonal-analysis'] },
    { cat: 'ASSET CLASS', color: '#f9ca24', icon: '💰', items: ['options-strategy', 'options-advanced', 'convertible-bond', 'etf-analysis', 'asset-allocation', 'sector-rotation', 'fixed-income', 'commodity-analysis', 'real-estate'] },
    { cat: 'CRYPTO', color: '#a29bfe', icon: '₿', items: ['perp-funding-basis', 'liquidation-heatmap', 'stablecoin-flow', 'defi-yield', 'onchain-analysis', 'whale-tracking', 'token-economics'] },
    { cat: 'FLOW', color: '#fd79a8', icon: '🔄', items: ['hk-connect-flow', 'us-etf-flow', 'edgar-sec-filings', 'financial-statement', 'adr-hshare', 'institutional-flow', 'dark-pool-analysis'] },
    { cat: 'TOOLS', color: '#00cec9', icon: '🛠️', items: ['backtest-diagnose', 'report-generate', 'pine-script', 'tdx-formula', 'mql5-export', 'doc-reader', 'web-reader', 'risk-calculator'] }
  ],
  teams: [
    { cat: 'CORE', items: [
      { id: 'technical_analysis_panel', icon: '📈', name: 'Technical Analysis Panel' },
      { id: 'investment_committee', icon: '🏢', name: 'Investment Committee' },
      { id: 'quant_strategy_desk', icon: '🧮', name: 'Quant Strategy Desk' },
      { id: 'risk_committee', icon: '🛡️', name: 'Risk Committee' }
    ]},
    { cat: 'GLOBAL', items: [
      { id: 'global_equities_desk', icon: '🌐', name: 'Global Equities Desk' },
      { id: 'global_allocation_committee', icon: '🌍', name: 'Global Allocation Committee' },
      { id: 'macro_rates_fx_desk', icon: '💱', name: 'Macro Rates & FX Desk' },
      { id: 'earnings_research_desk', icon: '📊', name: 'Earnings Research Desk' }
    ]},
    { cat: 'CRYPTO', items: [
      { id: 'crypto_trading_desk', icon: '₿', name: 'Crypto Trading Desk' },
      { id: 'defi_yield_desk', icon: '🌾', name: 'DeFi Yield Desk' },
      { id: 'onchain_intelligence', icon: '🔗', name: 'On-Chain Intelligence' },
      { id: 'perp_basis_desk', icon: '📐', name: 'Perp/Basis Trading' }
    ]},
    { cat: 'FLOW & SENTIMENT', items: [
      { id: 'flow_intelligence_desk', icon: '🔍', name: 'Flow Intelligence Desk' },
      { id: 'dark_pool_desk', icon: '🕵️', name: 'Dark Pool Analysis' },
      { id: 'sentiment_radar', icon: '📡', name: 'Sentiment Radar' },
      { id: 'news_event_desk', icon: '📰', name: 'News & Event Desk' }
    ]},
    { cat: 'STRATEGY', items: [
      { id: 'smc_ict_desk', icon: '💎', name: 'SMC/ICT Strategy Desk' },
      { id: 'elliott_wave_desk', icon: '🌊', name: 'Elliott Wave Desk' },
      { id: 'ichimoku_desk', icon: '☁️', name: 'Ichimoku Cloud Desk' },
      { id: 'harmonic_desk', icon: '🎯', name: 'Harmonic Patterns Desk' },
      { id: 'momentum_desk', icon: '🚀', name: 'Momentum Strategy' },
      { id: 'mean_reversion_desk', icon: '🔄', name: 'Mean Reversion Desk' },
      { id: 'breakout_desk', icon: '💥', name: 'Breakout Detection' }
    ]},
    { cat: 'ASSET CLASS', items: [
      { id: 'options_strategy_desk', icon: '🎛️', name: 'Options Strategy Desk' },
      { id: 'fixed_income_desk', icon: '🏦', name: 'Fixed Income Desk' },
      { id: 'commodity_desk', icon: '🛢️', name: 'Commodity Desk' },
      { id: 'etf_rotation_desk', icon: '📦', name: 'ETF Rotation Desk' },
      { id: 'sector_rotation_desk', icon: '🔄', name: 'Sector Rotation' }
    ]},
    { cat: 'SPECIALIST', items: [
      { id: 'pairs_trading_desk', icon: '⚖️', name: 'Pairs Trading Desk' }
    ]}
  ],
  engines: [
    { name: 'A-Shares Engine', icon: '🇨🇳', desc: 'Shanghai & Shenzhen equity backtesting' },
    { name: 'HK/US Engine', icon: '🌐', desc: 'Hong Kong & US cross-market validation' },
    { name: 'Crypto Engine', icon: '₿', desc: '24/7 digital asset simulation' },
    { name: 'Futures Engine', icon: '📈', desc: 'Commodity & index futures testing' },
    { name: 'Forex Engine', icon: '💱', desc: 'Major & minor pair analysis' },
    { name: 'Composite Engine', icon: '🔗', desc: 'Multi-asset portfolio backtest' },
    { name: 'Cross-Market Engine', icon: '🌍', desc: 'Global correlation & regime testing' }
  ]
};

function countSkills() {
  return VIBE_CATALOG.skills.reduce((n, g) => n + g.items.length, 0);
}

function countTeams() {
  return VIBE_CATALOG.teams.reduce((n, g) => n + g.items.length, 0);
}
