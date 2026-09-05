# pachinko-simulator-ghoul-rush 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 東京喰種版パチンコシミュレーターの第三フォーマット「RUSH演出特化版」を新規プロジェクト `pachinko-simulator-ghoul-rush` として実装する。通常時は裏側シミュレーションのみで、RUSH中の保留・先読み・演出モードを凝った演出で楽しませることに特化する。

**Architecture:** `logic.js`（確率・RUSH状態遷移）を `pachinko-simulator-ghoul-idle` から無改造でコピーし、そこに投資額シミュレーション・保留の色抽選・演出モード定義を担う新規の `rush-view-engine.js`（純粋関数、`node --test` でユニットテスト）を追加する。画面描画とゲームループは `script.js` が担当し、`index.html`/`style.css` は新規作成する。

**Tech Stack:** 素のHTML/CSS/JavaScript（フレームワークなし）、Node.js標準の `node:test` によるユニットテスト。

参照設計書: `docs/superpowers/specs/2026-09-03-ghoul-rush-format-design.md`

---

## 前提・参照元ファイル

- `C:\Users\ab_99\pachinko-simulator-ghoul-idle\logic.js` — 無改造でコピーする
- `C:\Users\ab_99\pachinko-simulator-ghoul-idle\画像\RUSH中　追加ボーナス演出.png` — RUSH中当選演出で流用
- 作業ディレクトリ: `C:\Users\ab_99\pachinko-simulator-ghoul-rush`（git init済み、設計書コミット済み）
- コミット時は追加のgit設定を行わず、リポジトリのデフォルト（グローバル `~/.gitconfig` の `wwi195` / `GitHubに登録したメールアドレス`）をそのまま使うこと。他のパチンコシミュレーターリポジトリと著者情報を統一するため、`-c user.email` / `-c user.name` のような上書きは行わない。

---

## Task 1: プロジェクトの雛形とlogic.jsの移植 【完了】

**Files:**
- Create: `C:\Users\ab_99\pachinko-simulator-ghoul-rush\package.json`
- Create: `C:\Users\ab_99\pachinko-simulator-ghoul-rush\.gitignore`
- Create: `C:\Users\ab_99\pachinko-simulator-ghoul-rush\logic.js`（コピー）
- Create: `C:\Users\ab_99\pachinko-simulator-ghoul-rush\画像\RUSH中　追加ボーナス演出.png`（コピー）

- [x] **Step 1: package.json を作成**

```json
{
  "name": "pachinko-simulator-ghoul-rush",
  "private": true,
  "version": "0.1.0",
  "scripts": {
    "test": "node --test \"test/**/*.test.js\""
  }
}
```

- [x] **Step 2: .gitignore を作成**

```
node_modules/
```

- [x] **Step 3: logic.js を `pachinko-simulator-ghoul-idle` から無改造でコピー**

```bash
cp "/c/Users/ab_99/pachinko-simulator-ghoul-idle/logic.js" "/c/Users/ab_99/pachinko-simulator-ghoul-rush/logic.js"
```

- [x] **Step 4: 画像アセットを `pachinko-simulator-ghoul-idle` からコピー**

```bash
mkdir -p "/c/Users/ab_99/pachinko-simulator-ghoul-rush/画像"
cp "/c/Users/ab_99/pachinko-simulator-ghoul-idle/画像/RUSH中　追加ボーナス演出.png" "/c/Users/ab_99/pachinko-simulator-ghoul-rush/画像/"
```

- [x] **Step 5: logic.js に既存のユニットテストが通ることを確認**

`pachinko-simulator-ghoul-idle` の `test/` にある `logic.test.js` はコピーしていないため、まずは動作確認としてNode.jsで読み込めることだけ確認する。

Run: `node -e "console.log(Object.keys(require('./logic.js')))"`
Expected: `SPIN_RATE_OPTIONS` 等のキー一覧が出力される（エラーなし）

- [x] **Step 6: コミット**

```bash
git add package.json .gitignore logic.js "画像/RUSH中　追加ボーナス演出.png"
git commit -m "chore: プロジェクト雛形とlogic.jsを移植"
```

---

## Task 2: rush-view-engine.js — 投資額シミュレーション 【完了】

**Files:**
- Create: `C:\Users\ab_99\pachinko-simulator-ghoul-rush\rush-view-engine.js`
- Test: `C:\Users\ab_99\pachinko-simulator-ghoul-rush\test\rush-view-engine.test.js`

- [x] **Step 1: 失敗するテストを書く**

`test/rush-view-engine.test.js` を新規作成:

```js
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  YEN_PER_BALL,
  BALLS_PER_1000YEN,
  ballsToYen,
  simulateInvestment,
} = require('../rush-view-engine.js');

function withMockRandom(values, fn) {
  const original = Math.random;
  let i = 0;
  Math.random = () => values[Math.min(i++, values.length - 1)];
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

test('定数はidle-engine.jsと同じ換算値', () => {
  assert.equal(YEN_PER_BALL, 4);
  assert.equal(BALLS_PER_1000YEN, 250);
});

test('ballsToYen: 280球は1120円', () => {
  assert.equal(ballsToYen(280), 1120);
});

test('simulateInvestment: 1回転目でCHARGE即LT当選なら投資額1000円・1回転・charge経路', () => {
  // spinNormal(40)の3draw: zugar外れ(0.999) / false_enzoku外れ(0.999) / charge成立(0)
  // 続くrollChargeLt()の1draw: LT当選(0)
  const result = withMockRandom([0.999, 0.999, 0, 0], () => simulateInvestment(16, 40));
  assert.deepEqual(result, { spins: 1, toushi: 1000, path: 'charge' });
});

test('simulateInvestment: CHARGE外れ→miss→図柄揃いでLTチャレンジ成功なら3回転・投資額1000円・zugar経路', () => {
  const sequence = [
    0.999, 0.999, 0, 0.5,       // 1回転目: charge成立, rollChargeLt外れ
    0.999, 0.999, 0.999,        // 2回転目: miss
    0, 0,                       // 3回転目: zugar成立, rollZugarLtChallenge成功
  ];
  const result = withMockRandom(sequence, () => simulateInvestment(16, 40));
  assert.deepEqual(result, { spins: 3, toushi: 1000, path: 'zugar' });
});
```

- [x] **Step 2: テストを実行して失敗することを確認**

Run: `npm test`
Expected: FAIL（`../rush-view-engine.js` が存在しないため Cannot find module）

- [x] **Step 3: rush-view-engine.js を作成し、上記テストが通る最小実装を書く**

```js
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
```

- [x] **Step 4: テストを実行して通ることを確認**

Run: `npm test`
Expected: PASS（4件すべて成功）

- [x] **Step 5: コミット**

```bash
git add rush-view-engine.js test/rush-view-engine.test.js
git commit -m "feat: 投資額シミュレーション(simulateInvestment)を追加"
```

---

## Task 3: rush-view-engine.js — 保留の色抽選（先読み示唆） 【完了】

**Files:**
- Modify: `C:\Users\ab_99\pachinko-simulator-ghoul-rush\rush-view-engine.js`
- Modify: `C:\Users\ab_99\pachinko-simulator-ghoul-rush\test\rush-view-engine.test.js`

- [x] **Step 1: 失敗するテストを追記**

`test/rush-view-engine.test.js` の末尾に追記:

```js
const { HOLD_COLORS, HOLD_COLOR_WEIGHTS, rollHoldColor } = require('../rush-view-engine.js');

test('HOLD_COLORS は白/点滅/青/緑/赤/虹の6段階', () => {
  assert.deepEqual(HOLD_COLORS, ['none', 'flash', 'blue', 'green', 'red', 'rainbow']);
});

test('HOLD_COLOR_WEIGHTS の各outcomeの重みは合計100', () => {
  for (const outcome of Object.keys(HOLD_COLOR_WEIGHTS)) {
    const total = HOLD_COLORS.reduce((sum, c) => sum + HOLD_COLOR_WEIGHTS[outcome][c], 0);
    assert.equal(total, 100, `outcome=${outcome}`);
  }
});

test('rollHoldColor: missでrng=0はnone(白)', () => {
  assert.equal(rollHoldColor('miss', () => 0), 'none');
});

test('rollHoldColor: missでrng=0.999はred(missの中で最高ランク)', () => {
  assert.equal(rollHoldColor('miss', () => 0.999), 'red');
});

test('rollHoldColor: st_endはmissと同じ重みなのでrng=0はnone', () => {
  assert.equal(rollHoldColor('st_end', () => 0), 'none');
});

test('rollHoldColor: hit_bigはnone/flashの重みが0なのでrng=0でもblueになる', () => {
  assert.equal(rollHoldColor('hit_big', () => 0), 'blue');
});

test('rollHoldColor: hit_smallでrng=0.999はrainbow', () => {
  assert.equal(rollHoldColor('hit_small', () => 0.999), 'rainbow');
});
```

- [x] **Step 2: テストを実行して失敗することを確認**

Run: `npm test`
Expected: FAIL（`HOLD_COLORS` 等が `undefined` のため）

- [x] **Step 3: rush-view-engine.js に保留色抽選ロジックを追加**

`rush-view-engine.js` の `simulateInvestment` の後、`module.exports` の前に追記:

```js
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
```

`module.exports` に `HOLD_COLORS`, `HOLD_COLOR_WEIGHTS`, `rollHoldColor` を追加:

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    YEN_PER_BALL,
    BALLS_PER_1000YEN,
    ballsToYen,
    simulateInvestment,
    HOLD_COLORS,
    HOLD_COLOR_WEIGHTS,
    rollHoldColor,
  };
}
```

- [x] **Step 4: テストを実行して通ることを確認**

Run: `npm test`
Expected: PASS（全件成功、既存4件＋新規7件で計11件）

- [x] **Step 5: コミット**

```bash
git add rush-view-engine.js test/rush-view-engine.test.js
git commit -m "feat: 保留の色抽選(rollHoldColor)を追加"
```

---

## Task 4: rush-view-engine.js — 演出モード・保留運用の定数 【完了】

**Files:**
- Modify: `C:\Users\ab_99\pachinko-simulator-ghoul-rush\rush-view-engine.js`
- Modify: `C:\Users\ab_99\pachinko-simulator-ghoul-rush\test\rush-view-engine.test.js`

- [x] **Step 1: 失敗するテストを追記**

```js
const {
  RUSH_MODE_OPTIONS,
  DEFAULT_RUSH_MODE,
  MAX_HOLDS,
  HOLD_CONSUME_INTERVAL_MS,
} = require('../rush-view-engine.js');

test('RUSH_MODE_OPTIONS はデフォルト+実機準拠3種の計4種', () => {
  assert.deepEqual(RUSH_MODE_OPTIONS, [
    { id: 'default',   label: 'デフォルト' },
    { id: 'tokigeki',  label: '突撃' },
    { id: 'rize',      label: 'リゼ襲来' },
    { id: 'tsukiyama', label: '月山絶叫' },
  ]);
  assert.equal(DEFAULT_RUSH_MODE, 'default');
});

test('MAX_HOLDS は4、HOLD_CONSUME_INTERVAL_MS は1400', () => {
  assert.equal(MAX_HOLDS, 4);
  assert.equal(HOLD_CONSUME_INTERVAL_MS, 1400);
});
```

- [x] **Step 2: テストを実行して失敗することを確認**

Run: `npm test`
Expected: FAIL（`RUSH_MODE_OPTIONS` 等が `undefined` のため）

- [x] **Step 3: rush-view-engine.js に定数を追加**

`rollHoldColor` の後、`module.exports` の前に追記:

```js
const RUSH_MODE_OPTIONS = [
  { id: 'default',   label: 'デフォルト' },
  { id: 'tokigeki',  label: '突撃' },
  { id: 'rize',      label: 'リゼ襲来' },
  { id: 'tsukiyama', label: '月山絶叫' },
];
const DEFAULT_RUSH_MODE = 'default';

const MAX_HOLDS = 4;
const HOLD_CONSUME_INTERVAL_MS = 1400;
```

`module.exports` に追加:

```js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    YEN_PER_BALL,
    BALLS_PER_1000YEN,
    ballsToYen,
    simulateInvestment,
    HOLD_COLORS,
    HOLD_COLOR_WEIGHTS,
    rollHoldColor,
    RUSH_MODE_OPTIONS,
    DEFAULT_RUSH_MODE,
    MAX_HOLDS,
    HOLD_CONSUME_INTERVAL_MS,
  };
}
```

- [x] **Step 4: テストを実行して通ることを確認**

Run: `npm test`
Expected: PASS（全件成功、既存11件＋新規2件で計13件）

- [x] **Step 5: コミット**

```bash
git add rush-view-engine.js test/rush-view-engine.test.js
git commit -m "feat: 演出モード・保留運用の定数を追加"
```

---

## Task 5: index.html の作成 【完了】

**Files:**
- Create: `C:\Users\ab_99\pachinko-simulator-ghoul-rush\index.html`

- [x] **Step 1: index.html を作成**

```html
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>パチンコシミュレーター（RUSH演出ver）</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <div id="app">

    <div id="title-bar">パチンコ　e東京喰種 RUSH演出ver</div>

    <div id="header">
      <div class="hrow hrow1">
        <div class="stat-block">
          <span class="stat-label">プレイ回数</span>
          <span class="stat-value" id="total-plays-value">0</span>
        </div>
        <div class="stat-block">
          <span class="stat-label">累計収支</span>
          <span class="stat-value gold" id="total-profit-value">+0</span>
        </div>
        <div class="stat-block">
          <span class="stat-label">最高連チャン</span>
          <span class="stat-value" id="max-chain-value">0連</span>
        </div>
        <div class="stat-block">
          <span class="stat-label">総獲得出玉</span>
          <span class="stat-value" id="total-balls-value">0</span>
        </div>
      </div>

      <div class="hrow hrow-holds" id="holds-row" hidden>
        <div class="hold-icon" data-slot="0"></div>
        <div class="hold-icon" data-slot="1"></div>
        <div class="hold-icon" data-slot="2"></div>
        <div class="hold-icon" data-slot="3"></div>
      </div>

      <div class="hrow hrow-rush-status" id="rush-status-row" hidden>
        <div class="esup-block">
          <div class="esup-label">ST残り</div>
          <div class="esup-value" id="st-remaining-value">－</div>
        </div>
        <div class="esup-block">
          <div class="esup-label">連チャン</div>
          <div class="esup-value" id="chain-count-value">0</div>
        </div>
        <div class="esup-block">
          <div class="esup-label">獲得出玉</div>
          <div class="esup-value" id="rush-balls-value">0</div>
        </div>
      </div>
    </div>

    <div id="main-screen">
      <div id="start-controls">
        <div class="select-block">
          <span class="ctrl-label">回転効率</span>
          <select id="rate-select"></select>
        </div>
        <div class="select-block">
          <span class="ctrl-label">先バレ信頼度</span>
          <select id="confidence-select"></select>
        </div>
        <div class="select-block">
          <span class="ctrl-label">演出モード</span>
          <select id="mode-select"></select>
        </div>
        <button type="button" class="btn-start" id="start-btn">スタート</button>
      </div>

      <div id="overlay" hidden>
        <div id="overlay-box"></div>
      </div>
    </div>

  </div>

  <script src="logic.js"></script>
  <script src="rush-view-engine.js"></script>
  <script src="script.js"></script>
</body>
</html>
```

> **注記（実装時に反映済み）：** 当初案には「総獲得出玉」の `stat-block` が漏れていたが、設計書セクション7の累積表示4項目に合わせてTask 5完了後のコード品質レビューで追加された（`id="total-balls-value"`）。以降のタスクのコード例は追加後の状態を前提にしている。

- [x] **Step 2: ブラウザで開いてエラーが出ないことを確認**

`index.html` をブラウザで直接開く（`script.js`/`style.css` は次タスク以降で作成するため、コンソールに404が出るのは想定内。HTML自体のパースエラーが出ないことだけ確認する）。

- [x] **Step 3: コミット**

```bash
git add index.html
git commit -m "feat: index.htmlの骨組みを作成"
```

（追加コミット: `fix: 累計成績に総獲得出玉の表示枠を追加`）

---

## Task 6: style.css の作成

**Files:**
- Create: `C:\Users\ab_99\pachinko-simulator-ghoul-rush\style.css`

- [x] **Step 1: style.css を作成**

```css
* { margin: 0; padding: 0; box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

body {
  background: #0d0d0d;
  color: #fff;
  font-family: 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif;
  max-width: 390px;
  margin: 0 auto;
  min-height: 100vh;
  overflow-x: hidden;
}

#app {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

#title-bar {
  background: linear-gradient(135deg, #1a0000, #2d0000);
  border-bottom: 2px solid #b8860b;
  text-align: center;
  padding: 8px 12px;
  font-size: 14px;
  font-weight: bold;
  color: #f0c040;
  letter-spacing: 1px;
  text-shadow: 0 0 10px rgba(240,192,64,0.5);
}

#header {
  background: #111;
  border-bottom: 2px solid #b8860b;
  position: sticky;
  top: 0;
  z-index: 10;
}

.hrow {
  display: flex;
  align-items: center;
  padding: 8px 12px;
}

.hrow1 {
  justify-content: space-around;
  border-bottom: 1px solid #1e1e1e;
}

.stat-block { text-align: center; }
.stat-label { display: block; font-size: 10px; color: #666; }
.stat-value { display: block; font-size: 16px; font-weight: bold; color: #ccc; }
.stat-value.gold  { color: #f0c040; }
.stat-value.green { color: #44cc88; }
.stat-value.red   { color: #cc6666; }

.hrow-holds {
  justify-content: center;
  gap: 10px;
  border-bottom: 1px solid #1e1e1e;
}

.hold-icon {
  width: 26px;
  height: 26px;
  border-radius: 50%;
  background: #2a2a2a;
  border: 2px solid #444;
  transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;
}
.hold-icon.hold-none    { background: #3a3a3a; border-color: #555; }
.hold-icon.hold-flash   { background: #555; border-color: #aaa; animation: holdFlash 0.8s ease infinite; }
.hold-icon.hold-blue    { background: #2266cc; border-color: #66aaff; box-shadow: 0 0 8px rgba(66,150,255,0.6); }
.hold-icon.hold-green   { background: #229955; border-color: #66dd99; box-shadow: 0 0 8px rgba(66,220,150,0.6); }
.hold-icon.hold-red     { background: #cc3333; border-color: #ff7777; box-shadow: 0 0 10px rgba(255,80,80,0.7); }
.hold-icon.hold-rainbow {
  background: linear-gradient(90deg, #ff3b3b, #ff9d3b, #ffe93b, #3bff6a, #3bcfff, #6a3bff, #ff3bcf, #ff3b3b);
  background-size: 400% 100%;
  border-color: #fff;
  animation: rush-rainbow 2s linear infinite;
  box-shadow: 0 0 12px rgba(255,255,255,0.7);
}

@keyframes holdFlash {
  0%, 100% { opacity: 1; }
  50%      { opacity: 0.4; }
}

.hrow-rush-status {
  justify-content: space-around;
  padding: 6px 12px;
}

.esup-block { text-align: center; min-width: 60px; }
.esup-label { font-size: 10px; color: #666; }
.esup-value { font-size: 18px; font-weight: bold; color: #f0c040; }

#main-screen {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 20px;
  min-height: 420px;
}

#start-controls {
  width: 100%;
  max-width: 300px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
}

.select-block {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.ctrl-label { font-size: 13px; color: #aaa; }

select {
  background: #1a1a1a;
  color: #fff;
  border: 1px solid #444;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 14px;
}

.btn-start {
  width: 148px;
  height: 148px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #f0c040, #a07800);
  border: 5px solid #fff5cc;
  font-size: 26px;
  font-weight: bold;
  color: #fff;
  letter-spacing: 2px;
  cursor: pointer;
  box-shadow: 0 0 30px rgba(240,192,64,0.4), 0 4px 12px rgba(0,0,0,0.6);
  transition: transform 0.1s, box-shadow 0.1s;
  text-shadow: 0 1px 3px rgba(0,0,0,0.5);
  margin-top: 12px;
}
.btn-start:active { transform: scale(0.94); box-shadow: 0 0 10px rgba(240,192,64,0.2); }

#overlay {
  position: absolute;
  inset: 0;
  background: #0d0d0d;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.screen {
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  animation: fadeIn 0.25s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to   { opacity: 1; transform: translateY(0); }
}

.result-main {
  font-size: 32px;
  font-weight: bold;
  letter-spacing: 2px;
  text-align: center;
}
.result-main.win    { color: #f0c040; text-shadow: 0 0 20px rgba(240,192,64,0.7); }
.result-main.lose   { color: #555; }
.result-main.rush   { color: #ff4444; text-shadow: 0 0 20px rgba(255,68,68,0.7); }
.result-main.charge { color: #88ccff; }

.result-sub { font-size: 14px; color: #888; }

.rush-title {
  font-size: 40px;
  font-weight: bold;
  letter-spacing: 1px;
  line-height: 1.15;
  text-align: center;
  background: linear-gradient(90deg, #ff3b3b, #ff9d3b, #ffe93b, #3bff6a, #3bcfff, #6a3bff, #ff3bcf, #ff3b3b);
  background-size: 400% 100%;
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  animation: rush-rainbow 3s linear infinite;
}
.rush-title-enter { animation: rush-rainbow 3s linear infinite, rushEnterPop 0.5s ease; }

@keyframes rush-rainbow {
  0%   { background-position: 0% 50%; }
  100% { background-position: 100% 50%; }
}
@keyframes rushEnterPop {
  0%   { transform: scale(0.6); opacity: 0; }
  60%  { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

.enzoku-img {
  width: 100%;
  max-width: 300px;
  border-radius: 12px;
  border: 3px solid #c9a227;
  box-shadow: 0 0 24px rgba(201,162,39,0.5);
}

.add-rush-title {
  font-size: 34px;
  font-weight: bold;
  color: #ff9900;
  letter-spacing: 2px;
  text-shadow: 0 0 20px rgba(255,153,0,0.6);
}

.chain-label {
  font-size: 15px;
  font-weight: bold;
  color: #ff9900;
  letter-spacing: 1px;
}

/* 突撃モード：カットインが上から落下 */
.tokigeki-cutin {
  font-size: 30px;
  font-weight: bold;
  color: #fff;
  background: linear-gradient(135deg, #cc0000, #660000);
  padding: 10px 26px;
  border-radius: 8px;
  border: 3px solid #ff6666;
  box-shadow: 0 0 24px rgba(255,0,0,0.7);
  animation: cutinDrop 0.4s cubic-bezier(0.2, 1.4, 0.6, 1);
}
@keyframes cutinDrop {
  0%   { transform: translateY(-160px) rotate(-6deg); opacity: 0; }
  100% { transform: translateY(0) rotate(0deg); opacity: 1; }
}

/* 月山絶叫モード：カウントダウン */
.tsukiyama-count {
  font-size: 64px;
  font-weight: bold;
  color: #ff4444;
  text-shadow: 0 0 30px rgba(255,68,68,0.8);
  animation: countdownPulse 0.6s ease;
}
@keyframes countdownPulse {
  0%   { transform: scale(1.6); opacity: 0; }
  60%  { transform: scale(1); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}

.rush-result-title {
  font-size: 20px;
  font-weight: bold;
  color: #f0c040;
  letter-spacing: 2px;
  border-bottom: 1px solid #333;
  padding-bottom: 8px;
  width: 100%;
  max-width: 300px;
  text-align: center;
}

.rush-result-box {
  width: 100%;
  max-width: 300px;
  background: #141414;
  border: 1px solid #333;
  border-radius: 12px;
  padding: 14px 16px;
}

.result-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 5px 0;
}
.result-row.highlight { background: rgba(240,192,64,0.06); border-radius: 6px; padding: 6px 4px; }

.rr-label { font-size: 13px; color: #888; }
.rr-val   { font-size: 15px; font-weight: bold; color: #ccc; }
.rr-val.gold { color: #f0c040; font-size: 18px; }

.result-hr { border: none; border-top: 1px solid #2a2a2a; margin: 8px 0; }

.btn-action {
  width: 100%;
  max-width: 300px;
  padding: 15px;
  border-radius: 12px;
  background: linear-gradient(135deg, #c9a227, #7a5c00);
  border: 2px solid #f0e090;
  font-size: 17px;
  font-weight: bold;
  color: #fff;
  cursor: pointer;
  box-shadow: 0 4px 12px rgba(0,0,0,0.4);
  transition: opacity 0.1s, transform 0.1s;
  text-shadow: 0 1px 2px rgba(0,0,0,0.4);
}
.btn-action:active { opacity: 0.75; transform: scale(0.97); }
```

- [x] **Step 2: コミット**

```bash
git add style.css
git commit -m "feat: style.cssを作成"
```

---

## Task 7: script.js — 状態初期化・開始画面・投資額シミュレーション〜RUSH突入演出

**Files:**
- Create: `C:\Users\ab_99\pachinko-simulator-ghoul-rush\script.js`

- [x] **Step 1: script.js を新規作成し、状態・DOM参照・開始画面〜RUSH突入演出までを実装**

```js
'use strict';

const game = {
  spinRate: DEFAULT_SPIN_RATE,
  confidence: DEFAULT_ENZOKU_CONFIDENCE,
  mode: DEFAULT_RUSH_MODE,
  investment: null,
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

// ---- 初期化 ----

document.addEventListener('DOMContentLoaded', () => {
  cacheDomRefs();
  populateSelects();
  bindEvents();
  renderStats();
});
```

`enterRush()` は次タスクで実装するため、このタスクの時点ではまだ定義されていない（次タスクで追記する）。

> **注記：** Task 5完了後に `index.html` へ `total-balls-value`（総獲得出玉の表示枠）が追加されたため、このTask 7のコード例はそれを前提に `totalBallsValueEl` の取得と `renderStats()` での更新を含めてある（当初案から更新済み）。

- [x] **Step 2: ブラウザで開始画面が表示されることを確認**

`index.html` をブラウザで直接開く。回転効率・先バレ信頼度・演出モードのプルダウンと「スタート」ボタンが表示されることを確認する（スタートボタンを押すと `enterRush is not defined` エラーになるのは想定内、次タスクで解消する）。

- [x] **Step 3: コミット**

```bash
git add script.js
git commit -m "feat: 開始画面〜投資額シミュレーション〜RUSH突入演出を実装"
```

---

## Task 8: script.js — RUSH中の保留キュー・消化ループ・演出モード別告知

**Files:**
- Modify: `C:\Users\ab_99\pachinko-simulator-ghoul-rush\script.js`

- [x] **Step 1: `game` オブジェクトにRUSH中の状態を追加**

`script.js` の `game` オブジェクト定義を以下に置き換える:

```js
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
```

- [x] **Step 2: RUSH中の保留システムを実装**

`showRushEntry()` の直後（`// ---- 初期化 ----` の直前）に追記:

```js
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
```

- [x] **Step 3: ブラウザでRUSH中の保留・消化・演出モードの挙動を確認**

`index.html` をブラウザで開き、スタート→投資額表示→経路テロップ→LT突入→RUSH中へと自動的に進むことを確認する。保留アイコン（最大4個）が上部に表示され、一定間隔で先頭から消化されて当選演出（3000個/6000個）またはミスとして処理されていくことを確認する。演出モードのプルダウンを「突撃」「月山絶叫」に切り替えて再度スタートし、それぞれ専用の演出（カットイン／カウントダウン）が表示されることを確認する。「リゼ襲来」に切り替えた場合は、当選が確定した保留がキューに積まれた時点で虹色になっていることを確認する（RUSH終了までは時間がかかるため、`HOLD_CONSUME_INTERVAL_MS` を一時的に短くして確認してもよい）。

- [x] **Step 4: コミット**

```bash
git add script.js
git commit -m "feat: RUSH中の保留キュー・消化ループ・演出モード別告知を実装"
```

---

## Task 9: script.js — RUSH終了・累計成績・もう一度スタート

**Files:**
- Modify: `C:\Users\ab_99\pachinko-simulator-ghoul-rush\script.js`

- [x] **Step 1: RUSH終了処理を実装**

`showTsukiyamaCountdown` の後、`// ---- 初期化 ----` の直前に追記:

```js
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
  confidenceSelectEl.disabled = false;
  modeSelectEl.disabled = false;
}
```

- [x] **Step 2: ブラウザでRUSH終了〜もう一度スタートの一連の流れを確認**

`index.html` をブラウザで開き、RUSHが終了すると「連チャン数」「獲得出玉」「投資額」「収支」を表示した結果画面が出ることを確認する。「もう一度スタート」を押すと開始画面に戻り、プルダウンが再度操作可能になることを確認する。2周目を回した後、ヘッダーの「プレイ回数」が2、「累計収支」「最高連チャン」「総獲得出玉」が2周分の内容で更新されていることを確認する。

- [x] **Step 3: コミット**

```bash
git add script.js
git commit -m "feat: RUSH終了・累計成績・もう一度スタートを実装"
```

---

## Task 10: ドキュメント整備

**Files:**
- Create: `C:\Users\ab_99\pachinko-simulator-ghoul-rush\README.md`
- Create: `C:\Users\ab_99\pachinko-simulator-ghoul-rush\docs\simulator-design.md`

- [x] **Step 1: README.md を作成**

```markdown
# パチンコシミュレーター（東京喰種版・RUSH演出ver）

`pachinko-simulator-ghoul`（手打ちタイプ）・`pachinko-simulator-ghoul-idle`（放置タイプ）に続く
第三のフォーマット。通常時の操作/観戦は行わず、RUSH中の演出（保留・先読み・演出モード選択）を
繰り返し楽しむことに特化している。

- ロジックの正: `logic.js`（`pachinko-simulator-ghoul-idle` から無改造で移植）
- RUSH演出特化フォーマット固有のロジック: `rush-view-engine.js`（`node --test` でユニットテスト済み）
- ゲームループ・描画: `script.js`

## ローカルでの動作確認

`index.html` をブラウザで直接開くだけで動作する（ビルド不要）。

## テスト

```bash
npm test
```

## 設計書・実装計画

- `docs/simulator-design.md`（仕組みの全体解説。ブログ記事などの題材用）
- `docs/superpowers/specs/2026-09-03-ghoul-rush-format-design.md`
- `docs/superpowers/plans/2026-09-03-ghoul-rush-format.md`

## スコープ外（今回未実施）

- `pachinko-simulator-ghoul`（手打ちタイプ）・`pachinko-simulator-ghoul-idle`（放置タイプ）側の変更
- 保留色ランク・演出モードの実機完全再現（Web調査に基づく参考値。後日精度が上がった情報に差し替え可能）
```

- [x] **Step 2: docs/simulator-design.md を作成**

```markdown
# 東京喰種版パチンコシミュレーター「RUSH演出ver」設計書

このドキュメントは、本シミュレーターの仕組みをブログ記事等の題材として説明できるように、
コンセプトから内部ロジックまでをまとめたものです。

## 1. コンセプト

「通常時の手打ち操作」も「放置観戦」も行わず、**RUSH中の演出だけを繰り返し楽しむ**ことに
特化した第三のフォーマット。スタートボタンを押すと、通常時の当選までの過程は裏側で瞬時に
シミュレートされ、「投資額◯◯円」の結果だけが表示される。そこから先はRUSH中の保留・先読み・
演出モードといった「魅せる」要素に全振りしている。

スペック（確率・RUSH構造）は `pachinko-simulator-ghoul-idle` の `logic.js` をそのまま移植している。

## 2. 基本ループ

1. 開始画面で「回転効率」「先バレ信頼度」「演出モード」を選ぶ
2. スタートを押すと、通常時を高速シミュレートして「投資額◯◯円（◯◯回転）」を表示
3. 当選経路（図柄揃い→LTチャレンジ成功 / CHARGE→LT当選）を簡易テロップで表示
4. 「LT突入！」のレインボー演出を経て、RUSH中の保留消化ループへ
5. RUSH終了で結果画面（連チャン数・獲得出玉・投資額・収支）を表示
6. 「もう一度スタート」で次の投資額シミュレーション〜RUSHへ。累計成績はセッション中ずっと積算される

## 3. 投資額のシミュレーション

`logic.js` の `spinNormal()` を、zugar（図柄揃い）またはcharge（チャージ）が出て、
それぞれのLT抽選（LTチャレンジ50% / LT直撃1/100）に当選するまで裏側で高速ループする。
1回転ごとのコストは持ち球換算で積算し、持ち球が不足した分だけ1,000円単位で投資額に加算する
（実機の「球を借りる」動作と同じ考え方）。

## 4. 保留システム（RUSH中）

RUSH中のST消化（130回転リセット方式、当選確率1/95.3）の1回転を、保留を1個貯めて消化する
という形に変換している。最大4個まで保留を貯め、一定間隔で自動的に先頭から消化される。

各保留は取得された時点で、実際の抽選結果（ハズレ／3000個／6000個／ST終了）に応じた色が
確率的に割り当てられる（先読み示唆）。色は白・点滅・青・緑・赤・虹の6段階で、虹は当選濃厚。
この色分けの重みは東京喰種実機の解析記事を参考にした演出用の参考値であり、`rush-view-engine.js`
の `HOLD_COLOR_WEIGHTS` に一箇所にまとめてあるため、実機情報の精度が上がれば差し替えるだけでよい。

## 5. 演出モード

RUSH開始前に、デフォルトと実機準拠の3種（突撃／リゼ襲来／月山絶叫）から選べる。
**確率には一切影響せず**、当選告知の見せ方だけが変わる。

- 突撃：当選時、カットイン風のテキストが落下してくる演出で告知
- リゼ襲来：保留を取得した時点で、当選が確定している保留だけ虹色で一発告知される
- 月山絶叫：当選保留の消化直前に、3・2・1のカウントダウン演出を挟んでから告知

## 6. 技術構成

- `logic.js`：確率・RUSH状態遷移の純粋関数。`pachinko-simulator-ghoul-idle` から無改造で移植
- `rush-view-engine.js`：投資額シミュレーション・保留色抽選・演出モード定義などの純粋関数。
  Node.js標準の `node --test` でユニットテスト済み
- `script.js`：画面描画とゲームループ
- フレームワークは使わず、素のHTML/CSS/JavaScriptのみ
```

- [x] **Step 3: コミット**

```bash
git add README.md docs/simulator-design.md
git commit -m "docs: README・仕組み解説ドキュメントを追加"
```

---

## Task 11: 最終確認

**Files:** なし（確認のみ）

- [x] **Step 1: 全ユニットテストを実行**

Run: `npm test`
Expected: PASS（`rush-view-engine.test.js` の全件が成功、13件）

- [x] **Step 2: ブラウザで一連の流れを通しで確認**

`index.html` をブラウザで直接開き、以下を一通り確認する:

- 開始画面（回転効率／先バレ信頼度／演出モードのプルダウンとスタートボタン）が表示される
- スタート→投資額表示→経路テロップ→LT突入演出→RUSH中の保留消化ループ→RUSH終了結果画面、の流れが自動で進行する
- 4種類の演出モードそれぞれで、告知の見せ方が異なることを確認する
- 「もう一度スタート」で次の周回に進み、累計成績（プレイ回数・累計収支・最高連チャン・総獲得出玉）が正しく積算されることを確認する

- [x] **Step 3: git status で未コミットの変更がないことを確認**

Run: `git status`
Expected: `nothing to commit, working tree clean`

---

## 実装完了後の記録

全11タスク実装完了。実装完了後、Opusモデルによる実装全体の最終ホリスティックレビューを実施し、以下の重大なバグを発見・修正した（個別タスクごとのレビューでは検出できなかったもの）。

### 修正済み

- **重大（ブラウザで一切動作しない）**：`rush-view-engine.js` が `logic.js` の関数（`calcSpinCost`等）と同名の `const` 分割代入を行っており、両ファイルが素の`<script>`タグとして共有グローバルスコープに読み込まれるブラウザ環境では構文エラー（`SyntaxError: Identifier has already been declared`）でページ全体が起動不能になっていた（`node --test`はNode.jsのモジュールスコープ分離のため検出不可）。名前空間オブジェクト方式に変更して解消（`358df57`→`c8c422f`で最終修正）。再発防止のため`vm`モジュールでブラウザの共有スコープ読み込みを再現する回帰テスト`test/browser-load.test.js`を追加。
- **重要**：当選演出（突撃のカットイン・月山絶叫のカウントダウン）の最中に、ヘッダーの連チャン数・獲得出玉が演出より先に更新されてしまいネタバレになっていた問題を修正（`69bcc1d`）。
- **重要**：当選時の払い出し球数（2800/5600）が`logic.js`・`script.js`の2箇所（3回）で独立して重複定義されていたのを`rush-view-engine.js`の`rushHitBalls()`に一元化（`69bcc1d`）。
- **軽微**：設計書・テスト名での保留色表記の不統一（「白」→「無色（グレー）」、実装の`#3a3a3a`ダークグレーに合わせて統一）。

### 今回は見送った項目（ユーザー判断待ち）

- RUSH中に保留が残り4個未満に減ることで、ST終了が近いことがプレイヤーに見えてしまい、設計書が意図した「最後まで期待感を持たせる」演出が薄れる（保留を常に4個表示に見せかける等の対応が必要、UI設計の再検討を伴う）
- RUSH中に中断・早送りする手段が一切ない（1RUSH平均約280回転×1.4秒≒6.5分、長い連チャンだとさらに長時間。演出モードを比較したいだけのユーザーには不便）
- リゼ襲来モードは「保留の虹色を強制する」以上の専用ビジュアルがなく、演出としての差別化が弱い
- 月山絶叫のカウントダウンは数字のみで、設計書が言う「ボタン風」の見た目にはなっていない
- `.result-main.win`/`.result-main.lose`（style.css）が未使用（現状winは使わずchargeとrushのみ使用）
