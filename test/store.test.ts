import { describe, expect, it } from "vitest";
import type { Plugin, WorkspaceLeaf as ObsidianLeaf } from "obsidian";
import { COLOR_ORDER, GroupStore, groupLabel, type GroupsData } from "../src/store";
import { CHIP_NAME_WIDTH, DEFAULT_SETTINGS } from "../src/settings";
import { moment, WorkspaceLeaf } from "./obsidian-stub";

/** loadData / saveData だけを持つ最小のプラグイン代役 */
function fakePlugin(initial: unknown = null) {
  const state = { saved: undefined as GroupsData | undefined };
  const plugin = {
    loadData: async () => initial,
    saveData: async (data: GroupsData) => {
      state.saved = structuredClone(data);
    },
  } as unknown as Plugin;
  return { plugin, state };
}

function leaf(id: string, file?: string, type = "markdown"): ObsidianLeaf {
  return new WorkspaceLeaf(id, { type, state: file ? { file } : undefined }) as unknown as ObsidianLeaf;
}

async function newStore(initial: unknown = null) {
  const { plugin, state } = fakePlugin(initial);
  const store = new GroupStore(plugin);
  await store.load();
  return { store, state };
}

/** 保存された JSON を覗く (fingerprints は private なのでこの経路でしか見えない) */
async function snapshot(store: GroupStore, state: { saved?: GroupsData }) {
  await store.save();
  return state.saved!;
}

describe("既定名の採番", () => {
  it("最初のバンドは Tab-1", async () => {
    const { store } = await newStore();
    expect(store.createGroup().name).toBe("Tab-1");
  });

  it("連番で増える", async () => {
    const { store } = await newStore();
    store.createGroup();
    store.createGroup();
    expect(store.createGroup().name).toBe("Tab-3");
  });

  it("空いた番号を再利用する (Tab-1 と Tab-3 があれば次は Tab-2)", async () => {
    const { store } = await newStore();
    const a = store.createGroup(); // Tab-1
    store.createGroup(); // Tab-2
    const c = store.createGroup(); // Tab-3
    expect(c.name).toBe("Tab-3");

    // Tab-2 を消す (メンバーが居ないと unassign 経由では消せないので直接)
    store.deleteGroup(store.groups.find((g) => g.name === "Tab-2")!.id);
    expect(store.createGroup().name).toBe("Tab-2");
    expect(a.name).toBe("Tab-1");
  });

  it("Tab-<数字> に完全一致しない名前は採番に影響しない", async () => {
    const { store } = await newStore();
    store.createGroup("Tab-A");
    store.createGroup("Tab-01"); // 先頭 0 は対象外
    store.createGroup("Tab-1 の続き");
    expect(store.createGroup().name).toBe("Tab-1");
  });

  it("空文字を明示すれば無名バンドになる", async () => {
    const { store } = await newStore();
    const g = store.createGroup("");
    expect(g.name).toBe("");
    expect(groupLabel(g)).toBe("Band"); // 既定は英語
    moment.locale("ja");
    expect(groupLabel(g)).toBe("バンド");
    moment.locale("en");
  });
});

describe("色の割り当て", () => {
  it("未使用の色を定義順に配る", async () => {
    const { store } = await newStore();
    expect([store.createGroup().color, store.createGroup().color]).toEqual([
      COLOR_ORDER[0],
      COLOR_ORDER[1],
    ]);
  });

  it("消した色は再利用される", async () => {
    const { store } = await newStore();
    const first = store.createGroup();
    store.createGroup();
    store.deleteGroup(first.id);
    expect(store.createGroup().color).toBe(COLOR_ORDER[0]);
  });

  it("色を使い切ったら先頭へ戻る", async () => {
    const { store } = await newStore();
    for (let i = 0; i < COLOR_ORDER.length; i += 1) store.createGroup();
    expect(store.createGroup().color).toBe(COLOR_ORDER[0]);
  });
});

describe("assign / unassign", () => {
  it("1 つのリーフは高々 1 バンドにしか属さない", async () => {
    const { store } = await newStore();
    const a = store.createGroup();
    const b = store.createGroup();
    const l = leaf("L1");

    store.assign(l, a.id);
    store.assign(l, b.id);

    expect(store.groupOf("L1")?.id).toBe(b.id);
    expect(a.leafIds).not.toContain("L1");
    expect(b.leafIds).toEqual(["L1"]);
  });

  it("最後のメンバーを外すとバンドごと消える", async () => {
    const { store } = await newStore();
    const g = store.createGroup();
    store.assign(leaf("L1"), g.id);

    store.unassign("L1");

    expect(store.byId(g.id)).toBeUndefined();
    expect(store.groups).toHaveLength(0);
  });

  it("assign したリーフの fingerprint を覚える", async () => {
    const { store, state } = await newStore();
    const g = store.createGroup();
    store.assign(leaf("L1", "notes/a.md"), g.id);

    const saved = await snapshot(store, state);
    expect(saved.fingerprints.L1).toEqual({ viewType: "markdown", path: "notes/a.md" });
  });

  it("ファイルを持たないビューでも viewType は残る", async () => {
    const { store, state } = await newStore();
    const g = store.createGroup();
    store.assign(leaf("L1", undefined, "graph"), g.id);

    const saved = await snapshot(store, state);
    expect(saved.fingerprints.L1).toEqual({ viewType: "graph", path: undefined });
  });
});

describe("remap (ペイン移動での ID 貼り替え)", () => {
  it("位置を対応させて fingerprint を引き継ぐ", async () => {
    const { store, state } = await newStore();
    const g = store.createGroup();
    store.assign(leaf("old1", "a.md"), g.id);
    store.assign(leaf("old2", "b.md"), g.id);

    store.remap(g.id, ["new1", "new2"], ["old1", "old2"]);

    const saved = await snapshot(store, state);
    expect(saved.fingerprints.new1).toEqual({ viewType: "markdown", path: "a.md" });
    expect(saved.fingerprints.new2).toEqual({ viewType: "markdown", path: "b.md" });
    expect(saved.fingerprints.old1).toBeUndefined();
    expect(saved.fingerprints.old2).toBeUndefined();
    expect(store.groupOf("new1")?.id).toBe(g.id);
    expect(store.groupOf("old1")).toBeUndefined();
  });

  it("ID が変わらなかったぶんは fingerprint を落とさない", async () => {
    const { store, state } = await newStore();
    const g = store.createGroup();
    store.assign(leaf("keep", "a.md"), g.id);

    store.remap(g.id, ["keep"], ["keep"]);

    const saved = await snapshot(store, state);
    expect(saved.fingerprints.keep).toEqual({ viewType: "markdown", path: "a.md" });
  });

  it("対応する相手がいない余りには触らない", async () => {
    const { store, state } = await newStore();
    const g = store.createGroup();
    store.assign(leaf("old1", "a.md"), g.id);
    store.assign(leaf("old2", "b.md"), g.id);

    // 2 枚が 1 枚になった (作り直しに失敗した等)
    store.remap(g.id, ["new1"], ["old1", "old2"]);

    const saved = await snapshot(store, state);
    expect(saved.fingerprints.new1).toEqual({ viewType: "markdown", path: "a.md" });
    // old2 は対応先を決められないので残る (reconcile が掃除する)
    expect(saved.fingerprints.old2).toEqual({ viewType: "markdown", path: "b.md" });
  });
});

describe("reconcile (起動時の照合)", () => {
  it("生きている leafId はそのまま残す", async () => {
    const { store } = await newStore();
    const g = store.createGroup();
    store.assign(leaf("L1", "a.md"), g.id);

    store.reconcile([leaf("L1", "a.md")]);

    expect(store.byId(g.id)?.leafIds).toEqual(["L1"]);
  });

  it("leafId が変わってもファイルパスで復元する", async () => {
    const { store } = await newStore();
    const g = store.createGroup();
    store.assign(leaf("old", "a.md"), g.id);

    store.reconcile([leaf("fresh", "a.md")]);

    expect(store.byId(g.id)?.leafIds).toEqual(["fresh"]);
    expect(store.groupOf("fresh")?.id).toBe(g.id);
  });

  it("復元できないメンバーは落とし，空になったバンドは消す", async () => {
    const { store } = await newStore();
    const g = store.createGroup();
    store.assign(leaf("gone", "deleted.md"), g.id);

    store.reconcile([leaf("other", "b.md")]);

    expect(store.groups).toHaveLength(0);
  });

  it("同じパスのリーフが複数あっても 1 つにしか復元しない", async () => {
    const { store } = await newStore();
    const g = store.createGroup();
    store.assign(leaf("o1", "same.md"), g.id);
    store.assign(leaf("o2", "same.md"), g.id);

    store.reconcile([leaf("live", "same.md")]);

    expect(store.byId(g.id)?.leafIds).toEqual(["live"]);
  });

  it("使われなくなった fingerprint を掃除する", async () => {
    const { store, state } = await newStore();
    const g = store.createGroup();
    store.assign(leaf("gone", "x.md"), g.id);
    store.assign(leaf("live", "y.md"), g.id);

    store.reconcile([leaf("live", "y.md")]);

    const saved = await snapshot(store, state);
    expect(saved.fingerprints.gone).toBeUndefined();
    expect(saved.fingerprints.live).toBeDefined();
  });
});

describe("load", () => {
  it("保存済みデータから逆引きを張り直す", async () => {
    // 設定を持たない (= 0.3.0 以前が書いた) data.json を想定する
    const stored: Omit<GroupsData, "settings"> = {
      version: 1,
      groups: [{ id: "g1", name: "Docs", color: "blue", collapsed: true, leafIds: ["L1", "L2"] }],
      fingerprints: { L1: { viewType: "markdown", path: "a.md" } },
    };
    const { store } = await newStore(stored);

    expect(store.groupOf("L2")?.name).toBe("Docs");
    expect(store.byId("g1")?.collapsed).toBe(true);
  });

  it("空の data.json でも既定値で立ち上がる", async () => {
    const { store } = await newStore(null);
    expect(store.groups).toEqual([]);
  });
});

describe("設定の永続化", () => {
  it("設定を持たない data.json は既定値で埋める", async () => {
    const { store } = await newStore({ version: 1, groups: [], fingerprints: {} });
    expect(store.settings).toEqual(DEFAULT_SETTINGS);
  });

  it("保存済みの設定を読む", async () => {
    const { store } = await newStore({
      version: 1,
      groups: [],
      fingerprints: {},
      settings: { chipNameMaxWidth: 20, absorbNewTabs: false },
    });
    expect(store.settings.chipNameMaxWidth).toBe(20);
    expect(store.settings.absorbNewTabs).toBe(false);
  });

  it("壊れた値は読み込み時に正規化する", async () => {
    const { store } = await newStore({
      version: 1,
      groups: [],
      fingerprints: {},
      settings: { chipNameMaxWidth: 999, absorbNewTabs: "yes" },
    });
    expect(store.settings.chipNameMaxWidth).toBe(CHIP_NAME_WIDTH.max);
    expect(store.settings.absorbNewTabs).toBe(DEFAULT_SETTINGS.absorbNewTabs);
  });

  it("更新は差分だけを渡せる", async () => {
    const { store, state } = await newStore();
    store.updateSettings({ absorbNewTabs: false });
    const saved = await snapshot(store, state);
    expect(saved.settings).toEqual({ ...DEFAULT_SETTINGS, absorbNewTabs: false });
  });

  it("設定を保存してもバンドの形は変わらない", async () => {
    const { store, state } = await newStore();
    const g = store.createGroup("Docs");
    store.assign(leaf("L1", "a.md"), g.id);
    store.updateSettings({ chipNameMaxWidth: 8 });

    const saved = await snapshot(store, state);
    expect(saved.version).toBe(1);
    expect(saved.groups).toHaveLength(1);
    expect(saved.groups[0].leafIds).toEqual(["L1"]);
    expect(saved.fingerprints.L1).toEqual({ viewType: "markdown", path: "a.md" });
  });
});
