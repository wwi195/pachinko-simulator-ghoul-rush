'use strict';

const {
  calcSpinCost,
  spinNormal,
  rollChargeLt,
  rollZugarLtChallenge,
} = require('./logic.js');

const YEN_PER_BALL = 4;
const BALLS_PER_1000YEN = 250;

function ballsToYen(balls) {
  return balls * YEN_PER_BALL;
}

// 通常時を「zugar/chargeを経てLTに当選する」まで裏側で高速シミュレートし、
// 投資額(円)・回転数・当選経路('zugar'|'charge')を返す。画面には結果だけを表示する。
function simulateInvestment(spinRate, confidence) {
  let mochiDama = 0;
  let toushi = 0;
  let spins = 0;

  for (;;) {
    const cost = calcSpinCost(spinRate);
    if (mochiDama >= cost) {
      mochiDama -= cost;
    } else {
      const shortfall = cost - mochiDama;
      const units = Math.ceil(shortfall / BALLS_PER_1000YEN);
      toushi += units * 1000;
      mochiDama = units * BALLS_PER_1000YEN - shortfall;
    }
    spins++;

    const result = spinNormal(confidence);
    if (result === 'miss' || result === 'false_enzoku') continue;

    if (result === 'zugar') {
      mochiDama += 1400;
      if (rollZugarLtChallenge()) {
        return { spins, toushi, path: 'zugar' };
      }
      continue;
    }

    // charge
    mochiDama += 280;
    if (rollChargeLt()) {
      return { spins, toushi, path: 'charge' };
    }
  }
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    YEN_PER_BALL,
    BALLS_PER_1000YEN,
    ballsToYen,
    simulateInvestment,
  };
}
