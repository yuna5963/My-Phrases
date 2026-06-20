# 変更履歴

このプロジェクトの主な変更をまとめます。書式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/)、
バージョンは [Semantic Versioning](https://semver.org/lang/ja/) に概ね従います。

バージョンの上げ方は [docs](README.md) ではなく下記の運用に従ってください:
`npm run bump:minor`（または `bump:patch` / `bump:major`）で `package.json` の番号だけを更新し、
変更を PR に含めて main へマージすると、CI が自動で `vX.Y.Z` タグと GitHub Release を作成します。

## [Unreleased]

## [0.2.0] - 2026-06-20

### 追加
- **モデリング練習**と**フレーズ別の発音練習ビュー**（`ListenPractice` を共通化して再利用）
- **連続再生プレイヤー**（`src/pages/PhraseDetail.tsx`）: 一覧でタップしたフレーズを起点に、
  フレーズ / 例文 / 日本語訳 の読み上げ項目を切り替えながら自動で次々再生。リピート / シャッフル対応
- 3カラム（フレーズ・日本語訳・例文）対応
- 「**覚えた**」チェックと「**自信なし**」絞り込み
- 連続再生中の **Screen Wake Lock**（画面消灯で読み上げが止まらないように画面スリープを抑止）
- **「🌙 暗くして再生」モード**: 全画面を黒く覆い、Wake Lock で読み上げを継続したまま誤タッチを無効化。
  1本指タッチは無効、2本指同時タッチで解除（バックライト自体は Web から消せないため見た目を黒くするのみ）

### 変更
- 読み上げ速度の調整は**英語のみ**対象に（日本語訳は常に等倍で再生）

## [0.1.0] - 2026-06-17

### 追加
- My Phrases 初版（瞬間英作文 / 発音練習の PWA、React + Vite + TS + Tailwind）
- Notion の Markdown & CSV エクスポートをアプリ内インポート（IndexedDB 保存・オフライン対応）
- SRS（Leitner ボックス）による学習状態管理
- Web Speech API による読み上げ、GitHub Pages への自動デプロイ

[Unreleased]: https://github.com/yuna5963/My-Phrases/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/yuna5963/My-Phrases/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/yuna5963/My-Phrases/releases/tag/v0.1.0
