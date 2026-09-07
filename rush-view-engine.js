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
// 回数と、その一つ一つの詳細(events：発生回転数・種別・結果・その時点までの消費球数)を返す。
// 画面には結果の要約を表示し、道中の詳細(events)は履歴欄に記録する。
// 先バレ信頼度(confidence)は「はずれ」と「先バレはずれ」の内訳比率にしか影響せず、
// どちらも本ループでは同じ扱い(continue)のため、選択させる意味がない。
// よって logic.js の DEFAULT_ENZOKU_CONFIDENCE で固定する。
function simulateInvestment(spinRate) {
  let mochiDama = 0;
  let toushi = 0;
  let spins = 0;
  let chargeCount = 0;
  let zugarCount = 0;
  const events = [];

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
      const win = _logic.rollZugarLtChallenge();
      events.push({ spins, type: 'zugar', win, ballsUsed: toushi / YEN_PER_BALL });
      if (win) {
        return { spins, toushi, path: 'zugar', chargeCount, zugarCount, events };
      }
      continue;
    }

    // charge
    chargeCount++;
    mochiDama += 280;
    const win = _logic.rollChargeLt();
    events.push({ spins, type: 'charge', win, ballsUsed: toushi / YEN_PER_BALL });
    if (win) {
      return { spins, toushi, path: 'charge', chargeCount, zugarCount, events };
    }
  }
}

const HOLD_COLORS = ['none', 'flash', 'blue', 'green', 'red', 'rainbow'];

// 保留取得時に、実際の抽選結果(outcome)に応じて先読み示唆の色を確率的に選ぶ。
// 指定された信頼度(holdColorHitRateで計算した「見えている色から見た実際の当選率」が
// 無色1%/点滅7%/青33%/緑55%/赤95%/虹確定 になるよう、P_RUSH・P_RUSH_BIGを踏まえて
// 逆算した重み。hit_small/hit_bigは区別せず同じ重みを使う(信頼度は当選サイズを問わない)。
const HOLD_COLOR_WEIGHTS = {
  miss:      { none: 99.8365147903017, flash: 0.1408877442811695, blue: 0.017224203862591984, green: 0.005205822809216234, red: 0.00016743874532566854, rainbow: 0 },
  st_end:    { none: 99.8365147903017, flash: 0.1408877442811695, blue: 0.017224203862591984, green: 0.005205822809216234, red: 0.00016743874532566854, rainbow: 0 },
  hit_small: { none: 95.09680146187323, flash: 1, blue: 0.8, green: 0.6, red: 0.3, rainbow: 2.2031985381267716 },
  hit_big:   { none: 95.09680146187323, flash: 1, blue: 0.8, green: 0.6, red: 0.3, rainbow: 2.2031985381267716 },
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
  { id: 'fast',    label: '速い',             intervalMs: 350 },
  { id: 'fastest', label: '最速',             intervalMs: 175 },
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
