// Evaluate only the pure gate, never the extension/content-script boot code.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const source = fs.readFileSync(path.join(__dirname, '..', 'content.js'), 'utf8');
const start = source.indexOf('function shouldAutoExecute(');
const end = source.indexOf('\nfunction maybeExecuteAutoTrade(', start);
assert.ok(start >= 0 && end > start, 'gate boundaries must be present');

function check(prediction, overrides = {}) {
  const context = {
    isAutoTradeEnabled: true, minAutoConfidence: 65, openTrades: [],
    tradeSettings: { maxOpenPositions: 3 }, lastAutoExecutedSignalId: null,
    getSymbol: () => 'OFFLINE', hasOpenTradeForSymbol: () => false,
    ...overrides,
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  return context.shouldAutoExecute(prediction).execute;
}
const valid = { signal: 'BUY', tp: 110, sl: 90, probability: 75 };
test('valid BUY and SELL gates remain available', () => {
  assert.equal(check(valid), true);
  assert.equal(check({ ...valid, signal: 'SELL' }), true);
});
test('malformed model predictions never pass the auto gate', () => {
  for (const signal of ['HOLD', 'UNKNOWN', '', null]) {
    assert.equal(check({ ...valid, signal }), false, String(signal));
  }
  for (const probability of [NaN, Infinity, -1, 101, 'high', '75']) {
    assert.equal(check({ ...valid, probability }), false, String(probability));
  }
  for (const field of ['tp', 'sl']) {
    for (const value of [0, -1, NaN, Infinity, 'invalid', '110']) {
      assert.equal(check({ ...valid, [field]: value }), false, `${field}=${value}`);
    }
  }
});
test('existing disabled, confidence and position limits still block', () => {
  assert.equal(check(valid, { isAutoTradeEnabled: false }), false);
  assert.equal(check({ ...valid, probability: 60 }), false);
  assert.equal(check(valid, { openTrades: Array(3).fill({ status: 'OPEN' }) }), false);
  assert.equal(check(valid, { hasOpenTradeForSymbol: () => true }), false);
  assert.equal(check(valid, { lastAutoExecutedSignalId: 'OFFLINE-BUY-110-90-75' }), false);
});
