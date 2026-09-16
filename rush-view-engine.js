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
  { id: 'fast',    label: '速い',             intervalMs: 175 },
  { id: 'fastest', label: '最速',             intervalMs: 87.5 },
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

// テンパイ数字(1〜8)ごとに「信頼度」を持たせる仕組み。保留色の
// reliability/occurrenceShareと全く同じ考え方で、当落そのもの
// (P_RUSHによる抽選)には一切手を触れず、「リーチの両端に表示する
// 数字をどれにするか」だけを当落に応じた重み付き抽選にする。
// これにより、特定の数字(7・3)が出たときの体感信頼度を上げつつ、
// ST中の大当たり確率・継続率は実機(P_RUSH)のまま変えずに済む。
const REACH_DIGITS = [1, 2, 3, 4, 5, 6, 7, 8];

// 7・3だけ信頼度と当選時の出現率を明示指定し、残り6数字は当選枠の
// 残り(100 - 指定した出現率の合計)を均等に分け合う(保留色のnoneと
// 同じ「残りを引き受ける」役割)。
const REACH_DIGIT_RELIABILITY = { 7: 1, 3: 0.9 };
const REACH_DIGIT_HIT_SHARE = { 7: 5, 3: 10 }; // 当選時の出現率(%)
const OTHER_REACH_DIGITS = REACH_DIGITS.filter((d) => !(d in REACH_DIGIT_HIT_SHARE));

function buildReachDigitWeights() {
  const pHit = _logic.P_RUSH;
  // 保留色の重み(HOLD_COLOR_WEIGHTS)から、「外れでもガセリーチが起きる確率」を求める。
  // 色が無色以外なら必ずガセリーチ、無色ならP_RUSHと同じ確率でガセリーチする
  // (script.jsのisFakeReach判定と同じ式)。
  const missNoneShare = HOLD_COLOR_WEIGHTS.miss.none / 100;
  const pFakeReachGivenMiss = (1 - missNoneShare) + missNoneShare * pHit;
  const pFakeReach = (1 - pHit) * pFakeReachGivenMiss;

  const hit = {};
  const miss = {};

  const otherHitShare = (100 - Object.values(REACH_DIGIT_HIT_SHARE).reduce((s, v) => s + v, 0))
    / OTHER_REACH_DIGITS.length;

  for (const digit of REACH_DIGITS) {
    hit[digit] = digit in REACH_DIGIT_HIT_SHARE ? REACH_DIGIT_HIT_SHARE[digit] : otherHitShare;
  }

  // reliability(d) = pHit*hit[d] / (pHit*hit[d] + pFakeReach*miss[d]) となるよう、
  // 指定された信頼度(7・3)からmiss[d]を逆算する。
  for (const digit of [7, 3]) {
    const reliability = REACH_DIGIT_RELIABILITY[digit];
    miss[digit] = reliability >= 1
      ? 0
      : (hit[digit] * pHit * (1 - reliability)) / (reliability * pFakeReach);
  }
  // 残り6数字はmissの残り枠を均等に分け合う(hit同様、保留色のnoneと同じ役割)。
  const otherMissShare = (100 - miss[7] - miss[3]) / OTHER_REACH_DIGITS.length;
  for (const digit of OTHER_REACH_DIGITS) {
    miss[digit] = otherMissShare;
  }

  return { hit, miss };
}

const REACH_DIGIT_WEIGHTS = buildReachDigitWeights();

// isHit(このリーチは本物の当たりか、外れのガセリーチか)に応じて、
// リーチの両端に表示するテンパイ数字を重み付きで選ぶ。
function rollReachDigit(isHit, rng = Math.random) {
  const weights = isHit ? REACH_DIGIT_WEIGHTS.hit : REACH_DIGIT_WEIGHTS.miss;
  const total = REACH_DIGITS.reduce((sum, d) => sum + weights[d], 0);
  let r = rng() * total;
  for (const digit of REACH_DIGITS) {
    r -= weights[digit];
    if (r < 0) return digit;
  }
  return REACH_DIGITS[REACH_DIGITS.length - 1];
}

// このテンパイ数字が出たとき、実際に当たりである確率。
function reachDigitHitRate(digit) {
  const pHit = _logic.P_RUSH;
  const missNoneShare = HOLD_COLOR_WEIGHTS.miss.none / 100;
  const pFakeReach = (1 - pHit) * ((1 - missNoneShare) + missNoneShare * pHit);

  const wHit = REACH_DIGIT_WEIGHTS.hit[digit] / 100;
  const wMiss = REACH_DIGIT_WEIGHTS.miss[digit] / 100;

  const pDigit = pHit * wHit + pFakeReach * wMiss;
  if (pDigit === 0) return 0;
  return (pHit * wHit) / pDigit;
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
    REACH_DIGITS,
    REACH_DIGIT_WEIGHTS,
    rollReachDigit,
    reachDigitHitRate,
  };
}
