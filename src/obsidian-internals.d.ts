/**
 * Obsidian の公開 d.ts には含まれない内部プロパティの宣言マージ．
 *
 * ここに書いたものはすべて「非公式 API」であり，Obsidian 側のリファクタで
 * 予告なく消える可能性がある．
 *
 * 網羅的な型定義が欲しい場合は fevol/obsidian-typings の導入を検討する．
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
    /** リーフの内容コンテナ */
    containerEl: HTMLElement;
    parent: WorkspaceParent;
  }

  interface WorkspaceParent {
    id: string;
    /** 子アイテムの並び順 = タブの並び順 */
    children: WorkspaceItem[];
    containerEl: HTMLElement;
    /** WorkspaceTabs のみ．指定リーフをアクティブタブにする */
    selectTab?(leaf: WorkspaceLeaf): void;
  }

  interface Workspace {
    /** レイアウト (workspace.json) の保存を予約する */
    requestSaveLayout(): void;
  }
}
