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
