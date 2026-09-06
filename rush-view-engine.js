'use strict';

// ブラウザでは logic.js の function 宣言(calcSpinCost等)はグローバルに公開されるが、
// const 宣言(P_RUSH等)はプロパティとして公開されない(スクリプト間で共有される字句スコープの
// 識別子としてのみ参照できる)。そのため、ブラウザ分岐では両方を明示的にオブジェクトへ集約する。
const _logic = typeof require !== 'undefined'
  ? require('./logic.js')
  : { calcSpinCost, spinNormal, rollChargeLt, rollZugarLtChallenge, DEFAULT_ENZOKU_CONFIDENCE, P_RUSH, P_RUSH_BIG };

const YEN_PER_BALL = 4;
const BALLS_PER_1000YEN = 250;

function ballsToYen(balls) {
  return balls * YEN_PER_BALL;
}

// 通常時を「zugar/chargeを経てLTに当選する」まで裏側で高速シミュレートし、
// 投資額(円)・回転数・当選経路('zugar'|'charge')・道中に起きたチャージ/図柄揃いの
// 回数を返す。画面には結果だけを表示する(道中の詳細は投資額表示の下に小さく添える)。
// 先バレ信頼度(confidence)は「はずれ」と「先バレはずれ」の内訳比率にしか影響せず、
// どちらも本ループでは同じ扱い(continue)のため、選択させる意味がない。
// よって logic.js の DEFAULT_ENZOKU_CONFIDENCE で固定する。
function simulateInvestment(spinRate) {
  let mochiDama = 0;
  let toushi = 0;
  let spins = 0;
  let chargeCount = 0;
  let zugarCount = 0;

  for (;;) {
    const cost = _logic.calcSpinCost(spinRate);
    if (mochiDama >= cost) {
      mochiDama -= cost;
    } else {
      const shortfall = cost - mochiDama;
      const units = Math.ceil(shortfall / BALLS_PER_1000YEN);
      toushi += units * 1000;
      mochiDama = units * BALLS_PER_1000YEN - shortfall;
    }
    spins++;

    const result = _logic.spinNormal(_logic.DEFAULT_ENZOKU_CONFIDENCE);
    if (result === 'miss' || result === 'false_enzoku') continue;

    if (result === 'zugar') {
      zugarCount++;
      mochiDama += 1400;
      if (_logic.rollZugarLtChallenge()) {
        return { spins, toushi, path: 'zugar', chargeCount, zugarCount };
      }
      continue;
    }

    // charge
    chargeCount++;
    mochiDama += 280;
    if (_logic.rollChargeLt()) {
      return { spins, toushi, path: 'charge', chargeCount, zugarCount };
    }
  }
}

const HOLD_COLORS = ['none', 'flash', 'blue', 'green', 'red', 'rainbow'];

// 保留取得時に、実際の抽選結果(outcome)に応じて先読み示唆の色を確率的に選ぶ。
// 東京喰種実機のRUSH中保留変化(p-town.dmm.com/nana-press.com等の解析記事)を
// 参考にした演出用の重み。実機情報の精度が上がった際はこの表だけ差し替えればよい。
const HOLD_COLOR_WEIGHTS = {
  miss:      { none: 84, flash: 10, blue: 4,  green: 1.5, red: 0.5, rainbow: 0 },
  st_end:    { none: 84, flash: 10, blue: 4,  green: 1.5, red: 0.5, rainbow: 0 },
  hit_small: { none: 0,  flash: 5,  blue: 15, green: 30,  red: 40,  rainbow: 10 },
  hit_big:   { none: 0,  flash: 0,  blue: 5,  green: 15,  red: 40,  rainbow: 40 },
};

function rollHoldColor(outcome, rng = Math.random) {
  const weights = HOLD_COLOR_WEIGHTS[outcome];
  const total = HOLD_COLORS.reduce((sum, color) => sum + weights[color], 0);
  let r = rng() * total;
  for (const color of HOLD_COLORS) {
    r -= weights[color];
    if (r < 0) return color;
  }
  return HOLD_COLORS[HOLD_COLORS.length - 1];
}

// 保留の色ごとに「実際に当選(hit_small/hit_big)である確率」を計算する。
// 開始画面の信頼度表示に使う。HOLD_COLOR_WEIGHTSやRUSH当選確率(P_RUSH/P_RUSH_BIG)が
// 変わっても自動で追従する(値をここに直書きしない)。
function holdColorHitRate(color) {
  const pHit = _logic.P_RUSH;
  const pHitSmall = pHit * (1 - _logic.P_RUSH_BIG);
  const pHitBig = pHit * _logic.P_RUSH_BIG;
  const pMissLike = 1 - pHit;

  const wMiss = HOLD_COLOR_WEIGHTS.miss[color] / 100;
  const wHitSmall = HOLD_COLOR_WEIGHTS.hit_small[color] / 100;
  const wHitBig = HOLD_COLOR_WEIGHTS.hit_big[color] / 100;

  const pColor = pMissLike * wMiss + pHitSmall * wHitSmall + pHitBig * wHitBig;
  if (pColor === 0) return 0;
  return (pHitSmall * wHitSmall + pHitBig * wHitBig) / pColor;
}

const RUSH_MODE_OPTIONS = [
  { id: 'default',   label: 'デフォルト' },
  { id: 'tokigeki',  label: '突撃' },
  { id: 'rize',      label: 'リゼ襲来' },
  { id: 'tsukiyama', label: '月山絶叫' },
];
const DEFAULT_RUSH_MODE = 'default';

const MAX_HOLDS = 4;

const RUSH_SPEED_OPTIONS = [
  { id: 'normal',  label: '通常（実機と同様）', intervalMs: 1400 },
  { id: 'fast',    label: '速い',             intervalMs: 700 },
  { id: 'fastest', label: '最速',             intervalMs: 350 },
];
const DEFAULT_RUSH_SPEED = 'normal';

function rushSpeedIntervalMs(speedId) {
  const option = RUSH_SPEED_OPTIONS.find((o) => o.id === speedId);
  return option ? option.intervalMs : RUSH_SPEED_OPTIONS[0].intervalMs;
}

const RUSH_HIT_BALLS = { hit_small: 2800, hit_big: 5600 };

function rushHitBalls(outcome) {
  return RUSH_HIT_BALLS[outcome];
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    YEN_PER_BALL,
    BALLS_PER_1000YEN,
    ballsToYen,
    simulateInvestment,
    HOLD_COLORS,
    HOLD_COLOR_WEIGHTS,
    rollHoldColor,
    holdColorHitRate,
    RUSH_MODE_OPTIONS,
    DEFAULT_RUSH_MODE,
    MAX_HOLDS,
    RUSH_SPEED_OPTIONS,
    DEFAULT_RUSH_SPEED,
    rushSpeedIntervalMs,
    RUSH_HIT_BALLS,
    rushHitBalls,
  };
}
