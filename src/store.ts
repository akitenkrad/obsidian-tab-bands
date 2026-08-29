import type { Plugin, WorkspaceLeaf } from "obsidian";
import { t } from "./i18n";
import { DEFAULT_SETTINGS, normalizeSettings, type TabBandsSettings } from "./settings";

/**
 * バンドの色パレット (9 色).
 * Material Design 系の彩度の高い色を選んでおり，ライト/ダークどちらの
 * テーマでも背景と十分なコントラストが出る値にしてある.
 */
export const GROUP_COLORS = {
  grey: "#5f6368",
  blue: "#1a73e8",
  red: "#d93025",
  yellow: "#f9ab00",
  green: "#1e8e3e",
  pink: "#d01884",
  purple: "#9334e6",
  cyan: "#007b83",
  orange: "#fa903e",
} as const;

export type GroupColor = keyof typeof GROUP_COLORS;
export const COLOR_ORDER = Object.keys(GROUP_COLORS) as GroupColor[];

export interface TabGroup {
  id: string;
  name: string;
  color: GroupColor;
  collapsed: boolean;
  /** WorkspaceLeaf.id の配列．タブストリップ上の並び順とは独立に保持する */
  leafIds: string[];
}

/** 無名バンドの表示用ラベル (名前は空にできる仕様なのでフォールバックが要る) */
export function groupLabel(group: TabGroup): string {
  return group.name.trim() || t("unnamedBand");
}

/**
 * leafId は workspace.json に永続化されるので再起動をまたいで概ね安定するが，
 * 「ワークスペース切り替え」や手動編集で失われることがある．
 * その保険として leafId -> ファイルパス の対応も持っておき，起動時に照合する．
 */
export interface LeafFingerprint {
  path?: string;
  viewType: string;
}

export interface GroupsData {
  version: 1;
  groups: TabGroup[];
  fingerprints: Record<string, LeafFingerprint>;
  /**
   * 設定 (定義は settings.ts)．
   *
   * data.json の書き手を GroupStore 1 つに保つため，別ファイルにはせず
   * ここに同居させている．`saveData()` はファイルを丸ごと置き換えるので，
   * 書き手が 2 つあると後から書いた方が相手の内容を消す．
   * `version` / `groups` / `fingerprints` の形は変えていない．
   */
  settings: TabBandsSettings;
}

const DEFAULT_DATA: GroupsData = {
  version: 1,
  groups: [],
  fingerprints: {},
  settings: DEFAULT_SETTINGS,
};

export class GroupStore {
  private data: GroupsData = structuredClone(DEFAULT_DATA);
  /** leafId -> groupId の逆引きインデックス */
  private index = new Map<string, string>();

  constructor(private plugin: Plugin) {}

  async load(): Promise<void> {
    const raw = (await this.plugin.loadData()) as Partial<GroupsData> | null;
    this.data = { ...structuredClone(DEFAULT_DATA), ...(raw ?? {}) };
    // 展開しただけでは，設定を持たない過去の data.json や手で壊された値が
    // そのまま入る．設定だけは必ず正規化を通す．
    this.data.settings = normalizeSettings(raw?.settings);
    this.reindex();
  }

  async save(): Promise<void> {
    await this.plugin.saveData(this.data);
  }

  private reindex(): void {
    this.index.clear();
    for (const g of this.data.groups) {
      for (const leafId of g.leafIds) this.index.set(leafId, g.id);
    }
  }

  get groups(): readonly TabGroup[] {
    return this.data.groups;
  }

  get settings(): Readonly<TabBandsSettings> {
    return this.data.settings;
  }

  /** 変更ぶんだけを渡す．保存は呼び出し元が save() で行う */
  updateSettings(patch: Partial<TabBandsSettings>): void {
    this.data.settings = normalizeSettings({ ...this.data.settings, ...patch });
  }

  groupOf(leafId: string): TabGroup | undefined {
    const gid = this.index.get(leafId);
    return gid ? this.data.groups.find((g) => g.id === gid) : undefined;
  }

  byId(groupId: string): TabGroup | undefined {
    return this.data.groups.find((g) => g.id === groupId);
  }

  /**
   * 既定名は `Tab-1`, `Tab-2`, ... の連番．
   * 既存バンドの名前を見て**未使用の最小番号**を選ぶので，削除したバンドの
   * 番号は再利用される (`Tab-1`, `Tab-3` があれば次は `Tab-2`).
   *
   * 走査対象は `Tab-<正の整数>` に完全一致する名前だけ．`Tab-A` や `Tab-01`
   * のようなユーザが手で付けた名前は採番に影響させない.
   */
  private nextDefaultName(): string {
    const used = new Set<number>();
    for (const g of this.data.groups) {
      const m = /^Tab-([1-9]\d*)$/.exec(g.name.trim());
      if (m) used.add(Number(m[1]));
    }
    let n = 1;
    while (used.has(n)) n += 1;
    return `Tab-${n}`;
  }

  /** name を省略すると `Tab-N` の連番が入る．明示的に "" を渡せば無名になる */
  createGroup(name: string = this.nextDefaultName()): TabGroup {
    const used = new Set(this.data.groups.map((g) => g.color));
    const color = COLOR_ORDER.find((c) => !used.has(c)) ?? COLOR_ORDER[this.data.groups.length % COLOR_ORDER.length];
    const group: TabGroup = {
      id: `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      color,
      collapsed: false,
      leafIds: [],
    };
    this.data.groups.push(group);
    return group;
  }

  /** 1 つのリーフは高々 1 グループにしか属さない */
  assign(leaf: WorkspaceLeaf, groupId: string): void {
    this.unassign(leaf.id);
    const group = this.byId(groupId);
    if (!group) return;
    group.leafIds.push(leaf.id);
    this.index.set(leaf.id, groupId);
    this.rememberFingerprint(leaf);
  }

  unassign(leafId: string): void {
    const group = this.groupOf(leafId);
    if (!group) return;
    group.leafIds.remove(leafId);
    this.index.delete(leafId);
    if (group.leafIds.length === 0) this.deleteGroup(group.id);
  }

  deleteGroup(groupId: string): void {
    const group = this.byId(groupId);
    if (!group) return;
    for (const leafId of group.leafIds) this.index.delete(leafId);
    this.data.groups.remove(group);
  }

  /**
   * バンドのメンバーを新しい leafId 群で置き換える (ペイン移動時に使う).
   *
   * previousIds には leafIds と**同じ並び**で移動前の ID を渡す．同じ位置の
   * 旧 ID が持っていた fingerprint を新 ID へ引き継ぎ，使われなくなった旧
   * エントリを捨てる．引き継がないと，ペイン移動したバンドだけ起動時の
   * reconcile() でファイルパスから復元できなくなる．
   *
   * 省略時は現在の leafIds を移動前の ID と見なすが，store の並びは
   * タブの並びと一致する保証が無いので，呼び出し元は明示的に渡すこと．
   */
  remap(groupId: string, leafIds: string[], previousIds?: string[]): void {
    const group = this.byId(groupId);
    if (!group) return;
    this.remapFingerprints(previousIds ?? group.leafIds, leafIds);
    for (const id of group.leafIds) this.index.delete(id);
    group.leafIds = leafIds;
    for (const id of leafIds) this.index.set(id, groupId);
  }

  /**
   * 位置で対応づけて fingerprint を旧 ID から新 ID へ移す．
   * 対応する相手がいない余りは触らない (どのリーフに対応するか決められないため．
   * 残っても起動時の reconcile() が掃除する).
   */
  private remapFingerprints(previousIds: string[], leafIds: string[]): void {
    const kept = new Set(leafIds);
    const paired = Math.min(previousIds.length, leafIds.length);
    for (let i = 0; i < paired; i += 1) {
      const from = previousIds[i];
      const to = leafIds[i];
      if (from === to) continue; // 直接の付け替えでは ID が変わらない
      const fingerprint = this.data.fingerprints[from];
      if (fingerprint) this.data.fingerprints[to] = fingerprint;
      if (!kept.has(from)) delete this.data.fingerprints[from];
    }
  }

  rename(groupId: string, name: string): void {
    const g = this.byId(groupId);
    if (g) g.name = name;
  }

  recolor(groupId: string, color: GroupColor): void {
    const g = this.byId(groupId);
    if (g) g.color = color;
  }

  toggleCollapsed(groupId: string, value?: boolean): void {
    const g = this.byId(groupId);
    if (g) g.collapsed = value ?? !g.collapsed;
  }

  private rememberFingerprint(leaf: WorkspaceLeaf): void {
    const state = leaf.getViewState();
    this.data.fingerprints[leaf.id] = {
      viewType: state.type,
      path: (state.state?.file as string | undefined) ?? undefined,
    };
  }

  /**
   * 起動直後に呼ぶ．存在しない leafId を掃除し，
   * fingerprint が一致する現存リーフがあれば ID を貼り替える．
   */
  reconcile(liveLeaves: WorkspaceLeaf[]): void {
    const liveIds = new Set(liveLeaves.map((l) => l.id));
    const byPath = new Map<string, WorkspaceLeaf>();
    for (const leaf of liveLeaves) {
      const path = leaf.getViewState().state?.file as string | undefined;
      if (path && !byPath.has(path)) byPath.set(path, leaf);
    }

    for (const group of [...this.data.groups]) {
      const next: string[] = [];
      for (const oldId of group.leafIds) {
        if (liveIds.has(oldId)) {
          next.push(oldId);
          continue;
        }
        const fp = this.data.fingerprints[oldId];
        const revived = fp?.path ? byPath.get(fp.path) : undefined;
        if (revived && !next.includes(revived.id)) {
          next.push(revived.id);
          this.data.fingerprints[revived.id] = fp;
        }
        delete this.data.fingerprints[oldId];
      }
      group.leafIds = next;
      if (next.length === 0) this.data.groups.remove(group);
    }
    this.reindex();
  }
}
