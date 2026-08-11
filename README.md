# keita-vocab

毎日の英語ボキャブラリー学習システム。**前日のレッスンを完了しないと次の日に進めない**ゲート付き。

📱 レッスンページ: https://miurasatoshimyu.github.io/keita-vocab/

## 仕組み

```
毎朝6:30 (JST)  Claude定期タスク
   │ 1. progress.json を確認
   │ 2. 直近レッスンが未完了 → 生成せず「未完了通知」だけ (ゲート)
   │ 3. 完了済み → words.json(既習語台帳)を読んで新レッスンJSONを生成しpush
   ▼
GitHub Pages (index.html)
   │ スマホで開く → 未完了の一番古いレッスンを表示
   │ 全カードをチェック → 「完了✓」ボタンが有効化
   ▼
完了ボタン → GitHub Issue「done: YYYY-MM-DD」を作成
   ▼
GitHub Actions (complete.yml)
   progress.json に完了を記録し、Issueを自動クローズ
```

## ファイル構成

- `index.html` — スマホ用レッスンアプリ (GitHub Pages)
- `data/index.json` — レッスン日付の一覧
- `data/lessons/YYYY-MM-DD.json` — 日次レッスン
- `data/words.json` — 既習語台帳 (SRS用・毎日のタスクはこれだけ読む)
- `progress.json` — 完了記録 (Actionsが更新)
- `.github/workflows/complete.yml` — 完了記録ワークフロー

## 学習ルール

- 目標: TOEIC 800 / ビジネス語彙(製造業DX・AI・組織マネジメント・コーチング文脈)
- 月〜木: 新語5語 + SRS復習 / 金: 週次復習 / 土日: 実践課題
- SRS: 学習日をDay1として Day2, 3, 5, 8, 14, 30 に復習
