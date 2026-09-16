'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  YEN_PER_BALL,
  BALLS_PER_1000YEN,
  ballsToYen,
  simulateInvestment,
} = require('../rush-view-engine.js');

function withMockRandom(values, fn) {
  const original = Math.random;
  let i = 0;
  Math.random = () => values[Math.min(i++, values.length - 1)];
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

test('定数はidle-engine.jsと同じ換算値', () => {
  assert.equal(YEN_PER_BALL, 4);
  assert.equal(BALLS_PER_1000YEN, 250);
});

test('ballsToYen: 280球は1120円', () => {
  assert.equal(ballsToYen(280), 1120);
});

test('simulateInvestment: 1回転目でCHARGE即LT当選なら投資額1000円・1回転・charge経路、道中チャージ1回、events1件', () => {
  // spinNormal(DEFAULT_ENZOKU_CONFIDENCE=40)の3draw: zugar外れ(0.999) / false_enzoku外れ(0.999) / charge成立(0)
  // 続くrollChargeLt()の1draw: LT当選(0)
  const result = withMockRandom([0.999, 0.999, 0, 0], () => simulateInvestment(16));
  assert.deepEqual(result, {
    spins: 1,
    toushi: 1000,
    path: 'charge',
    chargeCount: 1,
    zugarCount: 0,
    events: [{ spins: 1, type: 'charge', win: true, ballsUsed: 250 }],
  });
});

test('simulateInvestment: CHARGE外れ→miss→図柄揃いでLTチャレンジ成功なら3回転・投資額1000円・zugar経路、events2件', () => {
  const sequence = [
    0.999, 0.999, 0, 0.5,       // 1回転目: charge成立, rollChargeLt外れ
    0.999, 0.999, 0.999,        // 2回転目: miss
    0, 0,                       // 3回転目: zugar成立, rollZugarLtChallenge成功
  ];
  const result = withMockRandom(sequence, () => simulateInvestment(16));
  assert.deepEqual(result, {
    spins: 3,
    toushi: 1000,
    path: 'zugar',
    chargeCount: 1,
    zugarCount: 1,
    events: [
      { spins: 1, type: 'charge', win: false, ballsUsed: 250 },
      { spins: 3, type: 'zugar', win: true, ballsUsed: 250 },
    ],
  });
});

const { HOLD_COLORS, HOLD_COLOR_WEIGHTS, rollHoldColor } = require('../rush-view-engine.js');

test('HOLD_COLORS は無色/点滅/青/緑/赤/虹の6段階', () => {
  assert.deepEqual(HOLD_COLORS, ['none', 'flash', 'blue', 'green', 'red', 'rainbow']);
});

test('HOLD_COLOR_WEIGHTS の各outcomeの重みは合計約100(浮動小数点誤差を許容)', () => {
  for (const outcome of Object.keys(HOLD_COLOR_WEIGHTS)) {
    const total = HOLD_COLORS.reduce((sum, c) => sum + HOLD_COLOR_WEIGHTS[outcome][c], 0);
    assert.ok(Math.abs(total - 100) < 1e-6, `outcome=${outcome}, total=${total}`);
  }
});

test('rollHoldColor: missでrng=0はnone(無色、圧倒的多数派)', () => {
  assert.equal(rollHoldColor('miss', () => 0), 'none');
});

test('rollHoldColor: missでの無色の重みは95%を超える(外れの大部分は無色のまま)', () => {
  const w = HOLD_COLOR_WEIGHTS.miss;
  const total = HOLD_COLORS.reduce((sum, c) => sum + w[c], 0);
  assert.ok(w.none / total > 0.95, `none share = ${w.none / total}`);
});

test('rollHoldColor: st_endはmissと同じ重みなのでrng=0はnone', () => {
  assert.equal(rollHoldColor('st_end', () => 0), 'none');
});

test('rollHoldColor: hit_bigでもrng=0はnone', () => {
  assert.equal(rollHoldColor('hit_big', () => 0), 'none');
});

test('rollHoldColor: hit_smallでrng=0.999はrainbow', () => {
  assert.equal(rollHoldColor('hit_small', () => 0.999), 'rainbow');
});

const { holdColorHitRate, holdColorOccurrenceRate } = require('../rush-view-engine.js');

function assertClose(actual, expected, epsilon = 0.001) {
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    `expected ${actual} to be close to ${expected}`
  );
}

test('holdColorHitRate: 無色はごく低い信頼度、虹は100%(当選濃厚)', () => {
  assert.ok(holdColorHitRate('none') < 0.01, `none reliability = ${holdColorHitRate('none')}`);
  assert.equal(holdColorHitRate('rainbow'), 1);
});

test('holdColorHitRate: 点滅<青<緑<赤<虹の順で信頼度が上がる', () => {
  const order = ['none', 'flash', 'blue', 'green', 'red', 'rainbow'].map(holdColorHitRate);
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i] > order[i - 1], `${order[i - 1]} should be < ${order[i]}`);
  }
});

test('holdColorHitRate: 指定された目標信頼度(点滅7%/青33%/緑55%/赤95%)通りに算出される', () => {
  assertClose(holdColorHitRate('flash'), 0.07, 0.0001);
  assertClose(holdColorHitRate('blue'), 0.33, 0.0001);
  assertClose(holdColorHitRate('green'), 0.55, 0.0001);
  assertClose(holdColorHitRate('red'), 0.95, 0.0001);
});

test('holdColorOccurrenceRate: 全保留のうち無色が占める割合は90%〜100%の間', () => {
  const rate = holdColorOccurrenceRate('none');
  assert.ok(rate > 0.9 && rate < 1, `none occurrence = ${rate}`);
});

test('holdColorOccurrenceRate: 赤は虹より出現しやすい(赤が虹に隠れて目立たない問題を修正)', () => {
  assert.ok(
    holdColorOccurrenceRate('red') > holdColorOccurrenceRate('rainbow'),
    `red=${holdColorOccurrenceRate('red')}, rainbow=${holdColorOccurrenceRate('rainbow')}`
  );
});

test('holdColorOccurrenceRate: 点滅が色付き保留(none以外)の中で最も出現しやすい', () => {
  const colored = ['flash', 'blue', 'green', 'red', 'rainbow'];
  const rates = colored.map(holdColorOccurrenceRate);
  assert.equal(Math.max(...rates), rates[0], `rates=${JSON.stringify(rates)}`);
});

test('holdColorOccurrenceRate: 緑の出現率は赤のちょうど3倍', () => {
  const green = holdColorOccurrenceRate('green');
  const red = holdColorOccurrenceRate('red');
  assertClose(green / red, 3, 0.001);
});

test('holdColorOccurrenceRate: 虹の出現率は全保留のうち0.05%固定', () => {
  assertClose(holdColorOccurrenceRate('rainbow'), 0.0005, 0.00001);
});

test('HOLD_COLOR_WEIGHTS: 当選(hit)のうち無色のまま当たる割合は40%', () => {
  const hit = HOLD_COLOR_WEIGHTS.hit_small;
  const total = HOLD_COLORS.reduce((sum, c) => sum + hit[c], 0);
  assertClose(hit.none / total, 0.40, 0.0001);
});

const {
  RUSH_MODE_OPTIONS,
  DEFAULT_RUSH_MODE,
  MAX_HOLDS,
  RUSH_SPEED_OPTIONS,
  DEFAULT_RUSH_SPEED,
  rushSpeedIntervalMs,
} = require('../rush-view-engine.js');

test('RUSH_MODE_OPTIONS はデフォルト+実機準拠3種の計4種', () => {
  assert.deepEqual(RUSH_MODE_OPTIONS, [
    { id: 'default',   label: 'デフォルト' },
    { id: 'tokigeki',  label: '突撃' },
    { id: 'rize',      label: 'リゼ襲来' },
    { id: 'tsukiyama', label: '月山絶叫' },
  ]);
  assert.equal(DEFAULT_RUSH_MODE, 'default');
});

test('MAX_HOLDS は4', () => {
  assert.equal(MAX_HOLDS, 4);
});

test('RUSH_SPEED_OPTIONS は通常/速い/最速の3段階、デフォルトは通常(1400ms)', () => {
  assert.deepEqual(RUSH_SPEED_OPTIONS, [
    { id: 'normal',  label: '通常（実機と同様）', intervalMs: 1400 },
    { id: 'fast',    label: '速い',             intervalMs: 175 },
    { id: 'fastest', label: '最速',             intervalMs: 87.5 },
  ]);
  assert.equal(DEFAULT_RUSH_SPEED, 'normal');
});

test('rushSpeedIntervalMs: 各speed idに対応する間隔(ms)を返す(速い=旧最速と同じ175ms、最速はその倍速の87.5ms)', () => {
  assert.equal(rushSpeedIntervalMs('normal'), 1400);
  assert.equal(rushSpeedIntervalMs('fast'), 175);
  assert.equal(rushSpeedIntervalMs('fastest'), 87.5);
});

test('rushSpeedIntervalMs: 不明なidはデフォルト(通常)にフォールバックする', () => {
  assert.equal(rushSpeedIntervalMs('unknown'), 1400);
});

const { RUSH_HIT_BALLS, rushHitBalls } = require('../rush-view-engine.js');

test('rushHitBalls: hit_smallは2800球、hit_bigは5600球', () => {
  assert.deepEqual(RUSH_HIT_BALLS, { hit_small: 2800, hit_big: 5600 });
  assert.equal(rushHitBalls('hit_small'), 2800);
  assert.equal(rushHitBalls('hit_big'), 5600);
});

const {
  REACH_DIGITS,
  REACH_DIGIT_WEIGHTS,
  rollReachDigit,
  reachDigitHitRate,
} = require('../rush-view-engine.js');

test('REACH_DIGITS は1〜8の8種類', () => {
  assert.deepEqual(REACH_DIGITS, [1, 2, 3, 4, 5, 6, 7, 8]);
});

test('REACH_DIGIT_WEIGHTS の各行(hit/miss)の重みは合計約100', () => {
  for (const row of Object.keys(REACH_DIGIT_WEIGHTS)) {
    const total = REACH_DIGITS.reduce((sum, d) => sum + REACH_DIGIT_WEIGHTS[row][d], 0);
    assert.ok(Math.abs(total - 100) < 1e-6, `row=${row}, total=${total}`);
  }
});

test('REACH_DIGIT_WEIGHTS: 当選時の出現率は7が5%・3が10%(指定通り)', () => {
  assertClose(REACH_DIGIT_WEIGHTS.hit[7], 5, 0.0001);
  assertClose(REACH_DIGIT_WEIGHTS.hit[3], 10, 0.0001);
});

test('REACH_DIGIT_WEIGHTS: 外れのガセリーチでは7は絶対に出ない(信頼度100%)', () => {
  assert.equal(REACH_DIGIT_WEIGHTS.miss[7], 0);
});

test('reachDigitHitRate: 7は100%、3は90%(指定通りの信頼度)', () => {
  assert.equal(reachDigitHitRate(7), 1);
  assertClose(reachDigitHitRate(3), 0.9, 0.0001);
});

test('reachDigitHitRate: 7と3以外の6数字は互いに信頼度が等しく、3より低い(均等割りの副作用)', () => {
  const others = [1, 2, 4, 5, 6, 8].map(reachDigitHitRate);
  others.forEach((r) => assertClose(r, others[0], 1e-9));
  assert.ok(others[0] < reachDigitHitRate(3));
});

test('rollReachDigit: hit=trueでrng=0は先頭の数字(1)になる', () => {
  assert.equal(rollReachDigit(true, () => 0), 1);
});

test('rollReachDigit: miss(ガセリーチ)でrng=0.999でも7にはならない(信頼度100%のため出現ゼロ)', () => {
  assert.notEqual(rollReachDigit(false, () => 0.999), 7);
});
