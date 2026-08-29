# Tab Bands

Obsidian のタブストリップに，名前つき・色つき・折りたためる「バンド」を重ねるプラグイン．
関連するタブをまとめ，使わないバンドは畳んでタブ列の幅を取り戻せる．

> [!WARNING]
> **本プラグインは Obsidian の非公式 API に依存している．**
> 公開 d.ts に無いプロパティ (`WorkspaceLeaf.id`, `WorkspaceParent.children` など) と，
> 本体の DOM 構造 (CSS クラス `.workspace-tab-header`，タブヘッダのドラッグ機構) の
> 両方を前提にしているため，Obsidian 本体の更新で予告なく動作しなくなる可能性がある．
> 依存の一覧は [非公式 API への依存](#非公式-api-への依存) を参照．
>
> - **壊れたときの症状**: タブの装飾 (色・チップ) が出ない，再起動でバンドが消える，
>   折りたたんでもバンド名が出ない，あるいは全機能が停止する．
> - **ノート本体には影響しない．** バンドの情報はプラグインフォルダの `data.json` に
>   だけ持ち，vault 内のノートは読み書きしない．折りたたみは CSS のみで leaf を
>   detach しないので，未保存の編集も失われない．異常時はプラグインを無効化すれば
>   タブストリップは通常の状態に戻る．

## インストール

コミュニティプラグイン一覧には未登録のため，手動で導入する．

### Release から入れる (利用者向け)

1. [Releases](https://github.com/akitenkrad/obsidian-tab-bands/releases) の最新版から
   `main.js` / `manifest.json` / `styles.css` の 3 ファイルをダウンロードする．
2. vault に `.obsidian/plugins/tab-bands/` を作り，3 ファイルをそのまま置く．

   ```
   <vault>/.obsidian/plugins/tab-bands/
   ├── main.js
   ├── manifest.json
   └── styles.css
   ```

   ディレクトリ名は `manifest.json` の `id` (`tab-bands`) と一致している必要がある．
3. 設定 → コミュニティプラグイン → (制限モードなら解除) → 再読み込み →
   Tab Bands を有効化．

デスクトップ専用 (`isDesktopOnly: true`)．Obsidian 1.7.0 以降が必要．

更新するときは同じ 3 ファイルを上書きして Obsidian を再読み込みする．
バンドの状態は同じフォルダの `data.json` に入っているので消さないこと．

### ソースからビルドする (開発者向け)

```bash
git clone https://github.com/akitenkrad/obsidian-tab-bands.git \
  <vault>/.obsidian/plugins/tab-bands
cd <vault>/.obsidian/plugins/tab-bands
npm install
npm run build    # 型チェック + production ビルド
npm run dev      # watch ビルド (開発時)
```

設定 → コミュニティプラグイン → 再読み込み → Tab Bands を有効化．
開発中は [pjeby/hot-reload](https://github.com/pjeby/hot-reload) を併用する
(プラグインフォルダに空の `.hotreload` を置く).

## 使い方

| 操作 | 方法 |
| --- | --- |
| バンドを作る | タブを右クリック → 新しいバンドにまとめる |
| バンドに追加 | タブをチップにドロップ / **バンドのメンバーに挟まれた位置へドラッグ** / タブを右クリック → バンド「〜」に追加 |
| バンドから外す | タブを右クリック → バンドから外す |
| 折りたたむ / 展開 | チップをクリック．畳んだ状態ではタブのタイトル部分クリックでも可 |
| 名前・色の変更，解除，一括クローズ | チップを右クリック |
| ペインへ移動 | チップを右クリック → ペイン N へ移動 / 新しいペインへ移動 |
| バンドごとドラッグ移動 | **畳んだ状態で**タブをドラッグ (同一ペイン内・ペイン間とも可) |
| コマンド | 「アクティブタブを新しいバンドにまとめる」など 4 つ |

新しいバンドの名前は `Tab-1`, `Tab-2`, ... の連番が既定で入る．採番は未使用の最小番号を選ぶので，
バンドを消すとその番号は再利用される．名前は空にもできる (無名バンドのチップは色ドットだけになるが，
`Tab-X` 相当の幅は確保する)．

バンドのメンバーに挟まれた位置に新しいタブを開くと，自動的にそのバンドに入る．

## 設計方針

- **DOM は作り直さない．** `.workspace-tab-header` に class と `--tb-color` を載せ，
  バンド先頭メンバーのタブヘッダの内側にチップを差し込むだけ．本体のドラッグ&ドロップ，
  オーバーフローメニュー，テーマの見た目を壊さない．
- **チップはストリップの直接の子にしない．** 本体はドロップ位置をストリップ内の
  子要素の並びから決めており，独自要素を挿すと index 計算がずれる．またタブの
  並べ替え時にストリップを再構築して独自要素を捨てる．タブヘッダの子にすれば
  どちらも回避でき，チップへのドロップは「先頭メンバーの左半分へのドロップ」として
  本体がバンド直前へタブを運んでくれる．
- **本体のドロップ処理をキャンセルしない．** `dragover` で `preventDefault()` を
  返すのはチップ上のときだけ．`stopPropagation()` は呼ばない．
  こちらは membership の記録だけを行う．
- **状態は leafId で持つ．** `WorkspaceLeaf.id` は `workspace.json` に永続化され，
  再起動をまたいで保持される (実測済み)．失われた場合はファイルパスの
  fingerprint で復元する (`GroupStore.reconcile`).
- **並びは「ラン」で描画する．** 同一バンドの連続ブロックごとにチップを出すので，
  手でタブを動かして並びが崩れても破綻しない．同じバンドのチップが 2 箇所に
  出る状態も正常系として扱う．
- **折りたたみは CSS のみ．** leaf を detach しないので，エディタのスクロール位置や
  未保存の編集が保持される．先頭メンバーだけはチップの宿主として残す．
- **membership は明示操作でのみ変える．** 例外は「バンド内に新しく開かれたタブ」
  だけで，これも新出リーフに限定している (後述).

## 実測で分かったこと

Obsidian の公開ドキュメントに無い挙動．いずれも実機 (macOS, Obsidian 1.x) で確認した．

| 項目 | 結果 |
| --- | --- |
| タブのドラッグ機構 | HTML5 drag (`tabHeaderEl` が `draggable`)．`dragstart` の target はタブヘッダそのもの |
| `app.dragManager` | タブのドラッグには関与しない (`draggable` は常に `null`)．ファイルエクスプローラ用 |
| チップへのドロップ | `dragover` で `preventDefault()` を返せば `drop` を直接受け取れる |
| タブヘッダ以外へのドロップ | 本体はタブを移動させる (ストリップ内の子の並びから index を計算している) |
| ストリップの再構築 | タブ並べ替え時に本体が作り直し，注入した独自要素は捨てられる |
| **`iterateRootLeaves()` / `iterateAllLeaves()`** | **deferred なリーフを列挙しない．** 2026-08-29 / 1.10.3 で再測定: 12 リーフ (うち deferred 10) に対し 2 しか返らない |
| `WorkspaceParent.children` | deferred なリーフも並ぶ．`tabHeaderEl` も持っている |
| ペイン間のタブ移動 | 本体は leaf を reparent する．`leaf.id` は保持される |
| `MenuItem.setSubmenu()` | このバージョンには存在しない．フラットなメニューにする必要がある |
| タブヘッダの幅 | インラインスタイルは無いが，CSS の `min-width` / `fit-content` では内容ぶんの幅を確保できない |

このうち `iterate*Leaves()` の件が最も影響が大きい．Obsidian 1.7 の遅延読み込み
導入以降，これらの API はリーフの列挙に使えない．本プラグインは
`src/workspace-tree.ts` で `children` を再帰的に辿る実装に置き換えている．

**この挙動は 1.10.3 でも変わっていない** (2026-08-29 再測定)．返る件数は
非 deferred なリーフの数と完全に一致した (12 - 10 = 2)．`WorkspaceParent.children`
への依存は，公開 API 側が deferred を扱うようになるまで外せない．

タブヘッダの幅の件から，折りたたみ時にバンド名をチップ内に表示するのは断念し，
**タブのタイトル要素そのものを `バンド名 (N)` で上書きする**方式を採っている
(`dataset.tbOriginal` に元の文字列を退避し，展開時と `resetTab()` で復元する).

## 非公式 API への依存

依存は 2 種類ある．**型宣言しているもの**は Obsidian 側から消えれば型エラーになるので
ビルド時に気付ける．**型に現れないもの**は，壊れても型チェックを通ってしまい，
画面を見るまで分からない．後者の方が厄介なので，どちらも書いておく．

### 型宣言しているもの

`src/obsidian-internals.d.ts` に集約している．いずれも公開 d.ts にない．

| プロパティ | 用途 | 壊れたときの症状 |
| --- | --- | --- |
| `WorkspaceLeaf.id` | 永続化キー | 再起動でバンドが消える |
| `WorkspaceLeaf.tabHeaderEl` | 装飾対象の DOM | 装飾が出ない |
| `WorkspaceLeaf.tabHeaderInnerTitleEl` | 折りたたみ時のタイトル書き換え | 畳んでも名前が出ない |
| `WorkspaceParent.containerEl` | ペイン移動の着地判定 (`hasLanded`) | 付け替えが失敗と判定され，常に再作成へ落ちる |
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

網羅的な型が必要になったら [fevol/obsidian-typings](https://github.com/Fevol/obsidian-typings) を導入する．

### 型に現れないもの

型宣言に載らないので，Obsidian 側が変えても**ビルドは通ったまま無言で壊れる**．

| 依存 | 箇所 | 壊れたときの症状 |
| --- | --- | --- |
| CSS クラス `.workspace-tab-header` | **`styles.css` の全セレクタ**，`main.ts` (`verifyOrder` の診断のみ) | 装飾が一切出ない (診断は静かに no-op になるだけ) |
| タブヘッダが HTML5 `draggable` で，`dragstart` の target がタブヘッダ自身 | `drag.ts` 全体の前提 | ドラッグ操作を検出できない |
| 本体がストリップを再構築する / ドロップ位置を子要素の並びから計算する | 「設計方針」節の前提そのもの | チップが消える，ドロップ位置がずれる |

クラス名への依存は 2 つ落とした: タイトル要素の `querySelector`
(`.workspace-tab-header-inner-title`) は `tabHeaderInnerTitleEl` に寄せ，
ドラッグ元の特定 (`drag.ts`) は `closest()` をやめて既知の `tabHeaderEl` が
イベントの target を含むかで判定している．`main.ts` の `verifyOrder()` に残る
`hasClass` は意図的なもので，理由はその関数のコメントに書いてある．

`app.dragManager` はタブのドラッグに関与しないことを実測済みで，**使っていない**．
`drag.ts` のコメントに記録が残っているだけなので，依存として数えない．

## 実装メモ

**なぜ位置からの membership 推論をやめたか．** 当初は「バンドのメンバーに挟まれた
タブを吸収し，ランから外れたメンバーを離脱させる」ルールを入れていたが，
バンド端のタブを外へドラッグすると間のタブを芋づる式に取り込む不具合が出た．
並び順だけからは「タブがバンドを出た」のか「バンドが伸びた」のかを判別できない．
現在は**前回時点で存在しなかったリーフ**だけを吸収対象にしており
(`absorbNewNeighbors`)，既存タブの移動とは区別している．

**`onLayoutChange()` では early return しない．** `applyPending()` と
`absorbNewNeighbors()` は必ず両方を通す．後者の中で `knownLeafIds` を更新して
いるため，片方で抜けると次回に既存タブを「新出」と誤判定する．

**`gatherGroup()` の anchor は動かしたリーフを基準にする．** 既定では
「並び順で最初のメンバー」を基準にするが，バンドを右へドラッグすると
`members[0]` が別のメンバーに変わり，元の位置へ引き戻される．
ドラッグ経由では第 3 引数でホストを渡している．

**ドラッグでのバンド参加は「左右の隣が同一のバンド」だけで判定する．** この一点で，
バンドの外 (末尾の 1 つ右を含む) とバンドどうしの境界を自然に除外できる (`joinBandAtDrop`)．
**離脱は判定しない**。「外に出た」は「どのバンドにも挟まれていない」と同じ形になり，
末尾の 1 つ右に落とした場合と区別できないため，離脱は明示操作 (右クリック → バンドから
外す) に限る．対象は必ず**そのドラッグで動いた 1 枚**．かつてペイン内の全リーフを並び順
から推論するルールを入れたところ，バンド端のタブを外へドラッグした際に間のタブを芋づる式に
取り込んだ (実測して削除済み)．

**アクティブなタブが隠れる経路は 2 つあり，解決が逆になる．** バンドを畳んだとき
(アクティブは動いていない) は**アクティブを外へ逃がす** (`evacuateActive`)．ユーザーが
畳んだバンドのメンバーへ移動してきたとき (リンク・Quick switcher) は**バンドを開く**
(`revealActiveBand`)．両者は「アクティブなリーフが変わったか」で区別する
(`onActiveLeafChange`)．変化を伴わない再描画で開いてしまうと，「すべてのバンドを
折りたたむ」が片っ端から開き直される．

**逃げ先が無いまま畳んだバンドは，フォーカスが戻っても開かない．** ペイン内の全タブが
畳んだバンドに属する場合，アクティブは中に留まる (エディタは直前のノートを表示し続ける)．
このとき別ペインへ移って戻ると「アクティブが畳んだバンドへ移動した」と見えてしまい，
畳んだ状態を保てなくなる．取り残したタブを `trappedLeafIds` に控え，そのタブへ戻った
ときだけ展開を抑える．**別のメンバーへ移動した場合は従来どおり展開する** (取り残しの
抑止は「戻ってきただけ」の 1 枚に限る)．

**ペイン移動はまずリーフを直接付け替える．** `WorkspaceParent.insertChild` /
`removeChild` (非公式 API) で reparent すると `leafId` と未保存状態を保てる
(`reparent`)．非公式なので，まず 1 枚だけ動かして `children` と DOM の両方に
着地したかを検証し (`hasLanded`)，駄目なら元へ戻して
`createLeafInParent()` + `setViewState()` + `detach()` の旧方式へ落ちる
(`recreate`)．旧方式では `leafId` が変わるので `GroupStore.remap()` で
貼り替える (`fingerprints` も一緒に引き継ぐ)．

## 既知の制限 / TODO

- [ ] バンド末尾のメンバーから開いた新規タブの吸収 (Chrome は吸収する)
- [ ] 展開状態のバンドのドラッグ移動 (「1 枚だけ動かす」操作と区別できない)
- [ ] チップ自体のドラッグでバンドごと並び替え (親タブの `dragstart` と競合する)
- [ ] チップへのドロップ位置がバンド先頭に固定される (Chrome は末尾に追加)
- [ ] ポップアウトウィンドウ (`window-open`) のタブストリップへの追随
- [ ] モバイル (`isDesktopOnly: true` を外す場合，`WorkspaceMobileDrawer` の分岐が必要)
- [ ] 設定タブ (既定色，チップ幅，折りたたみ時の挙動)

## ファイル構成

| ファイル | 責務 |
| --- | --- |
| `src/main.ts` | プラグイン本体．コマンド，メニュー，イベント配線，ペイン移動 |
| `src/decorator.ts` | タブストリップの装飾．チップの生成と配置，折りたたみ表示 |
| `src/drag.ts` | ドラッグの監視．チップへのドロップ検出，ドラッグ結果の通知 |
| `src/store.ts` | バンドの状態と永続化 |
| `src/workspace-tree.ts` | `children` を辿るリーフ列挙 (`iterate*Leaves` の代替) |
| `src/obsidian-internals.d.ts` | 非公式 API の型宣言 |

## 先行プラグイン

- Group Tabs — 複数ファイルを 1 つのネイティブタブに束ねる方式
- Working tabs — バンドを「作業スペース」として左サイドバーで管理する方式
- Tab Shifter — 非公式 API でタブをタブグループ間に移動する
