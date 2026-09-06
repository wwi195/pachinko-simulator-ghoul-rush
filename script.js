'use strict';

const game = {
  spinRate: DEFAULT_SPIN_RATE,
  mode: DEFAULT_RUSH_MODE,
  speed: DEFAULT_RUSH_SPEED,
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
  paused: false,
};

let rateSelectEl, modeSelectEl, speedSelectEl, startBtnEl,
    overlayEl, overlayBoxEl, startControlsEl,
    totalPlaysValueEl, totalProfitValueEl, maxChainValueEl, totalBallsValueEl,
    holdsRowEl, holdIconEls, rushStatusRowEl,
    stRemainingValueEl, chainCountValueEl, rushBallsValueEl,
    pauseRowEl, pauseBtnEl, rushSpeedBtnsEl, holdLegendBodyEl;

function cacheDomRefs() {
  rateSelectEl = document.getElementById('rate-select');
  modeSelectEl = document.getElementById('mode-select');
  speedSelectEl = document.getElementById('speed-select');
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
  pauseRowEl = document.getElementById('pause-row');
  pauseBtnEl = document.getElementById('pause-btn');
  rushSpeedBtnsEl = document.getElementById('rush-speed-btns');
  holdLegendBodyEl = document.getElementById('hold-legend-body');
}

const HOLD_COLOR_LABELS = { none: '無色', flash: '点滅', blue: '青', green: '緑', red: '赤', rainbow: '虹' };

function formatHoldColorRate(color) {
  const rate = holdColorHitRate(color);
  if (rate <= 0) return 'ほぼ期待できない';
  if (rate >= 1) return '当選濃厚(100%)';
  return `約${Math.round(rate * 100)}%`;
}

function populateSelects() {
  rateSelectEl.innerHTML = SPIN_RATE_OPTIONS.map(
    (rate) => `<option value="${rate}" ${rate === DEFAULT_SPIN_RATE ? 'selected' : ''}>${rate}回転／千円</option>`
  ).join('');
  modeSelectEl.innerHTML = RUSH_MODE_OPTIONS.map(
    (m) => `<option value="${m.id}" ${m.id === DEFAULT_RUSH_MODE ? 'selected' : ''}>${m.label}</option>`
  ).join('');
  speedSelectEl.innerHTML = RUSH_SPEED_OPTIONS.map(
    (s) => `<option value="${s.id}" ${s.id === DEFAULT_RUSH_SPEED ? 'selected' : ''}>${s.label}</option>`
  ).join('');
  rushSpeedBtnsEl.innerHTML = RUSH_SPEED_OPTIONS.map(
    (s) => `<button type="button" class="speed-btn" data-speed="${s.id}">${s.label.split('（')[0]}</button>`
  ).join('');
  holdLegendBodyEl.innerHTML = HOLD_COLORS.map((color) => `
    <div class="hold-legend-row">
      <span class="hold-icon hold-${color}"></span>
      <span class="hold-legend-label">${HOLD_COLOR_LABELS[color]}</span>
      <span class="hold-legend-value">${formatHoldColorRate(color)}</span>
    </div>
  `).join('');
}

function bindEvents() {
  rateSelectEl.addEventListener('change', () => { game.spinRate = Number(rateSelectEl.value); });
  modeSelectEl.addEventListener('change', () => { game.mode = modeSelectEl.value; });
  speedSelectEl.addEventListener('change', () => { game.speed = speedSelectEl.value; });
  startBtnEl.addEventListener('click', startInvestmentFlow);
  rushSpeedBtnsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('.speed-btn');
    if (!btn) return;
    game.speed = btn.dataset.speed;
    speedSelectEl.value = game.speed;
    renderRushSpeedButtons();
  });
  pauseBtnEl.addEventListener('click', togglePause);
}

function renderRushSpeedButtons() {
  Array.from(rushSpeedBtnsEl.querySelectorAll('.speed-btn')).forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.speed === game.speed);
  });
}

// RUSH中の自動消化を一時停止/再開する。演出アニメーションの途中では止めず、
// 次に保留を消化しようとするタイミング(scheduleHoldConsumeの呼び出し)で止まる。
function togglePause() {
  game.paused = !game.paused;
  pauseBtnEl.textContent = game.paused ? '再開する' : '一時停止';
  pauseBtnEl.classList.toggle('active', game.paused);
  if (!game.paused && game.pendingTimeoutId === null) {
    scheduleHoldConsume();
  }
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
  modeSelectEl.disabled = true;
  speedSelectEl.disabled = true;

  game.investment = simulateInvestment(game.spinRate);
  const { toushi, spins, chargeCount, zugarCount } = game.investment;

  showOverlay(popupHtml(`
    <div class="result-main charge">投資額 ${toushi.toLocaleString()}円</div>
    <div class="result-sub">（${spins.toLocaleString()}回転）</div>
    <div class="result-detail">道中の内訳：チャージ ${chargeCount}回 ／ 図柄揃い ${zugarCount}回</div>
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
  game.paused = false;
  holdsRowEl.hidden = false;
  rushStatusRowEl.hidden = false;
  pauseRowEl.hidden = false;
  pauseBtnEl.textContent = '一時停止';
  pauseBtnEl.classList.remove('active');
  renderRushSpeedButtons();
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
  if (game.paused) {
    game.pendingTimeoutId = null;
    return;
  }
  game.pendingTimeoutId = setTimeout(consumeNextHold, rushSpeedIntervalMs(game.speed));
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
  const balls = rushHitBalls(hold.outcome);
  game.rushBalls += balls;
  game.revealedChain += 1;
  game.revealedStRemaining = game.stCountConst;
  showHitAnnouncement(isBig, balls, game.revealedChain, () => {
    hideOverlay();
    fillHoldQueue();
    scheduleHoldConsume();
  });
}

// ---- 演出モード別の当選告知 ----

function showHitAnnouncement(isBig, balls, chainCount, onDone) {
  const label = isBig ? '6000個' : '3000個';
  const baseHtml = `
    <img src="画像/RUSH中　追加ボーナス演出.png" class="enzoku-img" alt="RUSHボーナス演出">
    <div class="add-rush-title">${label}！</div>
    <div class="chain-label">＋${balls}球 (${chainCount}連)</div>
  `;

  if (game.mode === 'tokigeki') {
    renderRushStatus();
    showOverlay(popupHtml(`<div class="tokigeki-cutin">突撃！</div>${baseHtml}`));
    game.pendingTimeoutId = setTimeout(onDone, 1800);
    return;
  }

  if (game.mode === 'tsukiyama') {
    showTsukiyamaCountdown(() => {
      renderRushStatus();
      showOverlay(popupHtml(baseHtml));
      game.pendingTimeoutId = setTimeout(onDone, 1200);
    });
    return;
  }

  // default / rize（rizeは保留取得時点の虹色一発告知が主眼のため、消化時はdefaultと同じ表示）
  renderRushStatus();
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

// ---- RUSH終了 ----

function finishRush() {
  const chain = game.revealedChain;
  const balls = game.rushBalls;
  const profit = ballsToYen(balls) - game.investment.toushi;

  game.stats.totalPlays++;
  game.stats.totalProfit += profit;
  game.stats.maxChain = Math.max(game.stats.maxChain, chain);
  game.stats.totalBalls += balls;
  renderStats();

  holdsRowEl.hidden = true;
  rushStatusRowEl.hidden = true;
  pauseRowEl.hidden = true;

  showOverlay(popupHtml(`
    <div class="rush-result-title">RUSH終了</div>
    <div class="rush-result-box">
      <div class="result-row highlight">
        <span class="rr-label">連チャン数</span>
        <span class="rr-val gold">${chain}連</span>
      </div>
      <div class="result-row">
        <span class="rr-label">獲得出玉</span>
        <span class="rr-val gold">${balls.toLocaleString()}発</span>
      </div>
      <div class="result-row">
        <span class="rr-label">投資額</span>
        <span class="rr-val">${game.investment.toushi.toLocaleString()}円</span>
      </div>
      <hr class="result-hr">
      <div class="result-row highlight">
        <span class="rr-label">収支</span>
        <span class="rr-val gold">${profit >= 0 ? '+' : ''}${profit.toLocaleString()}円</span>
      </div>
    </div>
    <button type="button" class="btn-action" id="restart-btn">もう一度スタート</button>
  `));
  document.getElementById('restart-btn').addEventListener('click', restartFlow);
}

function restartFlow() {
  hideOverlay();
  startControlsEl.hidden = false;
  rateSelectEl.disabled = false;
  modeSelectEl.disabled = false;
  speedSelectEl.disabled = false;
}

// ---- 初期化 ----

document.addEventListener('DOMContentLoaded', () => {
  cacheDomRefs();
  populateSelects();
  bindEvents();
  renderStats();
});
