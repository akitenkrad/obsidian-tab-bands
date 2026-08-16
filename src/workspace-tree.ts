import { App, WorkspaceLeaf, WorkspaceParent } from "obsidian";

/**
 * ワークスペースの木を children で再帰的に辿り，タブグループ単位でリーフを集める．
 *
 * 【なぜ iterate*Leaves() を使わないか】
 * Obsidian 1.7 の遅延読み込み (deferred leaf) 導入以降，
 * workspace.iterateRootLeaves() / iterateAllLeaves() は **実体化済みのリーフしか
 * 列挙しない**．実測では木に 15 リーフある状態で 2 しか返らなかった．
 * 一方 WorkspaceParent.children には deferred なリーフも並んでおり，
 * それらも tabHeaderEl を持っている．よって children を唯一の列挙元とする．
 */
export function tabGroups(app: App): Map<WorkspaceParent, WorkspaceLeaf[]> {
  const result = new Map<WorkspaceParent, WorkspaceLeaf[]>();

  const walk = (item: unknown): void => {
    const node = item as WorkspaceParent & { children?: unknown[] };
    const children = node?.children;
    if (!Array.isArray(children)) return;

    // 子がすべてリーフなら，このノードが WorkspaceTabs (タブグループ)
    const leaves = children.filter((c) => isLeaf(c)) as WorkspaceLeaf[];
    if (leaves.length === children.length && leaves.length > 0) {
      result.set(node, leaves);
      return;
    }
    for (const child of children) walk(child);
  };

  walk(app.workspace.rootSplit);
  return result;
}

/** children を持たず tabHeaderEl を持つものをリーフと見なす */
function isLeaf(item: unknown): boolean {
  const node = item as { children?: unknown; tabHeaderEl?: unknown };
  return !Array.isArray(node?.children) && !!node?.tabHeaderEl;
}

/** ルート配下の全リーフをタブ順に平坦化して返す */
export function allRootLeaves(app: App): WorkspaceLeaf[] {
  const out: WorkspaceLeaf[] = [];
  for (const [, leaves] of tabGroups(app)) out.push(...leaves);
  return out;
}

/** ID からリーフを引く (deferred なリーフも対象) */
export function leafById(app: App, leafId: string): WorkspaceLeaf | undefined {
  return allRootLeaves(app).find((leaf) => leaf.id === leafId);
}
