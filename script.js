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
  skipping: false,
  history: [],
};

const HISTORY_MAX_ITEMS = 50;

let rateSelectEl, modeSelectEl, speedSelectEl, startBtnEl,
    overlayEl, overlayBoxEl, startControlsEl,
    totalPlaysValueEl, totalProfitValueEl, maxChainValueEl, totalBallsValueEl,
    holdsRowEl, holdIconEls, currentHoldIconEl, lcdScreenEl, lcdDigitEls, rushStatusRowEl,
    stRemainingValueEl, chainCountValueEl, rushBallsValueEl,
    pauseRowEl, pauseBtnEl, endRushBtnEl, rushSpeedBtnsEl, holdLegendBodyEl,
    introTabBtnEl, introTextEl, historyListEl;

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
  holdIconEls = Array.from(document.querySelectorAll('.hold-stock-row .hold-icon'));
  currentHoldIconEl = document.getElementById('current-hold-icon');
  lcdScreenEl = document.getElementById('lcd-screen');
  lcdDigitEls = Array.from(document.querySelectorAll('.lcd-digit'));
  rushStatusRowEl = document.getElementById('rush-status-row');
  stRemainingValueEl = document.getElementById('st-remaining-value');
  chainCountValueEl = document.getElementById('chain-count-value');
  rushBallsValueEl = document.getElementById('rush-balls-value');
  pauseRowEl = document.getElementById('pause-row');
  pauseBtnEl = document.getElementById('pause-btn');
  endRushBtnEl = document.getElementById('end-rush-btn');
  rushSpeedBtnsEl = document.getElementById('rush-speed-btns');
  holdLegendBodyEl = document.getElementById('hold-legend-body');
  introTabBtnEl = document.getElementById('intro-tab-btn');
  introTextEl = document.getElementById('intro-text');
  historyListEl = document.getElementById('history-list');
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
  endRushBtnEl.addEventListener('click', endRushNow);
  introTabBtnEl.addEventListener('click', () => {
    introTextEl.hidden = !introTextEl.hidden;
    introTabBtnEl.textContent = introTextEl.hidden ? '説明を見る' : '説明を閉じる';
  });
}

function renderRushSpeedButtons() {
  Array.from(rushSpeedBtnsEl.querySelectorAll('.speed-btn')).forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.speed === game.speed);
  });
}

// RUSH中の一時停止/再開。一時停止は「新しい保留が増えるのを止める」だけで、
// 既にある保留の消化は止めずそのまま進み続ける(fillHoldQueue側でガードする)。
// そのため、一時停止中に保留を使い切ると自然に消化ループも止まり、
// 再開したタイミングで補充されて再び動き出す。
function togglePause() {
  game.paused = !game.paused;
  pauseBtnEl.textContent = game.paused ? '再開する' : '一時停止';
  pauseBtnEl.classList.toggle('active', game.paused);
  if (!game.paused && game.pendingTimeoutId === null) {
    resumeHoldFlow();
  }
}

// 一時停止中に保留の生成が止まっていた場合、再開時に補充してから
// 消化ループを動かす。scheduleHoldConsume()は「在庫が空かどうか」を
// 見て消化間隔を決めるため、必ずfillHoldQueue()より先に呼ぶ
// (fillHoldQueue()は1個目を同期的に追加してしまうため、後から呼ぶと
// 在庫0の判定ができなくなり、5倍スロー化が効かなくなる)。
// 在庫(保留1〜4)が空 = 保留0も空の状態での再開は、保留1〜4が
// 貯まるのを待ってから保留0を埋めるのではなく、真っ先に1個生成して
// そのまま保留0へ投入し、変動をすぐ開始する。保留1〜4の補充は
// その後(fillHoldQueue)で並行して貯めていく。在庫が残っている
// 場合は、通常通り消化スケジュールと補充を行う。
function resumeHoldFlow() {
  if (game.holds.length === 0 && !game.rushGenerationDone) {
    if (generateOneHold()) {
      consumeNextHold();
    }
    fillHoldQueue();
    return;
  }
  scheduleHoldConsume();
  if (!game.rushGenerationDone && game.holds.length < MAX_HOLDS) {
    fillHoldQueue();
  }
}

// 「終了する」：以後の保留消化を演出待ちなしで即座に進め、RUSH終了(st_end)まで自動で消化しきる。
// 既に表示中の演出はそのまま最後まで見せ、次の一歩から即時消化に切り替わる。
function endRushNow() {
  if (game.skipping) return;
  game.skipping = true;
  game.paused = false;
  pauseBtnEl.disabled = true;
  endRushBtnEl.disabled = true;
  showOverlay(popupHtml('<div class="result-main charge">スキップ中…</div>'));
  if (game.pendingTimeoutId === null) {
    resumeHoldFlow();
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

// ---- 履歴(常時表示) ----

const EVENT_TYPE_LABELS = { charge: 'チャージ', zugar: '図柄揃い' };

function addHistoryEntry(spins, profit, events) {
  game.history.unshift({ spins, profit, events });
  if (game.history.length > HISTORY_MAX_ITEMS) game.history.pop();
  renderHistory();
}

function renderHistory() {
  if (game.history.length === 0) {
    historyListEl.innerHTML = '<div class="history-empty">まだ履歴がありません</div>';
    return;
  }
  historyListEl.innerHTML = game.history.map((entry, i) => {
    const n = game.history.length - i;
    const cls = entry.profit > 0 ? 'green' : entry.profit < 0 ? 'red' : 'gold';
    const sign = entry.profit >= 0 ? '+' : '';
    const eventsHtml = entry.events.map((ev) => {
      const label = EVENT_TYPE_LABELS[ev.type];
      const resultText = ev.win ? 'RUSH当たり！' : '通常へ';
      return `<div class="history-event-line ${ev.win ? 'win' : ''}">${ev.spins.toLocaleString()}回転目 ${label}発生 → ${resultText}（${Math.round(ev.ballsUsed).toLocaleString()}発消費）</div>`;
    }).join('');
    return `
      <div class="history-entry">
        <div class="history-item">
          <span class="hi-n">${n}回目：大当たりまで${entry.spins.toLocaleString()}回転</span>
          <span class="hi-profit ${cls}">${sign}${entry.profit.toLocaleString()}円</span>
        </div>
        <div class="history-events">${eventsHtml}</div>
      </div>
    `;
  }).join('');
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
  game.skipping = false;
  fillHoldQueueActive = false;
  holdsRowEl.hidden = false;
  rushStatusRowEl.hidden = false;
  pauseRowEl.hidden = false;
  pauseBtnEl.textContent = '一時停止';
  pauseBtnEl.classList.remove('active');
  pauseBtnEl.disabled = false;
  endRushBtnEl.disabled = false;
  renderRushSpeedButtons();
  renderRushStatus();
  renderHolds();
  renderCurrentHold(null);
  resetLcdScreen();
  revealHoldsOneByOne();
}

const HOLD_REVEAL_STAGGER_MS = 220;

// RUSH開始時、保留を1個ずつ「ポン」と出現させながら最大4個まで貯めていく。
// スキップ中(終了するボタン押下後)は演出を待たず即座に埋める。
function revealHoldsOneByOne() {
  const added = generateOneHold();
  if (!added) {
    scheduleHoldConsume();
    return;
  }
  renderHolds();
  popHoldIcon(game.holds.length - 1);
  const delay = game.skipping ? 0 : HOLD_REVEAL_STAGGER_MS;
  game.pendingTimeoutId = setTimeout(revealHoldsOneByOne, delay);
}

// 保留を1個だけ生成してgame.holdsに追加する。生成できた場合はtrueを返す
// (ST消化が終わっているか、既に保留が上限なら何もせずfalseを返す)。
function generateOneHold() {
  if (game.rushGenerationDone || game.holds.length >= MAX_HOLDS) return false;
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
  return true;
}

// 保留消化で空いた枠を、上限(MAX_HOLDS)まで補充する。1個ずつ「ポン」と
// 出現させながら順番に埋めていく(一気に全部出さない)。一時停止からの
// 再開直後など、在庫がまとめて空だった場合でも1個ずつ貯まる様子が
// 見えるようにするための挙動。一時停止中は補充しない(=新しい保留は増えない)。
//
// 呼び出し時点の不足数(deficit)を最初に確定し、その数だけ足したら
// チェーンを終える。もし「上限に達するまで無条件に足し続ける」実装に
// すると、「最速」設定(消化間隔175ms)のようにチェーンの間隔
// (HOLD_REVEAL_STAGGER_MS=220ms)より消化ペースが速い場合、このチェーンの
// 継続チェックが「別の消化サイクルが新しく空けた枠」にまで反応して
// しまい、1回の保留消化に対して保留が2個出現しているように見える
// 不具合があった。呼び出し時点の不足数だけを面倒見て終わることで、
// 後から生じた不足は「その消化サイクル自身のfillHoldQueue呼び出し」に
// 任せ、チェーン同士が干渉しないようにする。
let fillHoldQueueActive = false;

function fillHoldQueue() {
  if (game.paused || fillHoldQueueActive || game.rushGenerationDone) return;
  const deficit = MAX_HOLDS - game.holds.length;
  if (deficit <= 0) return;
  fillHoldQueueActive = true;
  fillHoldQueueStep(deficit);
}

function fillHoldQueueStep(remaining) {
  if (remaining <= 0 || game.paused || game.rushGenerationDone || game.holds.length >= MAX_HOLDS) {
    fillHoldQueueActive = false;
    return;
  }
  if (!generateOneHold()) {
    fillHoldQueueActive = false;
    return;
  }
  // renderHolds()(全枠リセット)ではなく、新しく増えた枠だけを更新する
  // (他の枠のクラスを不要に触らないため)。
  renderHoldAt(game.holds.length - 1);
  popHoldIcon(game.holds.length - 1);
  const delay = game.skipping ? 0 : HOLD_REVEAL_STAGGER_MS;
  setTimeout(() => fillHoldQueueStep(remaining - 1), delay);
}

function renderHoldAt(index) {
  const el = holdIconEls[index];
  if (!el) return;
  const hold = game.holds[index];
  el.className = 'hold-icon';
  if (hold) el.classList.add(`hold-${hold.color}`);
}

function renderHolds() {
  holdIconEls.forEach((el, i) => {
    const hold = game.holds[i];
    el.className = 'hold-icon';
    if (hold) el.classList.add(`hold-${hold.color}`);
  });
}

// 保留アイコンの登場アニメーションを(再)発火させる。既に再生中でも
// リフローを挟んでクラスを付け直すことで、アニメーションを最初からやり直す。
function popHoldIcon(index) {
  const el = holdIconEls[index];
  if (!el) return;
  el.classList.remove('hold-pop');
  void el.offsetWidth;
  el.classList.add('hold-pop');
}

// 保留ストック(下段)が1個消化されて右隣が詰めた枠(index 0〜2)に、
// 左へスライドするアニメーションを(再)発火させる。新規生成された枠
// (popHoldIconで別途処理済み)には掛けない。
function slideHoldIconsLeft() {
  for (let i = 0; i < MAX_HOLDS - 1; i++) {
    if (!game.holds[i]) continue;
    const el = holdIconEls[i];
    if (!el) continue;
    el.classList.remove('hold-slide');
    void el.offsetWidth;
    el.classList.add('hold-slide');
  }
}

// 現在処理中の保留(保留0)を、他より大きく単独で表示する。
// 到着時点ではまだ当落は見せない(hold-pop)。外れが確定してフッと
// 消える(hold-flash-out)のは、液晶の3桁が停止する瞬間に合わせて
// flashOutCurrentHold()を別途呼ぶ(runLcdSequence側)。
function renderCurrentHold(hold) {
  currentHoldIconEl.className = 'hold-icon';
  if (!hold) return;
  currentHoldIconEl.classList.add(`hold-${hold.color}`);
  void currentHoldIconEl.offsetWidth;
  currentHoldIconEl.classList.add('hold-pop');
}

// 外れ確定(液晶の3桁が停止する瞬間)に呼び、保留アイコンの消滅
// タイミングを液晶の停止と揃える。
function flashOutCurrentHold() {
  currentHoldIconEl.classList.remove('hold-pop');
  void currentHoldIconEl.offsetWidth;
  currentHoldIconEl.classList.add('hold-flash-out');
}

function renderRushStatus() {
  stRemainingValueEl.textContent = game.revealedStRemaining;
  chainCountValueEl.textContent = game.revealedChain;
  rushBallsValueEl.textContent = game.rushBalls.toLocaleString();
}

// 一時停止中でも、既に保留にある分の消化は止めない(止まるのは補充だけ)。
// 保留を使い切ったとき：一時停止中、またはST消化(保留生成)が完全に
// 終わっている場合は、消化するものがないため待機状態にする。
// それ以外(再開直後などで保留0のみ・在庫が空)の場合は、消化間隔を
// 通常の5倍に伸ばし、fillHoldQueueが保留1〜4を1個ずつ貯める時間を作る。
const EMPTY_STOCK_SLOWDOWN = 3;

// 保留0の外れフラッシュアウト(#current-hold-icon.hold-flash-out、
// style.cssのcurrentHoldFlashOutと同じ0.55秒)の再生が終わるまでの
// 最短保証時間。「速い」(350ms)「最速」(175ms)設定だと、この時間より
// 先に次の保留が到着してしまい、フェードアウトの途中でいきなり次の
// 登場アニメーションに切り替わって「消えかけ→すぐ出現」に見える
// 事故があったため、外れ後の呼び出し(minDelayMs指定時)だけ間隔を
// この時間以上に底上げする。
const CURRENT_HOLD_FLASH_OUT_MS = 550;

function scheduleHoldConsume(minDelayMs = 0) {
  if (game.holds.length === 0 && (game.paused || game.rushGenerationDone)) {
    game.pendingTimeoutId = null;
    return;
  }
  const baseInterval = rushSpeedIntervalMs(game.speed);
  const interval = game.holds.length === 0 ? baseInterval * EMPTY_STOCK_SLOWDOWN : baseInterval;
  const delay = game.skipping ? 0 : Math.max(interval, minDelayMs);
  game.pendingTimeoutId = setTimeout(consumeNextHold, delay);
}

// 保留0の登場が始まってから、液晶の数字変動が始まるまでの間隔。
// 「保留消化開始→数字変動開始」の間に見てわかる判定タイムを作る。
// スキップ中は待たない。
const HOLD_ARRIVAL_MS = 210;

// 保留1が消える(保留0へ移動する)のと、保留2〜4が1つずつ若い番号へ
// 詰める(slideHoldIconsLeft)のは同時に起きる「移動の仕組み」。新しい
// 保留が保留4に追加されるのは、これとは別の「追加の仕組み」
// (fillHoldQueue、変動終了時に呼ばれる)。
function consumeNextHold() {
  const hold = game.holds.shift();
  renderHolds();
  slideHoldIconsLeft();
  renderCurrentHold(hold);

  const revealDelay = game.skipping ? 0 : HOLD_ARRIVAL_MS;
  game.pendingTimeoutId = setTimeout(() => resolveHold(hold), revealDelay);
}

function resolveHold(hold) {
  if (hold.outcome === 'st_end') {
    resetLcdScreen();
    finishRush();
    return;
  }

  const isHit = hold.outcome === 'hit_small' || hold.outcome === 'hit_big';
  // 外れの場合のガセリーチ(はずれリーチ)判定：当たりと同じ
  // 「はさみテンパイ」を見せてから、テンパイ数字+1(8の場合は1)で
  // 止まって外れる。保留の色が点滅以上(無色以外)なら必ずリーチする。
  // 無色の場合は、大当たり確率P_RUSHと同じ確率で抽選する。
  const isFakeReach = !isHit && (hold.color !== 'none' || Math.random() < P_RUSH);
  runLcdSequence(isHit, isFakeReach, () => {
    if (!isHit) {
      game.revealedStRemaining -= 1;
      renderRushStatus();
      // scheduleHoldConsume()を先に呼ぶ理由はresumeHoldFlow()と同じ
      // (fillHoldQueue()は在庫0判定を壊してしまうため)。外れの直後は
      // 保留0のフラッシュアウト再生時間を最短保証する(上のコメント参照)。
      scheduleHoldConsume(CURRENT_HOLD_FLASH_OUT_MS);
      fillHoldQueue();
      return;
    }

    const isBig = hold.outcome === 'hit_big';
    const balls = rushHitBalls(hold.outcome);
    game.rushBalls += balls;
    game.revealedChain += 1;
    game.revealedStRemaining = game.stCountConst;
    vanishLcdDigits(() => {
      showHitAnnouncement(isBig, balls, game.revealedChain, () => {
        hideOverlay();
        scheduleHoldConsume();
        fillHoldQueue();
      });
    });
  });
}

// ---- 液晶(3桁)演出 ----
// 保留消化のたびに3桁が回転する。当たりの場合：まず少し回してから
// 両端(1・3桁目)を先に止め(はさみテンパイ)、挟まれた真ん中の桁が
// 回り続けたまま約3秒の緊張を作ってから3桁を揃え、0.5秒待って
// onDoneへ進む(onDone側で3桁を一瞬消してから当選告知の画像に
// 引き継ぐ、vanishLcdDigits参照)。外れの場合：通常は短い回転の
// 後、揃わずに止まってすぐonDoneへ進むが、一部(確率P_RUSH)は当たりと
// 同じはさみテンパイを見せてから、テンパイ数字+1(8なら1)で止まる
// ガセリーチになる(isFakeReach、nearMissDigit参照)。数字自体は演出用
// の飾りで、当落は既にhold.outcomeで決まっている。スキップ中は
// 回転を見せず、結果の数字だけ即座に表示してonDoneへ進む。
const LCD_SPIN_TICK_MS = 70;
const LCD_REACH_START_DELAY_MS = 280;
const LCD_REACH_HOLD_MS = 3000;
const LCD_ALIGN_TO_NEXT_MS = 500;
const LCD_MISS_SPIN_MS = 450;

let lcdSpinIntervalId = null;

function randomDigit() {
  return Math.floor(Math.random() * 8) + 1; // 1〜8
}

// 外れ用：3桁が偶然揃ってしまわないよう、1桁目と異なる値を2・3桁目に選ぶ。
function randomNonMatchingTriple() {
  const a = randomDigit();
  let b = randomDigit();
  while (b === a) b = randomDigit();
  let c = randomDigit();
  while (c === a) c = randomDigit();
  return [a, b, c];
}

// ガセリーチ(はずれリーチ)の真ん中の桁：テンパイ数字+1(8の場合は1)。
// 例：テンパイ数字が2なら「2 3 2」のように1つだけずれて外れる。
function nearMissDigit(reachDigit) {
  return reachDigit >= 8 ? 1 : reachDigit + 1;
}

function setLcdDigit(index, value) {
  const el = lcdDigitEls[index];
  if (el) el.textContent = value === null ? '-' : String(value);
}

function startLcdSpin(indices) {
  stopLcdSpin();
  lcdSpinIntervalId = setInterval(() => {
    indices.forEach((i) => setLcdDigit(i, randomDigit()));
  }, LCD_SPIN_TICK_MS);
}

function stopLcdSpin() {
  if (lcdSpinIntervalId !== null) {
    clearInterval(lcdSpinIntervalId);
    lcdSpinIntervalId = null;
  }
}

function resetLcdScreen() {
  stopLcdSpin();
  lcdScreenEl.classList.remove('lcd-reach', 'lcd-aligned');
  setLcdDigit(0, null);
  setLcdDigit(1, null);
  setLcdDigit(2, null);
}

// 揃った3桁を一瞬で消してから当選告知(画像)へ引き継ぐ。スキップ中は
// アニメーションを待たず即座に消す。
const LCD_VANISH_MS = 200;

function vanishLcdDigits(onDone) {
  lcdScreenEl.classList.remove('lcd-aligned');
  lcdDigitEls.forEach((el) => {
    el.classList.remove('lcd-vanish');
    void el.offsetWidth;
    el.classList.add('lcd-vanish');
  });
  const delay = game.skipping ? 0 : LCD_VANISH_MS;
  game.pendingTimeoutId = setTimeout(() => {
    setLcdDigit(0, null);
    setLcdDigit(1, null);
    setLcdDigit(2, null);
    lcdDigitEls.forEach((el) => el.classList.remove('lcd-vanish'));
    onDone();
  }, delay);
}

// isHit: 当たりなら3桁を揃える。isFakeReach: 外れだが当たりと同じ
// リーチ演出を見せてから、テンパイ数字+1で外れる(ガセリーチ)。
// どちらもfalseなら、リーチなしの短い回転で外れる。
function runLcdSequence(isHit, isFakeReach, onDone) {
  lcdScreenEl.classList.remove('lcd-reach', 'lcd-aligned');
  const showReach = isHit || isFakeReach;

  if (game.skipping) {
    stopLcdSpin();
    if (isHit) {
      const d = randomDigit();
      setLcdDigit(0, d);
      setLcdDigit(1, d);
      setLcdDigit(2, d);
    } else if (isFakeReach) {
      const d = randomDigit();
      setLcdDigit(0, d);
      setLcdDigit(1, nearMissDigit(d));
      setLcdDigit(2, d);
      flashOutCurrentHold();
    } else {
      randomNonMatchingTriple().forEach((d, i) => setLcdDigit(i, d));
      flashOutCurrentHold();
    }
    game.pendingTimeoutId = setTimeout(onDone, 0);
    return;
  }

  if (!showReach) {
    startLcdSpin([0, 1, 2]);
    game.pendingTimeoutId = setTimeout(() => {
      stopLcdSpin();
      randomNonMatchingTriple().forEach((d, i) => setLcdDigit(i, d));
      flashOutCurrentHold();
      game.pendingTimeoutId = setTimeout(onDone, 0);
    }, LCD_MISS_SPIN_MS);
    return;
  }

  // 当たり/ガセリーチ共通：両端(1・3桁目)を先に止め(はさみテンパイ)、
  // 挟まれた真ん中の桁が回り続ける。
  startLcdSpin([0, 1, 2]);
  game.pendingTimeoutId = setTimeout(() => {
    const d = randomDigit();
    setLcdDigit(0, d);
    setLcdDigit(2, d);
    lcdScreenEl.classList.add('lcd-reach');
    startLcdSpin([1]);
    game.pendingTimeoutId = setTimeout(() => {
      stopLcdSpin();
      lcdScreenEl.classList.remove('lcd-reach');
      if (isHit) {
        setLcdDigit(1, d);
        lcdScreenEl.classList.add('lcd-aligned');
        game.pendingTimeoutId = setTimeout(onDone, LCD_ALIGN_TO_NEXT_MS);
      } else {
        setLcdDigit(1, nearMissDigit(d));
        flashOutCurrentHold();
        game.pendingTimeoutId = setTimeout(onDone, 0);
      }
    }, LCD_REACH_HOLD_MS);
  }, LCD_REACH_START_DELAY_MS);
}

// ---- 演出モード別の当選告知 ----

function showHitAnnouncement(isBig, balls, chainCount, onDone) {
  if (game.skipping) {
    renderRushStatus();
    game.pendingTimeoutId = setTimeout(onDone, 0);
    return;
  }

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
  addHistoryEntry(game.investment.spins, profit, game.investment.events);

  game.skipping = false;
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
    <button type="button" class="btn-sub" id="reset-btn">最初に戻る</button>
  `));
  document.getElementById('restart-btn').addEventListener('click', restartFlow);
  document.getElementById('reset-btn').addEventListener('click', () => location.reload());
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
  renderHistory();
});
