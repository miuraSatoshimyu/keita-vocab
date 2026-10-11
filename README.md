# keita-vocab — 朝の英語クエスト (v2)

毎朝5:40の英語枠(シャドーイング)に合体した、10分のゲーム型英語トレーニング。

📱 https://miurasatoshimyu.github.io/keita-vocab/ (iPhoneは「ホーム画面に追加」推奨)

## 1日の流れ(3工程・約10分)

| 工程 | 中身 | XP |
|---|---|---|
| ⚡ タイムアタック(3分) | 今日の新語を覚える → 新語＋復習を4択で連続回答。金曜はボス戦(今週の単語で120秒) | 正解10・5連続以上+5・ボス撃破100 |
| 🎤 発音チャレンジ | お手本を聞いて、コロケーションを声に出す。音声認識で75%以上一致なら合格。非対応端末は自己判定 | 合格15 |
| 🎧 シャドーイング | 今週のクリップ(data/shadow.json)をYouTubeで開き、5ステップをチェック | 40 |

3工程クリアでボーナス50 XP。

## 続けるための設計(v1の反省)

- **ゲートなし**: 何日空いても、開いた日から再開できる。v1は未完了レッスンで1か月止まった
- **完了ボタンなし**: 工程を終えれば自動で記録。v1はGitHub Issueを出す必要があった
- **連続記録は⚡だけで数える**: 忙しい朝は⚡だけでも途切れない。7日ごとに❄️休み保護(最大2)、休んだ日を自動で埋める
- **復習が溜まった日は新語を減らす**: 復習15超で新語2、30超で0。新語は平日5・土日3・金曜0
- **SRS**: 正解で 1→2→4→7→14→30日後。不正解は翌日。★5(=14日以上の間隔)でマスター

## ファイル構成

- `index.html` / `app.js` — 画面
- `engine.js` — ロジック(SRS・連続記録・休み保護・XP・バッジ・発音判定)。DOM非依存
- `data/bank.json` — 単語バンク(`tools/bank_source.txt` から生成)
- `data/shadow.json` — シャドーイングの週割り(台本本文はObsidianにあり、ここには置かない)
- `tools/bank_source.txt` — 単語の原本(1行1語)。`python3 tools/build_bank.py` で bank.json を再生成
- `tests/engine.test.js` — `node --test tests/engine.test.js`
- `legacy-index.html`, `data/lessons/`, `data/index.json`, `data/words.json`, `progress.json`, `.github/workflows/complete.yml` — v1の名残(参照されない)

## 記録の保存先

進捗はスマホのブラウザ(localStorage)に保存。サーバーには送らない。「⚙ バックアップと設定」から書き出し・復元できる。

## 自動補充

Claudeのスケジュールタスク(毎週日曜)が `tools/bank_source.txt` に新語を約25語追加して push する。
