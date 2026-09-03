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

test('simulateInvestment: 1回転目でCHARGE即LT当選なら投資額1000円・1回転・charge経路', () => {
  // spinNormal(40)の3draw: zugar外れ(0.999) / false_enzoku外れ(0.999) / charge成立(0)
  // 続くrollChargeLt()の1draw: LT当選(0)
  const result = withMockRandom([0.999, 0.999, 0, 0], () => simulateInvestment(16, 40));
  assert.deepEqual(result, { spins: 1, toushi: 1000, path: 'charge' });
});

test('simulateInvestment: CHARGE外れ→miss→図柄揃いでLTチャレンジ成功なら3回転・投資額1000円・zugar経路', () => {
  const sequence = [
    0.999, 0.999, 0, 0.5,       // 1回転目: charge成立, rollChargeLt外れ
    0.999, 0.999, 0.999,        // 2回転目: miss
    0, 0,                       // 3回転目: zugar成立, rollZugarLtChallenge成功
  ];
  const result = withMockRandom(sequence, () => simulateInvestment(16, 40));
  assert.deepEqual(result, { spins: 3, toushi: 1000, path: 'zugar' });
});

const { HOLD_COLORS, HOLD_COLOR_WEIGHTS, rollHoldColor } = require('../rush-view-engine.js');

test('HOLD_COLORS は白/点滅/青/緑/赤/虹の6段階', () => {
  assert.deepEqual(HOLD_COLORS, ['none', 'flash', 'blue', 'green', 'red', 'rainbow']);
});

test('HOLD_COLOR_WEIGHTS の各outcomeの重みは合計100', () => {
  for (const outcome of Object.keys(HOLD_COLOR_WEIGHTS)) {
    const total = HOLD_COLORS.reduce((sum, c) => sum + HOLD_COLOR_WEIGHTS[outcome][c], 0);
    assert.equal(total, 100, `outcome=${outcome}`);
  }
});

test('rollHoldColor: missでrng=0はnone(白)', () => {
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
