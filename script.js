'use strict';

const game = {
  spinRate: DEFAULT_SPIN_RATE,
  confidence: DEFAULT_ENZOKU_CONFIDENCE,
  mode: DEFAULT_RUSH_MODE,
  investment: null,
  rush: null,
  stCountConst: 0,
  holds: [],
  rushGenerationDone: false,
  rushBalls: 0,
  revealedStRemaining: 0,
  revealedChain: 0,
  stats: { totalPlays: 0, totalProfit: 0, maxChain: 0, totalBalls: 0 },
  pendingTimeoutId: null,
};

let rateSelectEl, confidenceSelectEl, modeSelectEl, startBtnEl,
    overlayEl, overlayBoxEl, startControlsEl,
    totalPlaysValueEl, totalProfitValueEl, maxChainValueEl, totalBallsValueEl,
    holdsRowEl, holdIconEls, rushStatusRowEl,
    stRemainingValueEl, chainCountValueEl, rushBallsValueEl;

function cacheDomRefs() {
  rateSelectEl = document.getElementById('rate-select');
  confidenceSelectEl = document.getElementById('confidence-select');
  modeSelectEl = document.getElementById('mode-select');
  startBtnEl = document.getElementById('start-btn');
  overlayEl = document.getElementById('overlay');
  overlayBoxEl = document.getElementById('overlay-box');
  startControlsEl = document.getElementById('start-controls');
  totalPlaysValueEl = document.getElementById('total-plays-value');
  totalProfitValueEl = document.getElementById('total-profit-value');
  maxChainValueEl = document.getElementById('max-chain-value');
  totalBallsValueEl = document.getElementById('total-balls-value');
  holdsRowEl = document.getElementById('holds-row');
  holdIconEls = Array.from(document.querySelectorAll('.hold-icon'));
  rushStatusRowEl = document.getElementById('rush-status-row');
  stRemainingValueEl = document.getElementById('st-remaining-value');
  chainCountValueEl = document.getElementById('chain-count-value');
  rushBallsValueEl = document.getElementById('rush-balls-value');
}

function populateSelects() {
  rateSelectEl.innerHTML = SPIN_RATE_OPTIONS.map(
    (rate) => `<option value="${rate}" ${rate === DEFAULT_SPIN_RATE ? 'selected' : ''}>${rate}回転／千円</option>`
  ).join('');
  confidenceSelectEl.innerHTML = ENZOKU_CONFIDENCE_OPTIONS.map(
    (c) => `<option value="${c}" ${c === DEFAULT_ENZOKU_CONFIDENCE ? 'selected' : ''}>${c}%</option>`
  ).join('');
  modeSelectEl.innerHTML = RUSH_MODE_OPTIONS.map(
    (m) => `<option value="${m.id}" ${m.id === DEFAULT_RUSH_MODE ? 'selected' : ''}>${m.label}</option>`
  ).join('');
}

function bindEvents() {
  rateSelectEl.addEventListener('change', () => { game.spinRate = Number(rateSelectEl.value); });
  confidenceSelectEl.addEventListener('change', () => { game.confidence = Number(confidenceSelectEl.value); });
  modeSelectEl.addEventListener('change', () => { game.mode = modeSelectEl.value; });
  startBtnEl.addEventListener('click', startInvestmentFlow);
}

function renderStats() {
  totalPlaysValueEl.textContent = game.stats.totalPlays.toLocaleString();
  const profit = game.stats.totalProfit;
  totalProfitValueEl.textContent = `${profit >= 0 ? '+' : ''}${profit.toLocaleString()}`;
  totalProfitValueEl.classList.remove('green', 'red', 'gold');
  totalProfitValueEl.classList.add(profit > 0 ? 'green' : profit < 0 ? 'red' : 'gold');
  maxChainValueEl.textContent = `${game.stats.maxChain}連`;
  totalBallsValueEl.textContent = game.stats.totalBalls.toLocaleString();
}

function showOverlay(html) {
  overlayBoxEl.innerHTML = html;
  overlayEl.hidden = false;
}

function hideOverlay() {
  overlayEl.hidden = true;
  overlayBoxEl.innerHTML = '';
}

function popupHtml(inner) {
  return `<div class="screen">${inner}</div>`;
}

// ---- 投資額シミュレーション〜RUSH突入演出 ----

function startInvestmentFlow() {
  startControlsEl.hidden = true;
  rateSelectEl.disabled = true;
  confidenceSelectEl.disabled = true;
  modeSelectEl.disabled = true;

  game.investment = simulateInvestment(game.spinRate, game.confidence);

  showOverlay(popupHtml(`
    <div class="result-main charge">投資額 ${game.investment.toushi.toLocaleString()}円</div>
    <div class="result-sub">（${game.investment.spins.toLocaleString()}回転）</div>
  `));

  game.pendingTimeoutId = setTimeout(showRouteTelop, 1800);
}

function showRouteTelop() {
  const text = game.investment.path === 'zugar'
    ? '図柄揃い → LTチャレンジ成功！'
    : 'CHARGE → LT当選！';
  showOverlay(popupHtml(`<div class="result-main rush">${text}</div>`));
  game.pendingTimeoutId = setTimeout(showRushEntry, 1600);
}

function showRushEntry() {
  showOverlay(popupHtml(`<div class="rush-title rush-title-enter">LT突入！</div>`));
  game.pendingTimeoutId = setTimeout(() => {
    hideOverlay();
    enterRush();
  }, 2000);
}

// ---- RUSH中：保留システム ----

function enterRush() {
  game.rush = createRushState();
  game.stCountConst = game.rush.stRemaining;
  game.holds = [];
  game.rushGenerationDone = false;
  game.rushBalls = 0;
  game.revealedStRemaining = game.stCountConst;
  game.revealedChain = 0;
  holdsRowEl.hidden = false;
  rushStatusRowEl.hidden = false;
  renderRushStatus();
  fillHoldQueue();
  scheduleHoldConsume();
}

function fillHoldQueue() {
  while (!game.rushGenerationDone && game.holds.length < MAX_HOLDS) {
    const { rushState, outcome } = applyRushSpin(game.rush);
    game.rush = rushState;
    let color = rollHoldColor(outcome);
    if (game.mode === 'rize' && (outcome === 'hit_small' || outcome === 'hit_big')) {
      color = 'rainbow';
    }
    game.holds.push({ outcome, color });
    if (outcome === 'st_end') {
      game.rushGenerationDone = true;
    }
  }
  renderHolds();
}

function renderHolds() {
  holdIconEls.forEach((el, i) => {
    const hold = game.holds[i];
    el.className = 'hold-icon';
    if (hold) el.classList.add(`hold-${hold.color}`);
  });
}

function renderRushStatus() {
  stRemainingValueEl.textContent = game.revealedStRemaining;
  chainCountValueEl.textContent = game.revealedChain;
  rushBallsValueEl.textContent = game.rushBalls.toLocaleString();
}

function scheduleHoldConsume() {
  game.pendingTimeoutId = setTimeout(consumeNextHold, HOLD_CONSUME_INTERVAL_MS);
}

function consumeNextHold() {
  const hold = game.holds.shift();
  renderHolds();

  if (hold.outcome === 'st_end') {
    finishRush();
    return;
  }

  if (hold.outcome === 'miss') {
    game.revealedStRemaining -= 1;
    renderRushStatus();
    fillHoldQueue();
    scheduleHoldConsume();
    return;
  }

  const isBig = hold.outcome === 'hit_big';
  const balls = isBig ? 5600 : 2800;
  game.rushBalls += balls;
  game.revealedChain += 1;
  game.revealedStRemaining = game.stCountConst;
  renderRushStatus();
  showHitAnnouncement(isBig, game.revealedChain, () => {
    hideOverlay();
    fillHoldQueue();
    scheduleHoldConsume();
  });
}

// ---- 演出モード別の当選告知 ----

function showHitAnnouncement(isBig, chainCount, onDone) {
  const label = isBig ? '6000個' : '3000個';
  const balls = isBig ? 5600 : 2800;
  const baseHtml = `
    <img src="画像/RUSH中　追加ボーナス演出.png" class="enzoku-img" alt="RUSHボーナス演出">
    <div class="add-rush-title">${label}！</div>
    <div class="chain-label">＋${balls}球 (${chainCount}連)</div>
  `;

  if (game.mode === 'tokigeki') {
    showOverlay(popupHtml(`<div class="tokigeki-cutin">突撃！</div>${baseHtml}`));
    game.pendingTimeoutId = setTimeout(onDone, 1800);
    return;
  }

  if (game.mode === 'tsukiyama') {
    showTsukiyamaCountdown(() => {
      showOverlay(popupHtml(baseHtml));
      game.pendingTimeoutId = setTimeout(onDone, 1200);
    });
    return;
  }

  // default / rize（rizeは保留取得時点の虹色一発告知が主眼のため、消化時はdefaultと同じ表示）
  showOverlay(popupHtml(baseHtml));
  game.pendingTimeoutId = setTimeout(onDone, 1200);
}

function showTsukiyamaCountdown(onDone) {
  let count = 3;
  const step = () => {
    showOverlay(popupHtml(`<div class="tsukiyama-count">${count}</div>`));
    if (count <= 1) {
      game.pendingTimeoutId = setTimeout(onDone, 600);
      return;
    }
    count--;
    game.pendingTimeoutId = setTimeout(step, 600);
  };
  step();
}

// ---- 初期化 ----

document.addEventListener('DOMContentLoaded', () => {
  cacheDomRefs();
  populateSelects();
  bindEvents();
  renderStats();
});
