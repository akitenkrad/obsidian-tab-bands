import { App, WorkspaceLeaf, WorkspaceParent } from "obsidian";

/**
 * ワークスペースの木を children で再帰的に辿り，タブグループ単位でリーフを集める．
 * ルート (rootSplit) とポップアウトウィンドウ (floatingSplit) の両方を見る．
 *
 * 【なぜ iterate*Leaves() を使わないか】
 * Obsidian 1.7 の遅延読み込み (deferred leaf) 導入以降，
 * workspace.iterateRootLeaves() / iterateAllLeaves() は **実体化済みのリーフしか
 * 列挙しない**．一方 WorkspaceParent.children には deferred なリーフも並んでいるので，
 * children を唯一の列挙元とする．
 *
 * 【再測定 2026-08-29 / Obsidian 1.10.3】依然として真．
 *   iterateRootLeaves: 2, children: 12, deferred: 10
 * 返った 2 件は非 deferred なリーフの数 (12 - 10) と完全に一致した．
 * 公開 API に寄せられるのは «順序も deferred も要らない» 場面だけだが，
 * 本プラグインにそういう場面は無い (初回測定は 1.7 系で 15 中 2)．
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
  // ポップアウトは別 document になるが，リーフの辿り方は同じ．
  // ストリップは必ず leaf.tabHeaderEl.parentElement から引くこと
  // (document.querySelector では別ウィンドウのストリップを掴めない).
  walk(app.workspace.floatingSplit);
  return result;
}

/**
 * リーフかどうかの判定．WorkspaceLeaf は公開クラスなので instanceof で足りる．
 * (以前は tabHeaderEl の有無で見ていたが，非公式 API を型判別子に使う必要はない)
 */
function isLeaf(item: unknown): boolean {
  return item instanceof WorkspaceLeaf;
}

/** タブストリップに並ぶ全リーフをタブ順に平坦化して返す (ポップアウトも含む) */
export function allTabLeaves(app: App): WorkspaceLeaf[] {
  const out: WorkspaceLeaf[] = [];
  for (const [, leaves] of tabGroups(app)) out.push(...leaves);
  return out;
}

/** ID からリーフを引く (deferred なリーフも対象) */
export function leafById(app: App, leafId: string): WorkspaceLeaf | undefined {
  return allTabLeaves(app).find((leaf) => leaf.id === leafId);
}
