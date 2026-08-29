/**
 * Obsidian の公開 d.ts には含まれない内部プロパティの宣言マージ．
 *
 * ここに書いたものはすべて「非公式 API」であり，Obsidian 側のリファクタで
 * 予告なく消える可能性がある．
 *
 * 網羅的な型定義が欲しい場合は fevol/obsidian-typings の導入を検討する．
 *
 * 逆に，一見それらしくても公開されているものはここに書かない．
 * 例: Workspace.requestSaveLayout は 0.16.0 から公開 API (Debouncer).
 *     WorkspaceLeaf.parent も公開．再宣言すると公開の型を隠してしまう．
 */
import "obsidian";

declare module "obsidian" {
  interface WorkspaceLeaf {
    /** workspace.json に永続化されるリーフ ID */
    id: string;
    /** タブストリップ上のタブヘッダ要素 (.workspace-tab-header) */
    tabHeaderEl: HTMLElement;
    /** タブヘッダ内のタイトル要素 */
    tabHeaderInnerTitleEl: HTMLElement;
    /**
     * 公開の型は WorkspaceTabs | WorkspaceMobileDrawer だが，children を辿るために
     * WorkspaceParent へ広げている．プロパティ自体は公開 API．
     */
    parent: WorkspaceParent;
  }

  interface Workspace {
    /**
     * ポップアウトウィンドウのルート．公開 d.ts には rootSplit しかない．
     * 無い環境でも «ポップアウトが装飾されない» だけで済むよう optional にする．
     */
    floatingSplit?: WorkspaceParent;
  }

  interface WorkspaceParent {
    /** 子アイテムの並び順 = タブの並び順 */
    children: WorkspaceItem[];
    containerEl: HTMLElement;
    /**
     * 子アイテムを index の位置に差し込む．
     * 引数の順序も containerEl を一緒に運ぶかも保証が無いので，
     * 呼んだあとに必ず結果を検証すること (main.ts の hasLanded).
     */
    insertChild?(index: number, item: WorkspaceItem, resize?: boolean): void;
    /** 子アイテムを外す．insertChild と対で使う */
    removeChild?(item: WorkspaceItem): void;
  }
}
