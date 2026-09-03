'use strict';

const SPIN_RATE_OPTIONS = [14, 16, 18, 20];
const DEFAULT_SPIN_RATE = 16;

function calcSpinCost(spinRate) {
  return 250 / spinRate;
}

const P_ZUGAR        = 1 / 399.9;
const P_CHARGE       = 1 / 399.9;
const P_CHARGE_LT    = 1 / 100;
const P_ZUGAR_LT     = 0.5;

const ENZOKU_CONFIDENCE_OPTIONS = [40, 90];
const DEFAULT_ENZOKU_CONFIDENCE = 40;

function falseEnzokuProbability(confidencePercent) {
  return P_ZUGAR * ((100 - confidencePercent) / confidencePercent);
}

// Each outcome is an independent roll (not cumulative buckets on one draw),
// matching pachinko-simulator-ghouldeka's existing convention.
function spinNormal(confidencePercent) {
  if (Math.random() < P_ZUGAR)                                    return 'zugar';
  if (Math.random() < falseEnzokuProbability(confidencePercent))  return 'false_enzoku';
  if (Math.random() < P_CHARGE)                                   return 'charge';
  return 'miss';
}

function rollChargeLt() {
  return Math.random() < P_CHARGE_LT;
}

function rollZugarLtChallenge() {
  return Math.random() < P_ZUGAR_LT;
}

const P_RUSH     = 1 / 95.3;
const P_RUSH_BIG = 0.03;

function spinRush() {
  return Math.random() < P_RUSH ? 'hit' : 'miss';
}

function rollRushHitType() {
  return Math.random() < P_RUSH_BIG ? 'big' : 'small';
}

const RUSH_ST_COUNT = 130;

function createRushState() {
  return {
    stRemaining: RUSH_ST_COUNT,
    chainCount: 0,
    bonus3000: 0,
    bonus6000: 0,
    actualBalls: 0,
    nominalBalls: 0,
  };
}

function applyRushSpin(rushState) {
  const result = spinRush();
  const stRemaining = rushState.stRemaining - 1;

  if (result === 'miss') {
    if (stRemaining <= 0) {
      return { rushState: { ...rushState, stRemaining: 0 }, outcome: 'st_end' };
    }
    return { rushState: { ...rushState, stRemaining }, outcome: 'miss' };
  }

  const isBig    = rollRushHitType() === 'big';
  const balls    = isBig ? 5600 : 2800;
  const nominal  = isBig ? 6000 : 3000;

  const newState = {
    stRemaining:  RUSH_ST_COUNT,
    chainCount:   rushState.chainCount + 1,
    bonus3000:    rushState.bonus3000 + (isBig ? 0 : 1),
    bonus6000:    rushState.bonus6000 + (isBig ? 1 : 0),
    actualBalls:  rushState.actualBalls  + balls,
    nominalBalls: rushState.nominalBalls + nominal,
  };

  return { rushState: newState, outcome: isBig ? 'hit_big' : 'hit_small' };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    SPIN_RATE_OPTIONS,
    DEFAULT_SPIN_RATE,
    calcSpinCost,
    P_ZUGAR,
    P_CHARGE,
    P_CHARGE_LT,
    P_ZUGAR_LT,
    ENZOKU_CONFIDENCE_OPTIONS,
    DEFAULT_ENZOKU_CONFIDENCE,
    falseEnzokuProbability,
    spinNormal,
    rollChargeLt,
    rollZugarLtChallenge,
    P_RUSH,
    P_RUSH_BIG,
    spinRush,
    rollRushHitType,
    RUSH_ST_COUNT,
    createRushState,
    applyRushSpin,
  };
}
