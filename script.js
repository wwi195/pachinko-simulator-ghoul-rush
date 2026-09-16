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
// 既にある保留の消化は止めずそのまま進み続ける(holdFillTick側でガードする、
// 補充ループ自体は止めない)。そのため、一時停止中に保留を使い切ると
// 自然に消化ループも止まり、再開したタイミングで補充されて再び動き出す。
function togglePause() {
  game.paused = !game.paused;
  pauseBtnEl.textContent = game.paused ? '再開する' : '一時停止';
  pauseBtnEl.classList.toggle('active', game.paused);
  if (!game.paused && game.pendingTimeoutId === null) {
    resumeHoldFlow();
  }
}

// 消化ループを再開するだけでよい。保留補充(holdFillTick)は一時停止中も
// チックし続けている(補充自体をスキップしているだけ)ので、再開時に
// 別途起動し直す必要はない。scheduleHoldConsume()はEMPTY_STOCK_WAIT_MSで
// 補充ループが保留を用意するのを待つため、在庫の有無にかかわらず
// 同じ処理でよい。
function resumeHoldFlow() {
  scheduleHoldConsume();
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
  startHoldFillLoop();
  scheduleHoldConsume();
}

// 保留を1個だけ生成してgame.holdsに追加する。生成できた場合はtrueを返す
// (ST消化が終わっているか、既に保留が上限なら何もせずfalseを返す)。
// 当落(outcome)・色(color)だけでなく、リーチするか(isReach)・テンパイ数字
// (reachDigit)もこの時点で全て確定させる。保留が先頭(保留0)に来て消化が
// 始まった時点では、もう何も抽選しない(結果を再生するだけ)。
function generateOneHold() {
  if (game.rushGenerationDone || game.holds.length >= MAX_HOLDS) return false;
  const { rushState, outcome } = applyRushSpin(game.rush);
  game.rush = rushState;
  let color = rollHoldColor(outcome);
  if (game.mode === 'rize' && (outcome === 'hit_small' || outcome === 'hit_big')) {
    color = 'rainbow';
  }

  const isHit = outcome === 'hit_small' || outcome === 'hit_big';
  // ガセリーチ(はずれリーチ)判定：保留の色が点滅以上(無色以外)なら必ず
  // リーチする。無色の場合は、大当たり確率P_RUSHと同じ確率で抽選する。
  const isFakeReach = !isHit && (color !== 'none' || Math.random() < P_RUSH);
  const isReach = isHit || isFakeReach;
  // テンパイ数字は当落そのものには影響しない(P_RUSHのみで決まる)が、
  // どの数字を表示するかはisHitに応じた重み付き抽選にしている
  // (rollReachDigit、7・3は信頼度が高い代わりに出現率を下げてある)。
  const reachDigit = isReach ? rollReachDigit(isHit) : null;

  game.holds.push({ outcome, color, isReach, reachDigit });
  if (outcome === 'st_end') {
    game.rushGenerationDone = true;
  }
  return true;
}

// 保留補充は、消化・リーチ演出の進行とは完全に独立したループとして動く。
// RUSH開始(startHoldFillLoop)からRUSH終了(stopHoldFillLoop)まで、
// HOLD_FILL_TICK_MS(0.8秒)ごとにチックし続け、枠が空いていれば1個
// 補充する。リーチ演出(最大約3秒)の最中でもこのループは止まらない
// (消化側のresolveHold/scheduleHoldConsumeとは別系統のタイマー)。
// 一時停止中はチックはするが補充しない(=新しい保留は増えない)。
// スキップ中(終了するボタン押下後)はチック間隔を0にして即座に埋める。
const HOLD_FILL_TICK_MS = 800;
let holdFillTimeoutId = null;

function startHoldFillLoop() {
  stopHoldFillLoop();
  scheduleNextHoldFillTick();
}

function stopHoldFillLoop() {
  if (holdFillTimeoutId !== null) {
    clearTimeout(holdFillTimeoutId);
    holdFillTimeoutId = null;
  }
}

function scheduleNextHoldFillTick() {
  holdFillTimeoutId = setTimeout(holdFillTick, game.skipping ? 0 : HOLD_FILL_TICK_MS);
}

function holdFillTick() {
  if (!game.paused && !game.rushGenerationDone && game.holds.length < MAX_HOLDS) {
    if (generateOneHold()) {
      // renderHolds()(全枠リセット)ではなく、新しく増えた枠だけを更新する
      // (他の枠のクラスを不要に触らないため)。
      renderHoldAt(game.holds.length - 1);
      popHoldIcon(game.holds.length - 1);
    }
  }
  scheduleNextHoldFillTick();
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
// それ以外(再開直後などで保留0のみ・在庫が空)の場合は、holdFillTickが
// 保留0を実際に生成し終えるまで(HOLD_FILL_TICK_MS)、それより前に
// consumeNextHoldが空の在庫を掴んでしまわないよう待つ。ST消化速度
// (game.speed)の値にかかわらず、この待ち時間は保留補充のタイミングから
// 独立した固定値にする(速度設定によっては補充が追いつかず空振りする
// ことがあるため)。
const EMPTY_STOCK_WAIT_MS = HOLD_FILL_TICK_MS + 200;

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
  const interval = game.holds.length === 0 ? EMPTY_STOCK_WAIT_MS : baseInterval;
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
// (holdFillTick、消化とは独立したタイミングで動く)。
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
  // isReach/reachDigitは保留生成時(generateOneHold)に確定済み。ここでは
  // 何も抽選せず、その結果をそのまま再生する。
  runLcdSequence(isHit, hold.isReach, hold.reachDigit, () => {
    if (!isHit) {
      game.revealedStRemaining -= 1;
      renderRushStatus();
      // 外れの直後は保留0のフラッシュアウト再生時間を最短保証する
      // (上のCURRENT_HOLD_FLASH_OUT_MSのコメント参照)。保留補充は
      // holdFillTickが独立して行っているのでここでは呼ばない。
      scheduleHoldConsume(CURRENT_HOLD_FLASH_OUT_MS);
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
// 後、揃わずに止まってすぐonDoneへ進むが、一部は当たりと同じ
// はさみテンパイを見せてから、テンパイ数字+1(8なら1)で止まる
// ガセリーチになる(isReach、nearMissDigit参照)。リーチするかどうか・
// テンパイ数字(reachDigit)は保留生成時(generateOneHold)に確定済みで、
// ここではその結果を再生するだけ(何も抽選しない)。スピン中に見える
// パラパラ変化(startLcdSpin)と、リーチなし外れの一瞬だけ映る3桁
// (randomNonMatchingTriple)は結果に意味を持たない演出ノイズなので、
// これらだけは引き続きこの場で都度ランダムに生成する。スキップ中は
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

// isHit: 当たりなら3桁を揃える。isReach: 外れだが当たりと同じ
// リーチ演出を見せてから、テンパイ数字+1で外れる(ガセリーチ)。
// どちらもfalseなら、リーチなしの短い回転で外れる。reachDigitは
// isReach時のテンパイ数字(generateOneHoldで確定済み、isReach=falseなら
// null)。
function runLcdSequence(isHit, isReach, reachDigit, onDone) {
  lcdScreenEl.classList.remove('lcd-reach', 'lcd-aligned');

  if (game.skipping) {
    stopLcdSpin();
    if (isHit) {
      const d = reachDigit;
      setLcdDigit(0, d);
      setLcdDigit(1, d);
      setLcdDigit(2, d);
    } else if (isReach) {
      const d = reachDigit;
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

  if (!isReach) {
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
    const d = reachDigit;
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
  stopHoldFillLoop();

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
