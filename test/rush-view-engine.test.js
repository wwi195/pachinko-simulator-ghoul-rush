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

test('simulateInvestment: 1回転目でCHARGE即LT当選なら投資額1000円・1回転・charge経路、道中チャージ1回', () => {
  // spinNormal(DEFAULT_ENZOKU_CONFIDENCE=40)の3draw: zugar外れ(0.999) / false_enzoku外れ(0.999) / charge成立(0)
  // 続くrollChargeLt()の1draw: LT当選(0)
  const result = withMockRandom([0.999, 0.999, 0, 0], () => simulateInvestment(16));
  assert.deepEqual(result, { spins: 1, toushi: 1000, path: 'charge', chargeCount: 1, zugarCount: 0 });
});

test('simulateInvestment: CHARGE外れ→miss→図柄揃いでLTチャレンジ成功なら3回転・投資額1000円・zugar経路、道中チャージ1回', () => {
  const sequence = [
    0.999, 0.999, 0, 0.5,       // 1回転目: charge成立, rollChargeLt外れ
    0.999, 0.999, 0.999,        // 2回転目: miss
    0, 0,                       // 3回転目: zugar成立, rollZugarLtChallenge成功
  ];
  const result = withMockRandom(sequence, () => simulateInvestment(16));
  assert.deepEqual(result, { spins: 3, toushi: 1000, path: 'zugar', chargeCount: 1, zugarCount: 1 });
});

const { HOLD_COLORS, HOLD_COLOR_WEIGHTS, rollHoldColor } = require('../rush-view-engine.js');

test('HOLD_COLORS は無色/点滅/青/緑/赤/虹の6段階', () => {
  assert.deepEqual(HOLD_COLORS, ['none', 'flash', 'blue', 'green', 'red', 'rainbow']);
});

test('HOLD_COLOR_WEIGHTS の各outcomeの重みは合計100', () => {
  for (const outcome of Object.keys(HOLD_COLOR_WEIGHTS)) {
    const total = HOLD_COLORS.reduce((sum, c) => sum + HOLD_COLOR_WEIGHTS[outcome][c], 0);
    assert.equal(total, 100, `outcome=${outcome}`);
  }
});

test('rollHoldColor: missでrng=0はnone(無色)', () => {
  assert.equal(rollHoldColor('miss', () => 0), 'none');
});

test('rollHoldColor: missでrng=0.999はred(missの中で最高ランク)', () => {
  assert.equal(rollHoldColor('miss', () => 0.999), 'red');
});

test('rollHoldColor: st_endはmissと同じ重みなのでrng=0はnone', () => {
  assert.equal(rollHoldColor('st_end', () => 0), 'none');
});

test('rollHoldColor: hit_bigはnone/flashの重みが0なのでrng=0でもblueになる', () => {
  assert.equal(rollHoldColor('hit_big', () => 0), 'blue');
});

test('rollHoldColor: hit_smallでrng=0.999はrainbow', () => {
  assert.equal(rollHoldColor('hit_small', () => 0.999), 'rainbow');
});

const { holdColorHitRate } = require('../rush-view-engine.js');

function assertClose(actual, expected, epsilon = 0.001) {
  assert.ok(
    Math.abs(actual - expected) < epsilon,
    `expected ${actual} to be close to ${expected}`
  );
}

test('holdColorHitRate: 無色はほぼ0%、虹は100%(当選濃厚)', () => {
  assertClose(holdColorHitRate('none'), 0);
  assert.equal(holdColorHitRate('rainbow'), 1);
});

test('holdColorHitRate: 点滅<青<緑<赤<虹の順で信頼度が上がる', () => {
  const order = ['none', 'flash', 'blue', 'green', 'red', 'rainbow'].map(holdColorHitRate);
  for (let i = 1; i < order.length; i++) {
    assert.ok(order[i] > order[i - 1], `${order[i - 1]} should be < ${order[i]}`);
  }
});

test('holdColorHitRate: 赤はP_RUSH/P_RUSH_BIGとHOLD_COLOR_WEIGHTSから計算した通りの約46%', () => {
  // P_RUSH=1/95.3, P_RUSH_BIG=0.03 での手計算値(検証用に別途算出済み)
  assertClose(holdColorHitRate('red'), 0.45898, 0.0001);
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
    { id: 'fast',    label: '速い',             intervalMs: 700 },
    { id: 'fastest', label: '最速',             intervalMs: 350 },
  ]);
  assert.equal(DEFAULT_RUSH_SPEED, 'normal');
});

test('rushSpeedIntervalMs: 各speed idに対応する間隔(ms)を返す', () => {
  assert.equal(rushSpeedIntervalMs('normal'), 1400);
  assert.equal(rushSpeedIntervalMs('fast'), 700);
  assert.equal(rushSpeedIntervalMs('fastest'), 350);
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
