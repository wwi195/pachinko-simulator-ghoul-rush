'use strict';

// ブラウザでは logic.js の function 宣言(calcSpinCost等)はグローバルに公開されるが、
// const 宣言(P_RUSH等)はプロパティとして公開されない(スクリプト間で共有される字句スコープの
// 識別子としてのみ参照できる)。そのため、ブラウザ分岐では両方を明示的にオブジェクトへ集約する。
const _logic = typeof require !== 'undefined'
  ? require('./logic.js')
  : { calcSpinCost, spinNormal, rollChargeLt, rollZugarLtChallenge, DEFAULT_ENZOKU_CONFIDENCE, P_RUSH, P_RUSH_BIG, applyRushSpin };

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

// 保留色の「狙い」を独立したパラメータで表す。
// - RELIABILITY: この色が出たとき実際に当選(hit_small/hit_big)である confirmed 率(0〜1)
// - RAINBOW_OCCURRENCE_RATE: 虹だけは出現率(全保留中の割合)を直接指定する
//   (「レア中のレア」の絶対値を固定したいという要望のため)
// - HIT_NONE_SHARE: 当選(hit_small/hit_big)のうち、何も色がつかず無色のまま
//   当たる割合(0〜1)。残り(1 - HIT_NONE_SHARE)から虹の取り分を引いた分を、
//   点滅/青/緑/赤の4色にOCCURRENCE_SHAREの比率で配分する。
// 実際にrollHoldColorが使う重み(HOLD_COLOR_WEIGHTS)はbuildHoldColorWeights()で
// これらから自動的に逆算する。値をここだけ変えれば他は自動で追従する
// (調整のたびに手計算しなくてよい)。
const HOLD_COLOR_RELIABILITY = {
  flash: 0.07,
  blue: 0.33,
  green: 0.55,
  red: 0.95,
  rainbow: 1,
};

const RAINBOW_OCCURRENCE_RATE = 0.0005; // 全保留のうち虹は0.05%固定

// 当選(hit_small/hit_big)のうち、無色のまま当たる割合。
const HIT_NONE_SHARE = 0.40;

// 点滅/青/緑/赤の4色で、虹を除いた「色付き当選」枠をどう配分するかの比率
// (合計1である必要はなく、buildHoldColorWeights内で正規化される)。
// このシェアの比率がそのままholdColorOccurrenceRateの出現率の比率になる
// (buildHoldColorWeights内でreliability倍してからwHitに配分し、
// pColor計算時にreliabilityで割り戻すため、shareの比率だけが残る)。
// 赤は「緑の出現率のちょうど1/3になる」よう、緑のシェアから逆算している。
const GREEN_OCCURRENCE_SHARE = 0.05;
const HOLD_COLOR_OCCURRENCE_SHARE = {
  flash: 0.70,
  blue: 0.12,
  green: GREEN_OCCURRENCE_SHARE,
  red: GREEN_OCCURRENCE_SHARE / 3,
};

function buildHoldColorWeights() {
  const pHit = _logic.P_RUSH;
  const pMissLike = 1 - pHit;

  function deriveWeights(color, wHit) {
    const reliability = HOLD_COLOR_RELIABILITY[color];
    const wMiss = reliability >= 1
      ? 0
      : (wHit * pHit * (1 - reliability)) / (reliability * pMissLike);
    return wMiss;
  }

  const hit = {};
  const miss = {};

  // 虹は出現率(全保留中の割合)を直接指定されているので、それをwHitに逆算する。
  const rainbowReliability = HOLD_COLOR_RELIABILITY.rainbow;
  hit.rainbow = (RAINBOW_OCCURRENCE_RATE * 100 * rainbowReliability) / pHit;
  miss.rainbow = deriveWeights('rainbow', hit.rainbow);

  // 当選のうちHIT_NONE_SHAREぶんは無色、虹はhit.rainbowぶん消費済みなので、
  // 残りを点滅/青/緑/赤の4色にOCCURRENCE_SHAREの比率(×reliability)で配分する。
  const remainingHitBudget = 100 * (1 - HIT_NONE_SHARE) - hit.rainbow;
  const shareColors = Object.keys(HOLD_COLOR_OCCURRENCE_SHARE);
  const weightedShareTotal = shareColors.reduce(
    (sum, c) => sum + HOLD_COLOR_OCCURRENCE_SHARE[c] * HOLD_COLOR_RELIABILITY[c],
    0
  );
  for (const color of shareColors) {
    const weightedShare = HOLD_COLOR_OCCURRENCE_SHARE[color] * HOLD_COLOR_RELIABILITY[color];
    hit[color] = remainingHitBudget * (weightedShare / weightedShareTotal);
    miss[color] = deriveWeights(color, hit[color]);
  }

  hit.none = 100 - Object.values(hit).reduce((sum, v) => sum + v, 0);
  miss.none = 100 - Object.values(miss).reduce((sum, v) => sum + v, 0);
  return { miss, st_end: miss, hit_small: hit, hit_big: hit };
}

const HOLD_COLOR_WEIGHTS = buildHoldColorWeights();

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

// 保留を1個取得したとき、その保留がこの色になる確率(全保留中での出現率)。
// 開始画面の発生率表示や、色バランスの検証に使う。
function holdColorOccurrenceRate(color) {
  const pHit = _logic.P_RUSH;
  const pHitSmall = pHit * (1 - _logic.P_RUSH_BIG);
  const pHitBig = pHit * _logic.P_RUSH_BIG;
  const pMissLike = 1 - pHit;

  const wMiss = HOLD_COLOR_WEIGHTS.miss[color] / 100;
  const wHitSmall = HOLD_COLOR_WEIGHTS.hit_small[color] / 100;
  const wHitBig = HOLD_COLOR_WEIGHTS.hit_big[color] / 100;

  return pMissLike * wMiss + pHitSmall * wHitSmall + pHitBig * wHitBig;
}

// 保留の色ごとに「実際に当選(hit_small/hit_big)である確率」を計算する。
// 開始画面の信頼度表示に使う。HOLD_COLOR_WEIGHTSやRUSH当選確率(P_RUSH/P_RUSH_BIG)が
// 変わっても自動で追従する(値をここに直書きしない)。
function holdColorHitRate(color) {
  const pHit = _logic.P_RUSH;
  const pHitSmall = pHit * (1 - _logic.P_RUSH_BIG);
  const pHitBig = pHit * _logic.P_RUSH_BIG;

  const wHitSmall = HOLD_COLOR_WEIGHTS.hit_small[color] / 100;
  const wHitBig = HOLD_COLOR_WEIGHTS.hit_big[color] / 100;

  const pColor = holdColorOccurrenceRate(color);
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

// 「ラッキー7」：テンパイ数字が7になったら、外れだったはずの保留も
// 確率抽選なしで必ず当たりに昇格する(script.js側で判定・変換する)。
// 7はレア数字として扱うため、出現率(LUCKY_REACH_DIGIT_RATE)は低めに
// している(お楽しみ用の初期値。後で調整可能)。
const LUCKY_REACH_DIGIT = 7;
const LUCKY_REACH_DIGIT_RATE = 0.05;
const NON_LUCKY_REACH_DIGITS = [1, 2, 3, 4, 5, 6, 8];

// リーチ(はさみテンパイ)のテンパイ数字を決める。LUCKY_REACH_DIGIT_RATEの
// 確率でLUCKY_REACH_DIGIT(7)になり、残りは7を除く1〜8から均等に選ばれる。
function rollReachDigit(rng = Math.random) {
  if (rng() < LUCKY_REACH_DIGIT_RATE) return LUCKY_REACH_DIGIT;
  const idx = Math.floor(rng() * NON_LUCKY_REACH_DIGITS.length);
  return NON_LUCKY_REACH_DIGITS[Math.min(idx, NON_LUCKY_REACH_DIGITS.length - 1)];
}

// applyRushSpin(logic.js、無改造)を「必ず当たる」乱数で強制的に呼び出す。
// ラッキー7による昇格をRUSH本体の状態(ST残数・連チャン数)に正しく
// 反映するために使う。当たりサイズ(小/大)は通常の当選と同じ抽選(2回目の
// 乱数呼び出し)に委ねるため、1回目の呼び出しだけを一時的に差し替える。
function forceRushHit(rushState) {
  const original = Math.random;
  let firstCall = true;
  Math.random = () => {
    if (firstCall) {
      firstCall = false;
      return 0; // spinRush(): 0 < P_RUSH は常にtrue → hit
    }
    return original();
  };
  try {
    return _logic.applyRushSpin(rushState);
  } finally {
    Math.random = original;
  }
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
    holdColorOccurrenceRate,
    RUSH_MODE_OPTIONS,
    DEFAULT_RUSH_MODE,
    MAX_HOLDS,
    RUSH_SPEED_OPTIONS,
    DEFAULT_RUSH_SPEED,
    rushSpeedIntervalMs,
    RUSH_HIT_BALLS,
    rushHitBalls,
    LUCKY_REACH_DIGIT,
    LUCKY_REACH_DIGIT_RATE,
    rollReachDigit,
    forceRushHit,
  };
}
