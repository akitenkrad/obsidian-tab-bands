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
import { groupLabel, GroupStore, TabGroup } from "./store";
import { t } from "./i18n";
import { absorptions, bandToJoinAtDrop, escapeTarget, type TabSlot } from "./rules";
import { DEFAULT_SETTINGS, type TabBandsSettings } from "./settings";
import { TabBandsSettingTab, type SettingsHost } from "./settings-tab";
import { allTabLeaves, leafById, tabGroups } from "./workspace-tree";

export default class TabBandsPlugin extends Plugin implements SettingsHost {
  store!: GroupStore;
  /**
   * 設定の写し．正は `store` (data.json の書き手を 1 つに保つため) で，
   * ここは読み取り用に持つ．`Plugin.settings` は本体が **プロパティ** として
   * 宣言しているのでアクセサでは上書きできない (TS2611)．
   * 書き換えるのは load 直後と updateSettings の 2 箇所だけ．
   */
  settings: Readonly<TabBandsSettings> = DEFAULT_SETTINGS;
  private decorator!: TabStripDecorator;
  private bridge!: TabDragBridge;
  private pending: PendingAssignment | null = null;
  /** 直前の layout-change 時点で存在していたリーフ ID */
  private knownLeafIds = new Set<string>();
  /** 直前にアクティブだったリーフ ID (アクティブが「動いた」かの判定に使う) */
  private lastActiveLeafId: string | undefined;
  /**
   * 1 つ前にアクティブだったリーフ．
   * 「バンドのメンバーから開かれた新規タブ」の判定に使う (absorbNewNeighbors).
   */
  private previousActiveLeafId: string | undefined;
  /**
   * 逃げ先が無いまま畳まれ，畳んだバンドの中に取り残されたタブ．
   * フォーカスが戻ってきただけでバンドを開き直さないために覚えておく．
   * セッション限りの状態でよい (起動時は onLayoutReady の退避で入り直す).
   */
  private trappedLeafIds = new Set<string>();
  private refresh = debounce(() => this.rerender(), 30, true);

  async onload(): Promise<void> {
    this.store = new GroupStore(this);
    await this.store.load();
    this.settings = this.store.settings;
    this.addSettingTab(new TabBandsSettingTab(this.app, this));

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
      this.knownLeafIds = new Set(this.tabLeaves().map((l) => l.id));
      this.store.reconcile(this.tabLeaves());
      // 前回の終了時にアクティブだったタブが畳んだバンドの中にあることがある．
      // 起動時は「保存された折りたたみ状態」を尊重し，アクティブの方を逃がす．
      const active = this.app.workspace.getMostRecentLeaf();
      this.lastActiveLeafId = active?.id;
      const group = active ? this.store.groupOf(active.id) : undefined;
      if (group?.collapsed) this.evacuateActive(group);
      void this.store.save();
      this.rerender();
    });

    this.registerEvent(this.app.workspace.on("layout-change", () => this.onLayoutChange()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.onActiveLeafChange()));

    // ポップアウトの開閉．タブグループが増減するので装飾と MutationObserver を
    // 張り直す (rerender が watch() ごとやり直す).
    this.registerEvent(this.app.workspace.on("window-open", () => this.refresh()));
    this.registerEvent(this.app.workspace.on("window-close", () => this.refresh()));

    // タブの右クリックメニュー (source === "tab-header") にバンド操作を足す
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, _file, source, leaf) => {
        if (source !== "tab-header" || !leaf) return;
        const current = this.store.groupOf(leaf.id);

        menu.addSeparator();
        menu.addItem((item) =>
          item
            .setTitle(t("tabMenuNewBand"))
            .setIcon("folder-plus")
            .onClick(() => this.addToNewGroup(leaf)),
        );
        for (const g of this.store.groups) {
          if (g.id === current?.id) continue;
          menu.addItem((item) =>
            item
              .setTitle(t("tabMenuAddToBand", { name: this.label(g) }))
              .setIcon("folder-input")
              .onClick(() => this.addToGroup(leaf, g.id)),
          );
        }
        if (current) {
          menu.addItem((item) =>
            item
              .setTitle(t("tabMenuRemoveFromBand"))
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
      name: t("cmdNewBand"),
      checkCallback: (checking) => {
        const leaf = this.app.workspace.getMostRecentLeaf();
        if (!leaf) return false;
        if (!checking) this.addToNewGroup(leaf);
        return true;
      },
    });

    this.addCommand({
      id: "ungroup-active-tab",
      name: t("cmdRemoveFromBand"),
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
      name: t("cmdToggleBand"),
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
      name: t("cmdCollapseAll"),
      callback: () => {
        for (const g of this.store.groups) {
          if (!g.collapsed) this.evacuateActive(g);
          this.store.toggleCollapsed(g.id, true);
        }
        void this.persist();
      },
    });
  }

  onunload(): void {
    this.decorator?.destroy();
  }

  // ---------- 非公式 API の保護 ----------

  /**
   * 非公式 API を触る処理を包む．
   *
   * 本プラグインの最優先事項は「壊れても Obsidian 本体を壊さない」こと．
   * 装飾が出なくなるのは許容するが，タブの並びやレイアウトの破損は許容しない．
   * 失敗は握り潰すが，同じラベルにつき 1 度だけ console.error に残す．
   */
  private reportedFailures = new Set<string>();

  private safely<T>(label: string, fn: () => T, fallback: T): T {
    try {
      return fn();
    } catch (err) {
      if (!this.reportedFailures.has(label)) {
        this.reportedFailures.add(label);
        console.error(t("diagFailure", { op: label }), err);
      }
      return fallback;
    }
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
    const enabled = this.settings.absorbNewTabs;

    for (const [, leaves] of tabGroups(this.app)) {
      // 設定で切っていても knownLeafIds の更新は続ける．飛ばすと，
      // 設定を戻した直後に «既にあるタブ» を新出と誤判定する．
      for (const leaf of leaves) seen.add(leaf.id);
      if (!enabled) continue;

      // 判断は rules.ts (純関数)．ここは結果を store に反映するだけ
      const decided = absorptions(this.slotsOf(leaves), {
        isNew: (leafId) => !this.knownLeafIds.has(leafId),
        wasRecentlyActive: (leafId) => this.wasRecentlyActive(leafId),
      });
      for (const { leafId, groupId } of decided) {
        const leaf = leaves.find((l) => l.id === leafId);
        if (!leaf) continue;
        this.store.assign(leaf, groupId);
        changed = true;
      }
    }

    this.knownLeafIds = seen;
    return changed;
  }

  /** タブの並びを rules.ts が扱える形 (バンド所属と折りたたみだけ) に落とす */
  private slotsOf(leaves: readonly WorkspaceLeaf[]): TabSlot[] {
    return leaves.map((leaf) => {
      const group = this.store.groupOf(leaf.id);
      return { leafId: leaf.id, groupId: group?.id, collapsed: group?.collapsed };
    });
  }

  /**
   * そのリーフが「今」または「1 つ前」のアクティブか．
   *
   * 新しいタブが開かれたとき，layout-change と active-leaf-change の
   * どちらが先に来るかは保証されない．先に layout-change が来れば開き元は
   * まだ lastActive，先に active-leaf-change が来れば previousActive に
   * 落ちている．どちらでも拾えるように両方を見る．
   */
  private wasRecentlyActive(leafId: string): boolean {
    return leafId === this.lastActiveLeafId || leafId === this.previousActiveLeafId;
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
    if (!target) {
      this.refresh();
      return;
    }
    if (!group?.collapsed) {
      // 展開状態のタブ 1 枚の移動．落ちた位置から参加先を決める
      if (!this.joinBandAtDrop(host, target)) this.refresh();
      return;
    }

    const rest = this.tabLeaves().filter(
      (l) => l !== host && this.store.groupOf(l.id)?.id === group.id,
    );
    if (!rest.length) {
      this.refresh();
      return;
    }

    if (target === result.originParent) {
      // 同一ペイン内: リーフは動かさず，children と DOM の並びだけ直す
      this.normalizeCollapsedDrop(target, host);
      this.gatherGroup(target, group.id, host);
      await this.persist();
      return;
    }

    const hostIndex = target.children.indexOf(host);
    const previousIds = rest.map((leaf) => leaf.id);
    const newIds = await this.relocate(rest, target, hostIndex + 1);
    this.store.remap(group.id, [host.id, ...newIds], [host.id, ...previousIds]);
    for (const id of newIds) this.knownLeafIds.add(id);
    await this.persist();
    new Notice(t("noticeMovedTabs", { name: this.label(group), count: newIds.length + 1 }));
  }

  /**
   * ドラッグしたタブ 1 枚を，落ちた位置のバンドへ参加させる．
   *
   * 判定は「**左右の隣が同一のバンドのメンバーである**」の一点だけ．この式は
   * 仕様で決めた 3 つのケースを自然に満たす:
   *
   * | ドロップ位置 | 結果 |
   * | --- | --- |
   * | 別バンドのメンバーに挟まれた位置 | そのバンドに参加する |
   * | バンドの外 (末尾の 1 つ右を含む) | 何もしない．離脱はさせない |
   * | バンドとバンドの境界 | どちらにも参加しない |
   *
   * 離脱を実装しないのは，「外に出た」が「どのバンドにも挟まれていない」と
   * 同じ判定になり，バンド末尾の 1 つ右に落とした場合と区別できないため．
   * 離脱は明示操作 (右クリック → バンドから外す) に限る．
   *
   * 【対象を広げないこと】かつて並び順からペイン内全リーフの membership を
   * 推論するルール (inferMembershipFromOrder) を入れたところ，バンド端のタブを
   * 外へドラッグしたときに間のタブを芋づる式に取り込んだ (実測)．対象は必ず
   * 「そのドラッグで動いた 1 枚」に限る．
   *
   * 参加させたら true．
   */
  private joinBandAtDrop(leaf: WorkspaceLeaf, parent: WorkspaceParent): boolean {
    // チップへのドロップは参加先が確定しているので，こちらは手を出さない
    if (this.pending) return false;

    const children = parent.children as WorkspaceLeaf[];
    const groupId = bandToJoinAtDrop(this.slotsOf(children), leaf.id);
    if (!groupId) return false;

    const from = this.store.groupOf(leaf.id);
    this.store.assign(leaf, groupId);
    // 元のバンドが分断されていたら整合させる (空になって消えた場合は何もしない)
    if (from && this.store.byId(from.id)) this.gatherGroup(parent, from.id);
    this.gatherGroup(parent, groupId);
    void this.persist();
    return true;
  }

  /**
   * リーフ群を別のタブグループへ移し，移動後の leafId を順に返す．
   *
   * 第一候補は insertChild / removeChild による直接の付け替え (非公式 API)．
   * leafId が保たれるので未保存の編集もスクロール位置も失われず，store の
   * 貼り替えも実質不要になる．非公式 API なので，使えない場合や期待どおりに
   * 動かない場合は，リーフを作り直す旧方式へ落ちる．
   */
  private async relocate(
    leaves: WorkspaceLeaf[],
    target: WorkspaceParent,
    startIndex: number,
  ): Promise<string[]> {
    if (!leaves.length) return [];
    if (this.canReparent(leaves, target)) {
      const moved = this.reparent(leaves, target, startIndex);
      if (moved) return moved;
    }
    return this.recreate(leaves, target, startIndex);
  }

  /** 非公式 API なので，使う直前に生きているか確かめる */
  private canReparent(leaves: WorkspaceLeaf[], target: WorkspaceParent): boolean {
    return (
      typeof target.insertChild === "function" &&
      leaves.every((leaf) => typeof leaf.parent?.removeChild === "function")
    );
  }

  /**
   * リーフを別のタブグループへ直接付け替える．
   *
   * まず 1 枚目だけを動かして結果を検証し，狙いどおりでなければ元へ戻して
   * null を返す (呼び出し元が旧方式へ落ちる)．引数の順序や containerEl の
   * 扱いが Obsidian 側で変わっても，タブが宙に浮いた状態にはしない．
   */
  private reparent(leaves: WorkspaceLeaf[], target: WorkspaceParent, startIndex: number): string[] | null {
    const [first, ...rest] = leaves;
    const origin = first.parent;
    const originIndex = origin ? (origin.children as WorkspaceLeaf[]).indexOf(first) : -1;

    const landed = this.safely(
      t("opReparent"),
      () => {
        this.moveChild(first, target, startIndex);
        return this.hasLanded(first, target);
      },
      false,
    );

    if (!landed) {
      // removeChild が通ったあとに insertChild が投げると，leaf.parent は
      // 移動元を指したままリーフだけがどこにも属さなくなる．parent の値では
      // なく，移動元に収まっているかどうかで巻き戻しの要否を決める．
      this.safely(
        t("opReparentRollback"),
        () => {
          if (origin && originIndex >= 0 && !this.hasLanded(first, origin)) {
            this.moveChild(first, origin, originIndex);
          }
        },
        undefined,
      );
      return null;
    }

    // 1 枚目が通れば残りも同じ経路で動く
    for (const [offset, leaf] of rest.entries()) {
      this.safely(t("opReparent"), () => this.moveChild(leaf, target, startIndex + 1 + offset), undefined);
    }
    this.app.workspace.requestSaveLayout();
    return leaves.map((leaf) => leaf.id);
  }

  private moveChild(leaf: WorkspaceLeaf, target: WorkspaceParent, index: number): void {
    leaf.parent?.removeChild?.(leaf);
    target.insertChild?.(index, leaf);
  }

  /**
   * 付け替えが実際に効いたかを確かめる．
   *
   * children だけでなく DOM も見る．insertChild がタブヘッダと
   * リーフ本体を一緒に運んでくれるかは保証が無く，運ばれていなければ
   * 「論理的には移動したが画面に出ない」状態になるため．
   *
   * 内容側は leaf.view.containerEl (公開 API) で見る．leaf.containerEl は
   * 非公式で，かつ view.containerEl はその子孫なので，target に入っているか
   * どうかの判定としては等価．deferred なリーフでも view.containerEl は
   * 存在する (2026-08-29, Obsidian 1.10.3 で実測: deferred 10 件すべてが保持).
   */
  private hasLanded(leaf: WorkspaceLeaf, target: WorkspaceParent): boolean {
    return (
      leaf.parent === target &&
      (target.children as WorkspaceLeaf[]).includes(leaf) &&
      target.containerEl.contains(leaf.tabHeaderEl) &&
      target.containerEl.contains(leaf.view.containerEl)
    );
  }

  /**
   * 旧方式: 移動先に新しいリーフを作って viewState を移し替え，元を detach する．
   * leafId が変わるので呼び出し元で store の貼り替えが要る．
   */
  private async recreate(
    leaves: WorkspaceLeaf[],
    target: WorkspaceParent,
    startIndex: number,
  ): Promise<string[]> {
    const newIds: string[] = [];
    for (const [offset, leaf] of leaves.entries()) {
      const viewState = leaf.getViewState();
      const ephemeral = leaf.getEphemeralState();
      const created = this.safely(
        t("opCreateLeaf"),
        () =>
          this.app.workspace.createLeafInParent(
            target as unknown as Parameters<typeof this.app.workspace.createLeafInParent>[0],
            startIndex + offset,
          ),
        null as WorkspaceLeaf | null,
      );
      if (!created) break; // 途中で失敗したら残りは動かさない
      await created.setViewState(viewState);
      created.setEphemeralState(ephemeral);
      newIds.push(created.id);
      leaf.detach();
    }
    return newIds;
  }

  /** 移動先候補のペイン (バンドが今いるペインは除く) */
  private moveTargets(group: TabGroup): { label: string; parent: WorkspaceParent }[] {
    const home = this.tabLeaves().find((l) => this.store.groupOf(l.id)?.id === group.id)?.parent;
    // 別ウィンドウ (ポップアウト) のペインは候補に出さない．insertChild による
    // 付け替えが document をまたげるかは未検証で，落ちれば作り直しになり
    // leafId と未保存の編集を失う．getContainer() は公開 API．
    const homeContainer = home?.getContainer();
    const out: { label: string; parent: WorkspaceParent }[] = [];
    let n = 0;
    for (const [parent, leaves] of tabGroups(this.app)) {
      n += 1;
      if (parent === home) continue;
      if (homeContainer && parent.getContainer() !== homeContainer) continue;
      out.push({ label: t("paneLabel", { n, title: leaves[0]?.getDisplayText() ?? "" }), parent });
    }
    return out;
  }

  /**
   * バンドのメンバーをまとめて別のタブグループへ移す．
   *
   * relocate() は付け替えに成功すれば同じ leafId を，作り直しに落ちれば新しい
   * leafId を返す．どちらでも store の並びを移動後の ID で貼り替える．
   */
  private async moveBandTo(group: TabGroup, target: WorkspaceParent): Promise<void> {
    const members = this.tabLeaves().filter((l) => this.store.groupOf(l.id)?.id === group.id);
    if (!members.length) return;

    const previousIds = members.map((leaf) => leaf.id);
    const newIds = await this.relocate(members, target, target.children.length);
    this.store.remap(group.id, newIds, previousIds);
    // 作り直しに落ちた場合，そのリーフは「新出」だが吸収対象にしてはいけない
    for (const id of newIds) this.knownLeafIds.add(id);
    await this.persist();
    new Notice(t("noticeMovedTabs", { name: this.label(group), count: newIds.length }));
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

  /** タブストリップに並ぶ全リーフ (ポップアウトのぶんも含む) */
  private tabLeaves(): WorkspaceLeaf[] {
    return allTabLeaves(this.app);
  }

  // ---------- アクティブタブと折りたたみ ----------

  /**
   * 「アクティブなタブは画面から隠れていてはならない」を保つ．
   *
   * この状態になる経路は 2 つあり，あるべき解決が逆になる．
   *
   * | 経路 | 解決 |
   * | --- | --- |
   * | バンドを畳んだ (アクティブは動いていない) | アクティブを外へ逃がす |
   * | ユーザーが畳んだバンドのメンバーへ移動した | バンドを開く |
   *
   * 両者は「アクティブなリーフが変わったか」で区別できる．畳む操作では
   * アクティブは動かないので，変化を伴わない再描画でバンドを開いてはならない
   * (「すべてのバンドを折りたたむ」が片っ端から開き直されてしまう).
   */
  private onActiveLeafChange(): void {
    const active = this.app.workspace.getMostRecentLeaf();
    const moved = active?.id !== this.lastActiveLeafId;
    if (moved) this.previousActiveLeafId = this.lastActiveLeafId;
    this.lastActiveLeafId = active?.id;
    // 展開すると persist() 経由で再描画されるので，重ねて refresh しない
    if (moved && this.revealActiveBand()) return;
    this.refresh();
  }

  /**
   * アクティブなタブが畳んだバンドの中にあるなら，そのバンドを開く．
   *
   * 畳んだバンドのメンバーはタブヘッダが display:none なので，リンクや
   * Quick switcher からそのノートへ移動しても画面に出てこない．Chrome と
   * 同じく，移動先のバンドを開いて見せる．
   *
   * 展開したら true．
   */
  private revealActiveBand(): boolean {
    const active = this.app.workspace.getMostRecentLeaf();
    const group = active ? this.store.groupOf(active.id) : undefined;
    if (!active) return false;
    if (!group?.collapsed) {
      // 畳まれていないバンドに居るなら，もう「取り残されて」いない
      this.trappedLeafIds.delete(active.id);
      return false;
    }
    // 取り残されたタブへフォーカスが戻ってきただけ．畳んだ状態を保つ
    if (this.trappedLeafIds.has(active.id)) return false;

    this.store.toggleCollapsed(group.id, false);
    this.releaseTrapped(group);
    void this.persist();
    return true;
  }

  /** バンドを開いたら，その中に取り残されていた記録は捨てる */
  private releaseTrapped(group: TabGroup): void {
    for (const id of group.leafIds) this.trappedLeafIds.delete(id);
  }

  /**
   * バンドを畳む前に，その中にアクティブなタブがあれば外へ逃がす．
   *
   * 逃げ先は「同じペインにいて，畳まれておらず，これから畳むバンドにも
   * 属さない」タブ．見つからなければ何もしない (アクティブは畳んだバンドの
   * 中に留まり，エディタは直前のノートを表示し続ける).
   */
  private evacuateActive(group: TabGroup): void {
    const active = this.app.workspace.getMostRecentLeaf();
    if (!active || this.store.groupOf(active.id)?.id !== group.id) return;

    const siblings = (active.parent?.children ?? []) as WorkspaceLeaf[];
    const escapeId = escapeTarget(this.slotsOf(siblings), active.id, group.id);
    const escape = escapeId ? siblings.find((leaf) => leaf.id === escapeId) : undefined;
    if (!escape) {
      // ペイン内が畳んだバンドだけになる場合．畳むこと自体は許し，アクティブは
      // 中に留める (エディタは直前のノートを表示し続ける)．代わりに，戻って
      // きたときに開き直さないよう覚えておく．
      this.trappedLeafIds.add(active.id);
      return;
    }
    this.app.workspace.setActiveLeaf(escape, { focus: false });
    this.lastActiveLeafId = escape.id;
  }

  /** 無名バンドの表示用ラベル */
  private label(group: TabGroup): string {
    return groupLabel(group);
  }

  private rerender(): void {
    this.decorator.render();
    this.decorator.watch(() => this.refresh());
  }

  private async persist(): Promise<void> {
    await this.store.save();
    this.rerender();
  }

  // ---------- 設定 (settings-tab.ts の SettingsHost) ----------

  /** 保存したうえで再描画する (チップ幅の変更をその場で見せるため) */
  async updateSettings(patch: Partial<TabBandsSettings>): Promise<void> {
    this.store.updateSettings(patch);
    this.settings = this.store.settings;
    await this.persist();
  }

  private addToNewGroup(leaf: WorkspaceLeaf): void {
    // 既定名は GroupStore 側で `Tab-N` の連番を採番する
    const group = this.store.createGroup();
    this.addToGroup(leaf, group.id);
  }

  private addToGroup(leaf: WorkspaceLeaf, groupId: string): void {
    this.store.assign(leaf, groupId);
    this.gatherGroup(leaf.parent, groupId);
    void this.persist();
  }

  private toggleCollapse(group: TabGroup): void {
    // 畳んでからでは「アクティブが隠れた」状態が一瞬できてしまう．先に逃がす．
    if (group.collapsed) this.releaseTrapped(group);
    else this.evacuateActive(group);
    this.store.toggleCollapsed(group.id);
    void this.persist();
  }

  private async closeGroup(group: TabGroup): Promise<void> {
    const name = this.label(group);
    const targets = this.tabLeaves().filter((l) => group.leafIds.includes(l.id));
    for (const leaf of targets) leaf.detach();
    this.store.deleteGroup(group.id);
    await this.persist();
    new Notice(t("noticeClosedTabs", { name, count: targets.length }));
  }

  private promptRename(group: TabGroup): void {
    new RenameModal(this.app, group.name, (name) => {
      this.store.rename(group.id, name);
      void this.persist();
    }).open();
  }

  /**
   * 同一バンドのタブを隣接させる．
   *
   * WorkspaceParent.children は非公開 API なので，配列と DOM の両方を
   * 手で同期させたうえで requestSaveLayout() を呼ぶ．
   * この関数だけが「並びを書き換える」責務を持つ．
   *
   * anchorLeaf: 集約位置の基準．指定が無ければ「並び順で最初のメンバー」だが，
   * ドラッグ時は動かしたリーフを基準にしないと元の位置へ引き戻される
   * (右へ動かすと members[0] が別のメンバーに変わってしまうため).
   */
  private gatherGroup(
    parent: WorkspaceParent | undefined,
    groupId: string,
    anchorLeaf?: WorkspaceLeaf,
  ): void {
    this.safely(t("opReorderBand"), () => {
      const children = parent?.children as WorkspaceLeaf[] | undefined;
      if (!children?.length) return;

      const members = children.filter((leaf) => this.store.groupOf(leaf.id)?.id === groupId);
      if (members.length < 2) return;

      // タブヘッダを持たないリーフがあると DOM 同期が途中で失敗し，
      // children と表示が食い違ったまま残る．事前に弾く．
      if (!children.every((leaf) => leaf?.tabHeaderEl instanceof HTMLElement)) {
        throw new Error("a leaf without tabHeaderEl");
      }

      const pivot = anchorLeaf && members.includes(anchorLeaf) ? anchorLeaf : members[0];
      const anchor = children.indexOf(pivot);
      if (anchor < 0) throw new Error("the anchor leaf is not in children");

      const rest = children.filter((leaf) => !members.includes(leaf));
      // anchor は元の children 上の index なので，メンバーを除いた rest に
      // そのまま使うとずれる．非メンバーだけを数え直す．
      const beforeCount = children.slice(0, anchor).filter((leaf) => !members.includes(leaf)).length;
      const ordered = [pivot, ...members.filter((leaf) => leaf !== pivot)];
      const reordered = [...rest.slice(0, beforeCount), ...ordered, ...rest.slice(beforeCount)];

      if (reordered.length !== children.length) {
        throw new Error(`並べ替え後の要素数が一致しません (${reordered.length} vs ${children.length})`);
      }

      const strip = pivot.tabHeaderEl.parentElement;
      if (!strip) throw new Error("tab strip not found");

      // DOM を先に同期する．appendChild の連続だとタブが一度末尾へ飛ぶので，
      // 末尾から insertBefore で詰めていく．
      let ref: HTMLElement | null = null;
      for (let i = reordered.length - 1; i >= 0; i -= 1) {
        const el = reordered[i].tabHeaderEl;
        strip.insertBefore(el, ref);
        ref = el;
      }

      // DOM が意図どおりになってから children を差し替える．
      // 逆順にすると，DOM 同期が途中で失敗した場合に論理順序だけが進んで
      // ラン判定と表示が食い違う (バンドが分断されて見える).
      children.splice(0, children.length, ...reordered);

      this.app.workspace.requestSaveLayout();
      this.verifyOrder(parent as WorkspaceParent, strip);
    }, undefined);
  }

  /**
   * 折りたたんだ他バンドの内部に着地したホストを，そのバンドの後ろへ送る．
   *
   * 畳んだバンドはホスト以外が display:none なので，画面上は 1 タブ分の幅しかない．
   * ユーザが「バンドの右」に落としても，本体は「先頭メンバーの直後」と解釈する．
   * 実測: 学習 (5 タブ) の右へ落としたところ，並びが
   *   [学習×1] [異常×6] [学習×4]
   * となり，後段の集約で元の位置へ押し戻された．
   *
   * 視覚的な意図に合わせ，畳んだバンドは常に「またぐ」対象として扱う．
   */
  private normalizeCollapsedDrop(parent: WorkspaceParent, host: WorkspaceLeaf): void {
    this.safely(t("opFixDropPosition"), () => {
      const children = parent.children as WorkspaceLeaf[];
      const index = children.indexOf(host);
      if (index <= 0) return;

      const own = this.store.groupOf(host.id)?.id;
      const neighbour = this.store.groupOf(children[index - 1].id);
      if (!neighbour || neighbour.id === own || !neighbour.collapsed) return;

      // 隣接バンドのメンバーがホストより後ろにもいる = 内部に着地している
      let last = index;
      for (let i = index + 1; i < children.length; i += 1) {
        if (this.store.groupOf(children[i].id)?.id === neighbour.id) last = i;
      }
      if (last <= index) return;

      children.splice(index, 1);
      children.splice(last, 0, host);

      const strip = host.tabHeaderEl?.parentElement;
      if (strip) {
        const ref = (children[last + 1] as WorkspaceLeaf | undefined)?.tabHeaderEl ?? null;
        strip.insertBefore(host.tabHeaderEl, ref);
      }
    }, undefined);
  }

  /**
   * children (論理順序) と タブストリップ (表示順序) の一致を検査する．
   *
   * ランの判定は children から行い，チップの描画は DOM に対して行うため，
   * ここが食い違うと「同じバンドのチップが 2 箇所に出る」等の症状になる．
   * 不整合はプラグイン単体では原因を特定できないので，検出できたら記録する．
   *
   * ここだけは本体の CSS クラス名を**意図的に**使っている．既知の tabHeaderEl の
   * 集合で filter すると，children に無いタブヘッダが DOM にある場合を弾いてしまい，
   * まさに検出したい不整合が見えなくなるため (現在は "?" として記録される)．
   * 診断専用なので，クラス名が変わっても静かに何もしなくなるだけで機能は壊れない．
   */
  private verifyOrder(parent: WorkspaceParent, strip: HTMLElement): void {
    const logical = (parent.children as WorkspaceLeaf[]).map((leaf) => leaf.id);
    const visual = [...strip.children]
      .filter((el): el is HTMLElement => el instanceof HTMLElement && el.hasClass("workspace-tab-header"))
      .map((el) => (parent.children as WorkspaceLeaf[]).find((leaf) => leaf.tabHeaderEl === el)?.id ?? "?");

    if (logical.join(",") === visual.join(",")) return;
    if (this.reportedFailures.has("order-mismatch")) return;
    this.reportedFailures.add("order-mismatch");
    console.error(
      t("diagOrderMismatch"),
      { logical, visual },
    );
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
    this.titleEl.setText(t("renameTitle"));
    new Setting(this.contentEl)
      .setName(t("renameNameLabel"))
      .setDesc(t("renameNameDesc"))
      .addText((text) =>
        text
          .setValue(this.value)
          .setPlaceholder(t("renamePlaceholder"))
          .onChange((v) => (this.value = v))
          .inputEl.addEventListener("keydown", (evt) => {
            // IME の変換確定 Enter を拾わない．変換中の Enter も key === "Enter"
            // で届くため，これを見ないと «変換を確定した瞬間にダイアログまで
            // 確定される» (日本語入力では読みのままバンド名になる).
            // isComposing と keyCode 229 の両方を見る (環境によりどちらか
            // 一方しか立たないことがある).
            if (evt.isComposing || evt.keyCode === 229) return;
            if (evt.key === "Enter") this.submit();
          }),
      );
    new Setting(this.contentEl).addButton((btn) =>
      btn.setButtonText(t("renameSave")).setCta().onClick(() => this.submit()),
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
