[English](development.md) | **日本語**

# 開発

## ソースからビルドする

```bash
git clone https://github.com/akitenkrad/obsidian-tab-bands.git \
  <vault>/.obsidian/plugins/tab-bands
cd <vault>/.obsidian/plugins/tab-bands
npm install
npm run build    # 型チェック + production ビルド
npm run dev      # watch ビルド
npm test         # 単体テスト (vitest)
```

設定 → コミュニティプラグイン → 再読み込み → **Tab Bands** を有効化．
開発中は [pjeby/hot-reload](https://github.com/pjeby/hot-reload) を併用すると楽
(プラグインフォルダに空の `.hotreload` を置く)．

ディレクトリ名は `manifest.json` の `id` (`tab-bands`) と一致している必要がある．

## テスト

テストは `test/` にある．Obsidian の API に触る部分は実機でしか確かめられないので，
**Obsidian 非依存のロジックだけ**を対象にしている．

| ファイル | 対象 |
| --- | --- |
| `test/i18n.test.ts` | 表示言語の選択，差し込み，辞書の網羅 |
| `test/rules.test.ts` | 新規タブの吸収，ドロップでの参加，折りたたみ時の逃げ先．**誤吸収しないこと**を厚めに |
| `test/store.test.ts` | 採番・色の割り当て・assign/unassign・remap の fingerprint 引き継ぎ・reconcile の復元 |
| `test/workspace-tree.test.ts` | 木の走査，タブ順，ポップアウト (`floatingSplit`) の取り込み |
| `test/obsidian-stub.ts` | `obsidian` の代役．`WorkspaceLeaf` は `instanceof` 判定のため実クラスで持つ |
| `test/setup.ts` | Obsidian が生やす `Array.prototype.remove()` の補完 |

`main.ts` に残っているのは DOM 操作と Obsidian API の呼び出しで，membership の
**判断**は `src/rules.ts` に純関数として切り出してある．

## Node のバージョン

どちらの workflow も Node 24 に固定している．ロックファイルは npm 11 系で生成しており，
Node 20 (npm 10) とは esbuild のプラットフォーム別 optional パッケージの解釈が食い違って
`npm ci` が `EBADPLATFORM` で落ちるため．

## CI

- `.github/workflows/test.yml` — `main` への push と全 Pull Request で
  `npm ci` → `npm test` → `npm run build`
- `.github/workflows/release.yml` — バージョンタグを push すると，
  `main.js` / `manifest.json` / `styles.css` を添付した GitHub Release を作る．
  タグ名は `manifest.json` の `version` と完全に一致させ，先頭に `v` を付けないこと
  (workflow 側で検証している)

## リリース手順

1. `manifest.json` と `package.json` の `version` を上げ，`versions.json` に
   新しいバージョンと `minAppVersion` を追記する
2. コミットして push し，バージョンと同じ名前のタグを push する
3. 残りはリリース用の workflow が行う
