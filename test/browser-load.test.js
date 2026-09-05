'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

// このテストは、index.htmlが<script>タグ3本(logic.js→rush-view-engine.js→script.js)を
// 素のブラウザ実行時と同じ「共有グローバルスコープ」で読み込んだ場合に、
// 構文エラーや参照エラーが起きないことを検証する。
// node --testのrequire()は各ファイルごとに独立したモジュールスコープを持つため、
// classic <script>タグ特有の「グローバル名の二重宣言はSyntaxError」という制約を
// 再現できない。vmモジュールで共有コンテキストを作ることで、この種のバグ
// (例: logic.jsのfunction宣言とrush-view-engine.jsのconst分割代入が同名衝突する)
// を検出できるようにする。

function readFile(name) {
  return fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
}

test('logic.js と rush-view-engine.js は共有グローバルスコープで衝突なく読み込める', () => {
  const ctx = vm.createContext({ console });
  vm.runInContext(readFile('logic.js'), ctx, { filename: 'logic.js' });
  vm.runInContext(readFile('rush-view-engine.js'), ctx, { filename: 'rush-view-engine.js' });
  // rush-view-engine.jsが期待通りグローバルに公開している主要な値を確認する
  const result = vm.runInContext(
    'typeof simulateInvestment === "function" && typeof rollHoldColor === "function" && MAX_HOLDS',
    ctx
  );
  assert.equal(result, 4);
});
