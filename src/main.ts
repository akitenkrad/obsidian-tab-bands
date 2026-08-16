import {
  App,
  Modal,
  Notice,
  Plugin,
  Setting,
  WorkspaceLeaf,
  WorkspaceParent,
  debounce,
} from "obsidian";
import { TabStripDecorator } from "./decorator";
import { DragResult, PendingAssignment, TabDragBridge } from "./drag";
import { GroupStore, TabGroup } from "./store";
import { allRootLeaves, leafById, tabGroups } from "./workspace-tree";

export default class TabBandsPlugin extends Plugin {
  store!: GroupStore;
  private decorator!: TabStripDecorator;
  private bridge!: TabDragBridge;
  private pending: PendingAssignment | null = null;
  /** 直前の layout-change 時点で存在していたリーフ ID */
  private knownLeafIds = new Set<string>();
  private refresh = debounce(() => this.rerender(), 30, true);

  async onload(): Promise<void> {
    this.store = new GroupStore(this);
    await this.store.load();

    this.decorator = new TabStripDecorator(this.app, this.store, {
      onToggleCollapse: (g) => this.toggleCollapse(g),
      onRename: (g) => this.promptRename(g),
      onRecolor: (g, color) => {
        this.store.recolor(g.id, color);
        void this.persist();
      },
      onUngroup: (g) => {
        this.store.deleteGroup(g.id);
        void this.persist();
      },
      onCloseGroup: (g) => void this.closeGroup(g),
      listMoveTargets: (g) => this.moveTargets(g),
      onMoveToPane: (g, parent) => void this.moveBandTo(g, parent),
      onMoveToNewPane: (g) => void this.moveBandToNewPane(g),
    });

    this.bridge = new TabDragBridge(this, this.store, {
      onDropOnChip: (pending) => {
        this.pending = pending;
        // 同一タブグループ内の並べ替えでは layout-change の発火が遅れる/来ない
        // ことがある．本体の移動が終わる次タスクで確実に適用する．
        window.setTimeout(() => {
          if (this.applyPending()) void this.persist();
        }, 0);
      },
      onDragEnd: (result) => void this.handleDragEnd(result),
    });
    this.bridge.register();

    this.app.workspace.onLayoutReady(() => {
      this.knownLeafIds = new Set(this.rootLeaves().map((l) => l.id));
      this.store.reconcile(this.rootLeaves());
      void this.store.save();
      this.rerender();
    });

    this.registerEvent(this.app.workspace.on("layout-change", () => this.onLayoutChange()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", this.refresh));

    // タブの右クリックメニュー (source === "tab-header") にバンド操作を足す
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, _file, source, leaf) => {
        if (source !== "tab-header" || !leaf) return;
        const current = this.store.groupOf(leaf.id);

        menu.addSeparator();
        menu.addItem((item) =>
          item
            .setTitle("新しいバンドにまとめる")
            .setIcon("folder-plus")
            .onClick(() => this.addToNewGroup(leaf)),
        );
        for (const g of this.store.groups) {
          if (g.id === current?.id) continue;
          menu.addItem((item) =>
            item
              .setTitle(`バンド「${this.label(g)}」に追加`)
              .setIcon("folder-input")
              .onClick(() => this.addToGroup(leaf, g.id)),
          );
        }
        if (current) {
          menu.addItem((item) =>
            item
              .setTitle("バンドから外す")
              .setIcon("folder-minus")
              .onClick(() => {
                this.store.unassign(leaf.id);
                void this.persist();
              }),
          );
        }
      }),
    );

    this.addCommand({
      id: "group-active-tab",
      name: "アクティブタブを新しいバンドにまとめる",
      checkCallback: (checking) => {
        const leaf = this.app.workspace.getMostRecentLeaf();
        if (!leaf) return false;
        if (!checking) this.addToNewGroup(leaf);
        return true;
      },
    });

    this.addCommand({
      id: "ungroup-active-tab",
      name: "アクティブタブをバンドから外す",
      checkCallback: (checking) => {
        const leaf = this.app.workspace.getMostRecentLeaf();
        if (!leaf || !this.store.groupOf(leaf.id)) return false;
        if (!checking) {
          this.store.unassign(leaf.id);
          void this.persist();
        }
        return true;
      },
    });

    this.addCommand({
      id: "toggle-active-group",
      name: "アクティブタブのバンドを折りたたむ/展開する",
      checkCallback: (checking) => {
        const leaf = this.app.workspace.getMostRecentLeaf();
        const group = leaf ? this.store.groupOf(leaf.id) : undefined;
        if (!group) return false;
        if (!checking) this.toggleCollapse(group);
        return true;
      },
    });

    this.addCommand({
      id: "collapse-all-groups",
      name: "すべてのバンドを折りたたむ",
      callback: () => {
        for (const g of this.store.groups) this.store.toggleCollapsed(g.id, true);
        void this.persist();
      },
    });
  }

  onunload(): void {
    this.decorator?.destroy();
  }

  // ---------- 状態の確定 ----------

  /**
   * layout-change での確定処理．
   *
   * applyPending と absorbNewNeighbors は必ず両方を通す．
   * 片方が early return すると absorbNewNeighbors の中で行っている
   * knownLeafIds の更新が飛び，次回に既存タブを「新出」と誤判定するため．
   */
  private onLayoutChange(): void {
    const applied = this.applyPending();
    const absorbed = this.absorbNewNeighbors();
    if (applied || absorbed) {
      void this.persist();
      return;
    }
    this.refresh();
  }

  /**
   * チップへのドロップで記録した意図を適用する．
   * 本体の移動が終わっていないとリーフが見つからないので，その場合は
   * pending を捨てずに次の layout-change で再試行する．
   */
  private applyPending(): boolean {
    if (!this.pending) return false;
    const { leafId, groupId } = this.pending;
    const leaf = leafById(this.app, leafId);
    if (!leaf) return false;
    this.pending = null;
    // 本体がチップの位置 (= バンド直前) へ移動済みなので gatherGroup は不要
    this.store.assign(leaf, groupId);
    return true;
  }

  /**
   * バンドのメンバーに挟まれた位置に「新しく開かれた」タブを吸収する．
   *
   * 既存タブの移動と区別するため，前回時点で存在しなかったリーフだけを
   * 対象にする．並び順だけで判断すると，バンド端のタブを外へドラッグした際に
   * 間のタブを芋づる式に取り込んでしまう (実測済み).
   */
  private absorbNewNeighbors(): boolean {
    let changed = false;
    const seen = new Set<string>();

    for (const [, leaves] of tabGroups(this.app)) {
      for (let i = 0; i < leaves.length; i += 1) {
        seen.add(leaves[i].id);
        if (i === 0 || i === leaves.length - 1) continue;
        if (this.knownLeafIds.has(leaves[i].id)) continue; // 既存タブの移動は対象外
        if (this.store.groupOf(leaves[i].id)) continue;

        const prev = this.store.groupOf(leaves[i - 1].id);
        const next = this.store.groupOf(leaves[i + 1].id);
        if (prev && next && prev.id === next.id) {
          this.store.assign(leaves[i], prev.id);
          changed = true;
        }
      }
    }

    this.knownLeafIds = seen;
    return changed;
  }

  // ---------- ペイン移動 ----------

  /**
   * ドラッグ終了後の追随処理．
   *
   * 畳んだバンドではホストタブしか DOM に無いので，本体はホスト 1 枚だけを
   * 別ペインへ運ぶ．残りのメンバーをホストの直後へ移して整合させる．
   */
  private async handleDragEnd(result: DragResult): Promise<void> {
    const host = result.leaf;
    if (!host) {
      this.refresh();
      return;
    }
    const group = this.store.groupOf(host.id);
    const target = host.parent;
    if (!group?.collapsed || !target) {
      this.refresh();
      return;
    }

    const rest = this.rootLeaves().filter(
      (l) => l !== host && this.store.groupOf(l.id)?.id === group.id,
    );
    if (!rest.length) {
      this.refresh();
      return;
    }

    if (target === result.originParent) {
      // 同一ペイン内: リーフは動かさず，children と DOM の並びだけ直す
      this.gatherGroup(target, group.id, host);
      await this.persist();
      return;
    }

    const hostIndex = target.children.indexOf(host);
    const newIds = await this.relocate(rest, target, hostIndex + 1);
    this.store.remap(group.id, [host.id, ...newIds]);
    for (const id of newIds) this.knownLeafIds.add(id);
    await this.persist();
    new Notice(`「${this.label(group)}」の ${newIds.length + 1} タブを移動しました`);
  }

  /**
   * リーフ群を別のタブグループへ移す．
   *
   * リーフを直接 reparent する公開 API は無いので，移動先に新しいリーフを作って
   * viewState を移し替え，元を detach する．新しい leafId を順に返す．
   */
  private async relocate(
    leaves: WorkspaceLeaf[],
    target: WorkspaceParent,
    startIndex: number,
  ): Promise<string[]> {
    const newIds: string[] = [];
    for (const [offset, leaf] of leaves.entries()) {
      const viewState = leaf.getViewState();
      const ephemeral = leaf.getEphemeralState();
      const created = this.app.workspace.createLeafInParent(
        target as unknown as Parameters<typeof this.app.workspace.createLeafInParent>[0],
        startIndex + offset,
      );
      await created.setViewState(viewState);
      created.setEphemeralState(ephemeral);
      newIds.push(created.id);
      leaf.detach();
    }
    return newIds;
  }

  /** 移動先候補のペイン (バンドが今いるペインは除く) */
  private moveTargets(group: TabGroup): { label: string; parent: WorkspaceParent }[] {
    const home = this.rootLeaves().find((l) => this.store.groupOf(l.id)?.id === group.id)?.parent;
    const out: { label: string; parent: WorkspaceParent }[] = [];
    let n = 0;
    for (const [parent, leaves] of tabGroups(this.app)) {
      n += 1;
      if (parent === home) continue;
      out.push({ label: `ペイン ${n} (${leaves[0]?.getDisplayText() ?? ""})`, parent });
    }
    return out;
  }

  /**
   * バンドのメンバーをまとめて別のタブグループへ移す．
   *
   * リーフを直接 reparent する公開 API は無いので，移動先に新しいリーフを作って
   * viewState を移し替え，元を detach する．leafId が変わるので store を remap する．
   */
  private async moveBandTo(group: TabGroup, target: WorkspaceParent): Promise<void> {
    const members = this.rootLeaves().filter((l) => this.store.groupOf(l.id)?.id === group.id);
    if (!members.length) return;

    const newIds = await this.relocate(members, target, target.children.length);
    this.store.remap(group.id, newIds);
    // 移動で作り直したリーフは「新出」だが吸収対象にしてはいけない
    for (const id of newIds) this.knownLeafIds.add(id);
    await this.persist();
    new Notice(`「${this.label(group)}」の ${newIds.length} タブを移動しました`);
  }

  /** 右に新しいペインを作ってバンドを移す */
  private async moveBandToNewPane(group: TabGroup): Promise<void> {
    const placeholder = this.app.workspace.getLeaf("split");
    const target = placeholder.parent;
    if (!target) return;
    await this.moveBandTo(group, target);
    placeholder.detach();
  }

  // ---------- 操作 ----------

  private rootLeaves(): WorkspaceLeaf[] {
    return allRootLeaves(this.app);
  }

  /** 無名バンドの表示用ラベル */
  private label(group: TabGroup): string {
    return group.name.trim() || "バンド";
  }

  private rerender(): void {
    this.decorator.render();
    this.decorator.watch(() => this.refresh());
  }

  private async persist(): Promise<void> {
    await this.store.save();
    this.rerender();
  }

  private addToNewGroup(leaf: WorkspaceLeaf): void {
    const group = this.store.createGroup(""); // 既定は無名．チップは色ドットのみ
    this.addToGroup(leaf, group.id);
  }

  private addToGroup(leaf: WorkspaceLeaf, groupId: string): void {
    this.store.assign(leaf, groupId);
    this.gatherGroup(leaf.parent, groupId);
    void this.persist();
  }

  private toggleCollapse(group: TabGroup): void {
    this.store.toggleCollapsed(group.id);
    void this.persist();
  }

  private async closeGroup(group: TabGroup): Promise<void> {
    const name = this.label(group);
    const targets = this.rootLeaves().filter((l) => group.leafIds.includes(l.id));
    for (const leaf of targets) leaf.detach();
    this.store.deleteGroup(group.id);
    await this.persist();
    new Notice(`「${name}」の ${targets.length} 個のタブを閉じました`);
  }

  private promptRename(group: TabGroup): void {
    new RenameModal(this.app, group.name, (name) => {
      this.store.rename(group.id, name);
      void this.persist();
    }).open();
  }

  /**
   * 同一バンドのタブを隣接させる．
   * WorkspaceParent.children は非公開 API なので，配列と DOM の両方を
   * 手で同期させたうえで requestSaveLayout() を呼ぶ．
   * この関数だけが「並びを書き換える」責務を持つ．
   */
  private gatherGroup(
    parent: WorkspaceParent | undefined,
    groupId: string,
    anchorLeaf?: WorkspaceLeaf,
  ): void {
    const children = parent?.children as WorkspaceLeaf[] | undefined;
    if (!children?.length) return;

    const members = children.filter((leaf) => this.store.groupOf(leaf.id)?.id === groupId);
    if (members.length < 2) return;

    // 集約位置の基準．指定が無ければ「並び順で最初のメンバー」だが，
    // ドラッグ時は動かしたリーフを基準にしないと元の位置へ引き戻される
    // (右へ動かすと members[0] が別のメンバーに変わってしまうため).
    const pivot = anchorLeaf && members.includes(anchorLeaf) ? anchorLeaf : members[0];
    const anchor = children.indexOf(pivot);

    const rest = children.filter((leaf) => !members.includes(leaf));
    // anchor は元の children 上の index なので，メンバーを除いた rest に
    // そのまま使うとずれる．非メンバーだけを数え直す．
    const beforeCount = children.slice(0, anchor).filter((leaf) => !members.includes(leaf)).length;
    const ordered = [pivot, ...members.filter((leaf) => leaf !== pivot)];
    const reordered = [...rest.slice(0, beforeCount), ...ordered, ...rest.slice(beforeCount)];

    children.splice(0, children.length, ...reordered);

    const strip = members[0].tabHeaderEl?.parentElement;
    if (strip) {
      for (const leaf of reordered) strip.appendChild(leaf.tabHeaderEl);
    }
    this.app.workspace.requestSaveLayout();
  }
}

class RenameModal extends Modal {
  private value: string;

  constructor(
    app: App,
    initial: string,
    private onSubmit: (name: string) => void,
  ) {
    super(app);
    this.value = initial;
  }

  onOpen(): void {
    this.titleEl.setText("バンド名を変更");
    new Setting(this.contentEl)
      .setName("名前")
      .setDesc("空にすると色ドットのみのチップになります")
      .addText((text) =>
        text
          .setValue(this.value)
          .setPlaceholder("(無名)")
          .onChange((v) => (this.value = v))
          .inputEl.addEventListener("keydown", (evt) => {
            if (evt.key === "Enter") this.submit();
          }),
      );
    new Setting(this.contentEl).addButton((btn) =>
      btn.setButtonText("保存").setCta().onClick(() => this.submit()),
    );
  }

  /** 空文字も許可する (無名バンドに戻せるようにするため) */
  private submit(): void {
    this.onSubmit(this.value.trim());
    this.close();
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
