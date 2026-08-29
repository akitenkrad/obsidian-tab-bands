import { describe, expect, it } from "vitest";
import type { App } from "obsidian";
import { allTabLeaves, leafById, tabGroups } from "../src/workspace-tree";
import { WorkspaceLeaf } from "./obsidian-stub";

/**
 * ワークスペースの木のフェイク．
 * 走査側が見るのは «children を持つか» と «WorkspaceLeaf の実体か» だけなので，
 * 分割ノードはただの { children } でよい．
 */
function split(...children: unknown[]) {
  return { children };
}

function fakeApp(rootSplit: unknown, floatingSplit?: unknown): App {
  return { workspace: { rootSplit, floatingSplit } } as unknown as App;
}

const leaf = (id: string) => new WorkspaceLeaf(id);

describe("tabGroups", () => {
  it("子がすべてリーフのノードを 1 つのタブグループとして返す", () => {
    const a = leaf("a");
    const b = leaf("b");
    const tabs = split(a, b);

    const groups = tabGroups(fakeApp(tabs));

    expect(groups.size).toBe(1);
    expect([...groups.values()][0]).toEqual([a, b]);
  });

  it("タブの並び順を保つ", () => {
    const [a, b, c] = [leaf("a"), leaf("b"), leaf("c")];

    const groups = tabGroups(fakeApp(split(a, b, c)));

    expect([...groups.values()][0].map((l) => l.id)).toEqual(["a", "b", "c"]);
  });

  it("入れ子の分割を辿って複数のタブグループを見つける", () => {
    const left = split(leaf("l1"), leaf("l2"));
    const right = split(leaf("r1"));

    const groups = tabGroups(fakeApp(split(left, right)));

    expect(groups.size).toBe(2);
    expect(groups.get(left as never)?.map((l) => l.id)).toEqual(["l1", "l2"]);
    expect(groups.get(right as never)?.map((l) => l.id)).toEqual(["r1"]);
  });

  it("ポップアウト (floatingSplit) も走査する", () => {
    const main = split(leaf("m1"));
    const popout = split(leaf("p1"));

    const groups = tabGroups(fakeApp(main, split(popout)));

    expect(groups.size).toBe(2);
    expect(groups.get(popout as never)?.map((l) => l.id)).toEqual(["p1"]);
  });

  it("ポップアウトが 1 つも無くても落ちない", () => {
    expect(tabGroups(fakeApp(split(leaf("m1")), undefined)).size).toBe(1);
  });

  it("リーフを 1 つも持たないノードは返さない", () => {
    const groups = tabGroups(fakeApp(split(split(), split())));
    expect(groups.size).toBe(0);
  });
});

describe("allTabLeaves", () => {
  it("すべてのタブグループのリーフをタブ順に平坦化する", () => {
    const app = fakeApp(
      split(split(leaf("l1"), leaf("l2")), split(leaf("r1"))),
      split(split(leaf("p1"))),
    );

    expect(allTabLeaves(app).map((l) => l.id)).toEqual(["l1", "l2", "r1", "p1"]);
  });
});

describe("leafById", () => {
  it("ポップアウト側のリーフも引ける", () => {
    const app = fakeApp(split(leaf("m1")), split(split(leaf("p1"))));

    expect(leafById(app, "p1")?.id).toBe("p1");
  });

  it("見つからなければ undefined", () => {
    expect(leafById(fakeApp(split(leaf("m1"))), "nope")).toBeUndefined();
  });
});
