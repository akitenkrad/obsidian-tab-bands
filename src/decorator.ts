import { App, Menu, WorkspaceLeaf, WorkspaceParent } from "obsidian";
import { t } from "./i18n";
import { COLOR_ORDER, GROUP_COLORS, groupLabel, GroupStore, TabGroup } from "./store";
import { tabGroups } from "./workspace-tree";

export interface DecoratorCallbacks {
  onToggleCollapse(group: TabGroup): void;
  onRename(group: TabGroup): void;
  onRecolor(group: TabGroup, color: (typeof COLOR_ORDER)[number]): void;
  onUngroup(group: TabGroup): void;
  onCloseGroup(group: TabGroup): void;
  /** 移動先候補のペイン一覧 (現在のペインは除く) */
  listMoveTargets(group: TabGroup): { label: string; parent: WorkspaceParent }[];
  onMoveToPane(group: TabGroup, parent: WorkspaceParent): void;
  onMoveToNewPane(group: TabGroup): void;
}

const CHIP_CLASS = "tb-chip";

/**
 * ネイティブのタブストリップを装飾する．
 *
 * 【チップの配置について】
 * チップはタブストリップの直接の子ではなく，**グループ先頭メンバーの
 * tabHeaderEl の子** として挿入する．実測で以下が分かっているため:
 *
 *  1. Obsidian はドロップ位置をストリップ内の子要素の並びから決めている
 *     (ストリップ先頭に独自要素を挿し，そこへドロップするとタブが index 0 へ移動した).
 *     チップをストリップの子にすると index 計算がずれる恐れがある.
 *  2. タブの並べ替え時に Obsidian はストリップを再構築し，注入した独自要素を捨てる.
 *     タブヘッダの子にしておけばヘッダごと移動するので消えにくい.
 *  3. チップへのドロップは本体から見て「先頭メンバーの左半分へのドロップ」になり，
 *     狙いどおりグループの直前にタブが挿入される (本体に移動を任せられる).
 */
export class TabStripDecorator {
  private observers: MutationObserver[] = [];

  constructor(
    private app: App,
    private store: GroupStore,
    private cb: DecoratorCallbacks,
  ) {}

  destroy(): void {
    for (const o of this.observers) o.disconnect();
    this.observers = [];
    this.clearAll();
  }

  /** タブグループ単位のリーフ一覧 (deferred なリーフも含む) */
  private leavesByParent(): Map<WorkspaceParent, WorkspaceLeaf[]> {
    return tabGroups(this.app);
  }

  private clearAll(): void {
    for (const [, leaves] of this.leavesByParent()) {
      // チップはタブヘッダの子なので，ストリップからの子孫検索で拾える
      const strip = leaves[0]?.tabHeaderEl?.parentElement;
      strip?.querySelectorAll(`.${CHIP_CLASS}`).forEach((el) => el.remove());
      for (const leaf of leaves) this.resetTab(leaf);
    }
  }

  /**
   * タイトル要素は leaf.tabHeaderInnerTitleEl から取る．
   * renderRun() と同じ経路にすることで，CSS クラス名 (.workspace-tab-header-inner-title)
   * への依存を 1 つ減らしている．非公式 API が消えれば型エラーで気付けるが，
   * クラス名が変わった場合は型チェックを通ったまま無言で壊れるため．
   */
  private resetTab(leaf: WorkspaceLeaf): void {
    const el = leaf.tabHeaderEl;
    if (!el) return;
    el.removeClasses(["tb-member", "tb-first", "tb-last", "tb-collapsed", "tb-chip-host"]);
    el.removeEventListener("click", this.collapsedHostClick, true);
    delete el.dataset.tbToggle;
    const title = leaf.tabHeaderInnerTitleEl;
    if (title?.dataset.tbOriginal !== undefined) {
      title.textContent = title.dataset.tbOriginal;
      delete title.dataset.tbOriginal;
    }
    el.style.removeProperty("--tb-color");
    delete el.dataset.tbGroup;
  }

  render(): void {
    for (const [, leaves] of this.leavesByParent()) {
      const strip = leaves[0]?.tabHeaderEl?.parentElement;
      if (!strip) continue;

      strip.querySelectorAll(`.${CHIP_CLASS}`).forEach((el) => el.remove());
      for (const leaf of leaves) this.resetTab(leaf);

      // 連続する同一グループのリーフを 1 つの「ラン」として描画する
      let i = 0;
      while (i < leaves.length) {
        const group = this.store.groupOf(leaves[i].id);
        if (!group) {
          i += 1;
          continue;
        }
        let j = i;
        while (j + 1 < leaves.length && this.store.groupOf(leaves[j + 1].id)?.id === group.id) j += 1;
        this.renderRun(group, leaves.slice(i, j + 1));
        i = j + 1;
      }
    }
  }

  private renderRun(group: TabGroup, run: WorkspaceLeaf[]): void {
    const color = GROUP_COLORS[group.color];

    run.forEach((leaf, idx) => {
      const el = leaf.tabHeaderEl;
      el.addClass("tb-member");
      if (idx === 0) el.addClass("tb-first");
      if (idx === run.length - 1) el.addClass("tb-last");
      if (group.collapsed) el.addClass("tb-collapsed");
      el.style.setProperty("--tb-color", color);
      el.dataset.tbGroup = group.id;
    });

    const host = run[0].tabHeaderEl;
    host.addClass("tb-chip-host");
    host.prepend(this.buildChip(group, run.length));

    // 畳んだときはチップ内のラベルで幅を確保できない (CSS で幅を広げられない).
    // タイトル要素をバンド名で上書きし，幅の計算は本体に委ねる.
    // 畳んでいる間は，ホストタブ全体をチップと同じトグルとして扱う．
    // (タイトル部分をクリックしても展開できるようにする)
    if (group.collapsed) {
      host.addEventListener("click", this.collapsedHostClick, true);
      host.dataset.tbToggle = group.id;
    } else {
      host.removeEventListener("click", this.collapsedHostClick, true);
      delete host.dataset.tbToggle;
    }

    const titleEl = run[0].tabHeaderInnerTitleEl;
    if (titleEl) {
      if (group.collapsed) {
        if (titleEl.dataset.tbOriginal === undefined) {
          titleEl.dataset.tbOriginal = titleEl.textContent ?? "";
        }
        titleEl.textContent = `${groupLabel(group)} (${run.length})`;
      } else if (titleEl.dataset.tbOriginal !== undefined) {
        titleEl.textContent = titleEl.dataset.tbOriginal;
        delete titleEl.dataset.tbOriginal;
      }
    }
  }

  private buildChip(group: TabGroup, memberCount: number): HTMLElement {
    const chip = createDiv({ cls: CHIP_CLASS });
    chip.style.setProperty("--tb-color", GROUP_COLORS[group.color]);
    // 幅は CSS 変数でチップ自身に載せる．body に載せるとポップアウト
    // ウィンドウ (別 document) に届かない．
    chip.style.setProperty("--tb-chip-name-max-width", `${this.store.settings.chipNameMaxWidth}ch`);
    chip.dataset.tbGroup = group.id;
    chip.setAttribute("role", "button");
    chip.setAttribute("tabindex", "0");
    chip.setAttribute("aria-expanded", String(!group.collapsed));
    chip.setAttribute(
      "aria-label",
      t("chipAria", {
        name: groupLabel(group),
        action: t(group.collapsed ? "actionExpand" : "actionCollapse"),
      }),
    );
    // 親のタブヘッダは draggable なので，チップ自身のドラッグは明示的に殺す
    chip.setAttribute("draggable", "false");

    chip.createSpan({ cls: "tb-chip-dot" });
    // 無名バンドでもラベル要素は作る．テキストは空のまま CSS で最小幅だけ与え，
    // チップが色ドットだけに潰れないようにする (幅の指定はチップに対しては効く．
    // 効かないのはタブヘッダ側で，そちらは折りたたみ時にタイトルを上書きして回避している).
    const name = group.name.trim();
    const nameEl = chip.createSpan({ cls: "tb-chip-name" });
    if (name) nameEl.setText(name);
    else nameEl.addClass("tb-chip-name-empty");
    if (group.collapsed) chip.createSpan({ cls: "tb-chip-count", text: String(memberCount) });
    if (group.collapsed) chip.addClass("tb-chip-collapsed");

    // --- 親タブへの伝播を止める ---
    // チップはタブヘッダの内側にいるので，止めないとクリックでタブが
    // アクティブになり，ドラッグでタブが動いてしまう．
    chip.addEventListener("mousedown", (evt) => evt.stopPropagation());
    chip.addEventListener("dragstart", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
    });
    chip.addEventListener("click", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      this.cb.onToggleCollapse(group);
    });
    chip.addEventListener("keydown", (evt) => {
      if (evt.key !== "Enter" && evt.key !== " ") return;
      evt.preventDefault();
      evt.stopPropagation();
      this.cb.onToggleCollapse(group);
    });
    chip.addEventListener("contextmenu", (evt) => {
      evt.preventDefault();
      evt.stopPropagation();
      this.showChipMenu(evt, group);
    });

    return chip;
  }

  /**
   * 畳んだホストタブのクリックを展開に振り替える．
   * capture フェーズで本体のタブ選択より先に止める．
   * addEventListener の重複登録を避けるため，同一の関数参照を使い回す.
   */
  private collapsedHostClick = (evt: MouseEvent): void => {
    const host = (evt.currentTarget as HTMLElement | null) ?? null;
    const groupId = host?.dataset.tbToggle;
    if (!groupId) return;
    const group = this.store.byId(groupId);
    if (!group?.collapsed) return;
    evt.preventDefault();
    evt.stopPropagation();
    this.cb.onToggleCollapse(group);
  };

  private showChipMenu(evt: MouseEvent, group: TabGroup): void {
    const menu = new Menu();
    menu.addItem((item) =>
      item
        .setTitle(t(group.collapsed ? "chipMenuExpand" : "chipMenuCollapse"))
        .setIcon(group.collapsed ? "chevron-right" : "chevron-down")
        .onClick(() => this.cb.onToggleCollapse(group)),
    );
    menu.addItem((item) => item.setTitle(t("chipMenuRename")).setIcon("pencil").onClick(() => this.cb.onRename(group)));
    menu.addSeparator();
    for (const color of COLOR_ORDER) {
      menu.addItem((item) =>
        item
          .setTitle(color)
          .setChecked(group.color === color)
          .onClick(() => this.cb.onRecolor(group, color)),
      );
    }
    menu.addSeparator();
    for (const target of this.cb.listMoveTargets(group)) {
      menu.addItem((item) =>
        item
          .setTitle(t("chipMenuMoveTo", { target: target.label }))
          .setIcon("move-right")
          .onClick(() => this.cb.onMoveToPane(group, target.parent)),
      );
    }
    menu.addItem((item) =>
      item.setTitle(t("chipMenuMoveToNewPane")).setIcon("separator-vertical").onClick(() => this.cb.onMoveToNewPane(group)),
    );

    menu.addSeparator();
    menu.addItem((item) => item.setTitle(t("chipMenuUngroup")).setIcon("ungroup").onClick(() => this.cb.onUngroup(group)));
    menu.addItem((item) =>
      item.setTitle(t("chipMenuCloseTabs")).setIcon("x").onClick(() => this.cb.onCloseGroup(group)),
    );
    menu.showAtMouseEvent(evt);
  }

  /**
   * 本体はタブの並べ替え時にストリップを再構築し，注入したチップを捨てる (実測).
   * layout-change だけでは取りこぼすので，ストリップの childList を監視する．
   */
  watch(onMutate: () => void): void {
    for (const o of this.observers) o.disconnect();
    this.observers = [];

    for (const [, leaves] of this.leavesByParent()) {
      const strip = leaves[0]?.tabHeaderEl?.parentElement;
      if (!strip) continue;
      const observer = new MutationObserver((records) => {
        // 自分のチップ挿入だけによる発火は無視する．
        // 本体の再構築ではタブヘッダも同時に動くので，この条件は通過する．
        const selfInflicted = records.every((r) =>
          [...r.addedNodes, ...r.removedNodes].every((n) => n instanceof HTMLElement && n.hasClass(CHIP_CLASS)),
        );
        if (!selfInflicted) onMutate();
      });
      observer.observe(strip, { childList: true, subtree: true });
      this.observers.push(observer);
    }
  }
}
