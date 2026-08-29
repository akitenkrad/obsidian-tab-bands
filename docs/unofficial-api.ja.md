[English](unofficial-api.md) | **日本語**

# 非公式 API への依存

本プラグインはタブストリップを装飾するが，Obsidian の公開 API はタブストリップの DOM も
タブの並び順も公開していない．どちらも本プラグインの土台なので，非公式 API への依存は
避けられない．

依存は 2 種類ある．**型宣言しているもの**は Obsidian 側から消えれば型エラーになるので
ビルド時に気付ける．**型に現れないもの**は，壊れても型チェックを通ってしまい，画面を
見るまで分からない．後者の方が厄介なので，どちらも書いておく．

## 型宣言しているもの

`src/obsidian-internals.d.ts` に集約している．いずれも公開 d.ts にない．

| プロパティ | 用途 | 壊れたときの症状 |
| --- | --- | --- |
| `WorkspaceLeaf.id` | 永続化キー | 再起動でバンドが消える |
| `WorkspaceLeaf.tabHeaderEl` | 装飾対象の DOM | 装飾が出ない |
| `WorkspaceLeaf.tabHeaderInnerTitleEl` | 折りたたみ時のタイトル書き換え | 畳んでも名前が出ない |
| `WorkspaceParent.containerEl` | ペイン移動の着地判定 (`hasLanded`) | 付け替えが失敗と判定され，常に再作成へ落ちる |
| `Workspace.floatingSplit` | ポップアウトウィンドウの走査 | ポップアウトが装飾されない (optional 宣言なので他は動く) |
| `WorkspaceParent.children` | リーフ列挙とタブの並び順 | 全機能が停止する |
| `WorkspaceParent.insertChild` / `removeChild` | ペイン移動でのリーフ付け替え | 公開 API による再作成へ自動で落ちる (`leafId` が変わる) |

`Workspace.requestSaveLayout()` も使っているが，こちらは 0.16.0 から**公開 API**
(`Debouncer`) なので上表には含めない．`WorkspaceLeaf.parent` も同様に公開．

リーフ側の内容コンテナは `leaf.view.containerEl` (公開 API) で見ている．
`WorkspaceLeaf.containerEl` は非公式だが，`View.containerEl` がその子孫なので
着地判定としては等価で，deferred なリーフでも失われない (実測済み)．

`WorkspaceLeaf.id` には公開の対応物がある: `Workspace.getLeafById()` (1.5.1〜) と
`Workspace.getLayout()` を組み合わせれば id とリーフの対応表は公開 API だけで作れる．
リーフ ID という概念自体が公開 API に露出しているぶん，この依存は比較的壊れにくい．

網羅的な型が必要になったら
[fevol/obsidian-typings](https://github.com/Fevol/obsidian-typings) を導入する．

## 型に現れないもの

型宣言に載らないので，Obsidian 側が変えても**ビルドは通ったまま無言で壊れる**．

| 依存 | 箇所 | 壊れたときの症状 |
| --- | --- | --- |
| CSS クラス `.workspace-tab-header` | `main.ts` の `verifyOrder()` (診断のみ) | 診断が静かに no-op になる．機能と装飾には影響しない |
| タブヘッダが HTML5 `draggable` で，`dragstart` の target がタブヘッダ自身 | `drag.ts` 全体の前提 | ドラッグ操作を検出できない |
| 本体がストリップを再構築する / ドロップ位置を子要素の並びから計算する | 設計全体の前提そのもの | チップが消える，ドロップ位置がずれる |

`styles.css` は以前この表の筆頭だったが，本体のクラス名で詳細度を稼ぐのをやめ，
自前クラスの二重指定 (`.tb-member.tb-member`) に置き換えて依存を外した．詳細度は
変えていないので見た目は同じ．

クラス名への依存はほかに 2 つ落とした: タイトル要素の
`querySelector(".workspace-tab-header-inner-title")` は `tabHeaderInnerTitleEl` に寄せ，
ドラッグ元の特定は `closest()` をやめて既知の `tabHeaderEl` がイベントの target を
含むかで判定している．`verifyOrder()` に残る `hasClass` は意図的なもので，理由は
その関数のコメントに書いてある．

`app.dragManager` はタブのドラッグに関与しないことを実測済みで，**使っていない**．
`drag.ts` のコメントに記録が残っているだけなので，依存として数えない．

## コミュニティプラグインとして許容されるか

Obsidian 公式の
[Plugin guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines) に
内部 API を禁じる条項は無く，内部 API 専用の型定義パッケージが独立に維持されている
([obsidian-typings](https://github.com/Fevol/obsidian-typings) /
[obsidian-undocumented](https://github.com/eth-p/obsidian-undocumented))．
コミュニティの作法は «まず公開 API を探す» «壊れたときに安全に落ちる» «変更に追随する»
の 3 点で，本プラグインはいずれも満たしている ([内部構造](internals.ja.md) を参照)．
