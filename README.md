# Research Track Record

論文投稿・予算申請の履歴を可視化する静的サイト。採択だけでなく不採択・結果待ちも含めて記録します。

## 構成

```
.
├── index.html       # エントリポイント
├── css/style.css    # スタイル
├── js/main.js       # チャート描画・フィルタ・ソート
├── data.json        # 履歴データ（編集対象はほぼここだけ）
└── .nojekyll        # GitHub Pages で Jekyll を無効化
```

依存は [Chart.js](https://www.chartjs.org/) のみで、CDN から読み込みます。ビルド不要・静的ファイルだけで動作します。

## ローカルで表示

ブラウザで `index.html` を直接開くと `fetch` が CORS により失敗するため、静的サーバ経由で開いてください。

```bash
python3 -m http.server 8765
# → http://localhost:8765/ をブラウザで開く
```

## データの追加・更新

`data.json` の `items` 配列にエントリを追加します。

```jsonc
{
  "id": "venue-year",             // 任意の一意な slug
  "year": 2026,                    // 年 (整数)
  "title": "表示用タイトル",
  "venue": "略称",
  "venueFull": "正式名称",
  "kind": "paper",                // "paper" | "grant"
  "type": "conference",           // "conference" | "workshop" | "journal" | "grant"
  "category": "international",    // "international" | "domestic"
  "status": "pending",            // "accepted" | "rejected" | "pending"
  "paperType": "full",            // "full" | "short" | "poster" | "fast-abstract" | null
  "role": "first-author",         // "first-author" | "co-author" | "pi" | "co-pi" | "unknown"
  "coauthors": ["共著者A"],
  "notes": "備考（例: Conditional を経て採択）"
}
```

エントリ追加後は `meta.lastUpdated` の日付も更新してください。

### 条件付き採択 (△→○) の扱い

最終結果のみを `status` に記録し、`notes` に経緯を残します。
例: `"status": "accepted", "notes": "Conditional Acceptance を経て採択"`

## GitHub Pages で公開

1. GitHub 上でリポジトリを用意
2. `main` ブランチに push
3. GitHub の **Settings → Pages** で Source を `Deploy from a branch` / `main` / `/ (root)` に設定
4. 数十秒後に `https://<user>.github.io/<repo>/` で公開される

## 表示内容

- **サマリーカード**: 総件数、採択、不採択、結果待ち、採択率 (確定分のみで計算)
- **グラフ**: 年度別件数（採択/不採択/結果待ちをスタック）、種別×結果、種別別採択率、国内/国際比率
- **一覧**: 年・区分・種別・結果・キーワードでフィルタ、ヘッダクリックでソート

## 備考

- `role` (First author / Co-author / 代表 / 分担) と `coauthors` は、判明している範囲で付与しています。空欄のものは追記可能です。
- データは `data.json` 一つに集約しているため、フォーマットを崩さなければ誰でも更新できます。
