import type { Plugin, WorkspaceLeaf } from "obsidian";

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
}

const DEFAULT_DATA: GroupsData = { version: 1, groups: [], fingerprints: {} };

export class GroupStore {
  private data: GroupsData = structuredClone(DEFAULT_DATA);
  /** leafId -> groupId の逆引きインデックス */
  private index = new Map<string, string>();

  constructor(private plugin: Plugin) {}

  async load(): Promise<void> {
    const raw = (await this.plugin.loadData()) as Partial<GroupsData> | null;
    this.data = { ...structuredClone(DEFAULT_DATA), ...(raw ?? {}) };
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

  groupOf(leafId: string): TabGroup | undefined {
    const gid = this.index.get(leafId);
    return gid ? this.data.groups.find((g) => g.id === gid) : undefined;
  }

  byId(groupId: string): TabGroup | undefined {
    return this.data.groups.find((g) => g.id === groupId);
  }

  createGroup(name = "New group"): TabGroup {
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

  /** バンドのメンバーを新しい leafId 群で置き換える (ペイン移動時に使う) */
  remap(groupId: string, leafIds: string[]): void {
    const group = this.byId(groupId);
    if (!group) return;
    for (const id of group.leafIds) this.index.delete(id);
    group.leafIds = leafIds;
    for (const id of leafIds) this.index.set(id, groupId);
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
