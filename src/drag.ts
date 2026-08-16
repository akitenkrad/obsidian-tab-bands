import { App, Plugin, WorkspaceLeaf, WorkspaceParent } from "obsidian";
import { GroupStore } from "./store";
import { tabGroups } from "./workspace-tree";

export interface PendingAssignment {
  leafId: string;
  groupId: string;
}

export interface DragResult {
  /** ドラッグされたリーフ (特定できなければ null) */
  leaf: WorkspaceLeaf | null;
  /** ドラッグ開始時点で属していたタブグループ */
  originParent: WorkspaceParent | null;
}

export interface DragBridgeCallbacks {
  /** チップ上でドロップされた．適用は本体の移動が終わってから行うこと */
  onDropOnChip(pending: PendingAssignment): void;
  /** ドラッグが終わった (成否問わず)．畳んだバンドの追随に使う */
  onDragEnd(result: DragResult): void;
}

/**
 * タブのドラッグを監視し，チップ上のドロップと，畳んだバンドのペイン移動を
 * 検出する．
 *
 * 【実測に基づく前提】
 *  - タブは HTML5 drag (tabHeaderEl が draggable). dragstart の target は
 *    .workspace-tab-header そのものなので，掴んだリーフはここから特定できる.
 *  - app.dragManager はタブのドラッグに関与しない (draggable は常に null).
 *  - チップ上で dragover に preventDefault を返せば drop を直接受け取れる.
 *
 * 【方針】本体のドロップ処理をキャンセルしない．
 * 畳んだバンドではホストタブしか DOM に存在しないため，本体にホスト 1 枚を
 * 運ばせ，着地後に残りのメンバーを追随させる (main 側の責務).
 */
export class TabDragBridge {
  private app: App;
  private candidate: WorkspaceLeaf | null = null;
  private originParent: WorkspaceParent | null = null;
  private hovered: HTMLElement | null = null;

  constructor(
    private plugin: Plugin,
    private store: GroupStore,
    private cb: DragBridgeCallbacks,
  ) {
    this.app = plugin.app;
  }

  register(): void {
    const doc = document;
    const on = this.plugin.registerDomEvent.bind(this.plugin);

    on(doc, "dragstart", (evt: DragEvent) => {
      this.candidate = this.leafFromTabHeader(evt.target as HTMLElement | null);
      this.originParent = this.candidate?.parent ?? null;
    }, true);

    on(doc, "dragover", (evt: DragEvent) => {
      if (!this.candidate) return;
      const chip = (evt.target as HTMLElement | null)?.closest<HTMLElement>(".tb-chip") ?? null;
      this.setHover(chip);
      if (!chip) return;
      // ドロップを受け付ける意思表示のみ．stopPropagation は呼ばない
      // (本体にタブの移動を任せる).
      evt.preventDefault();
      if (evt.dataTransfer) evt.dataTransfer.dropEffect = "move";
    }, true);

    on(doc, "drop", (evt: DragEvent) => {
      const chip = (evt.target as HTMLElement | null)?.closest<HTMLElement>(".tb-chip");
      const groupId = chip?.dataset.tbGroup;
      const leaf = this.candidate;
      this.setHover(null);
      if (!groupId || !leaf) return;
      if (this.store.groupOf(leaf.id)?.id === groupId) return;
      this.cb.onDropOnChip({ leafId: leaf.id, groupId });
    }, true);

    on(doc, "dragend", () => {
      const result: DragResult = { leaf: this.candidate, originParent: this.originParent };
      this.reset();
      this.cb.onDragEnd(result);
    }, true);
  }

  private leafFromTabHeader(el: HTMLElement | null): WorkspaceLeaf | null {
    const header = el?.closest<HTMLElement>(".workspace-tab-header");
    if (!header) return null;
    for (const [, leaves] of tabGroups(this.app)) {
      const hit = leaves.find((leaf) => leaf.tabHeaderEl === header);
      if (hit) return hit;
    }
    return null;
  }

  private setHover(chip: HTMLElement | null): void {
    if (chip === this.hovered) return;
    this.hovered?.removeClass("tb-drop-target");
    chip?.addClass("tb-drop-target");
    this.hovered = chip;
  }

  private reset(): void {
    this.setHover(null);
    this.candidate = null;
    this.originParent = null;
  }
}
