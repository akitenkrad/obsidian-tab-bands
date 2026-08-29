import { describe, expect, it } from "vitest";
import { absorptions, bandToJoinAtDrop, escapeTarget, type TabSlot } from "../src/rules";

/**
 * タブ列を短い記法で組む．
 *   "a"      -> 無所属のタブ a
 *   "b:G"    -> バンド G のメンバー b
 *   "c:G!"   -> バンド G のメンバー c で，G は畳まれている
 */
function strip(...spec: string[]): TabSlot[] {
  return spec.map((s) => {
    const [leafId, band] = s.split(":");
    if (!band) return { leafId };
    const collapsed = band.endsWith("!");
    return { leafId, groupId: collapsed ? band.slice(0, -1) : band, collapsed };
  });
}

const absorb = (
  slots: TabSlot[],
  opts: { newIds?: string[]; active?: string[] } = {},
) =>
  absorptions(slots, {
    isNew: (id) => (opts.newIds ?? []).includes(id),
    wasRecentlyActive: (id) => (opts.active ?? []).includes(id),
  });

describe("absorptions — 吸収する場合", () => {
  it("メンバーに挟まれた位置に開かれた新規タブを吸収する", () => {
    const slots = strip("a:G", "new", "b:G");
    expect(absorb(slots, { newIds: ["new"] })).toEqual([{ leafId: "new", groupId: "G" }]);
  });

  it("バンド末尾のメンバーから開かれた新規タブを吸収する", () => {
    const slots = strip("a:G", "b:G", "new");
    expect(absorb(slots, { newIds: ["new"], active: ["b"] })).toEqual([
      { leafId: "new", groupId: "G" },
    ]);
  });

  it("右隣が別のバンドでも，末尾メンバーから開いたなら吸収する", () => {
    const slots = strip("a:G", "new", "b:H");
    expect(absorb(slots, { newIds: ["new"], active: ["a"] })).toEqual([
      { leafId: "new", groupId: "G" },
    ]);
  });

  it("吸収した結果が直後の判定に効く (n1 が入ることで n2 が挟まれ扱いになる)", () => {
    // a と b が同じバンド．その間に n1, n2 が新しく開かれた．
    // n1 は「a から開かれた」で入り，n2 は「n1 と b に挟まれた」で入る．
    const slots = strip("a:G", "n1", "n2", "b:G");
    expect(absorb(slots, { newIds: ["n1", "n2"], active: ["a"] })).toEqual([
      { leafId: "n1", groupId: "G" },
      { leafId: "n2", groupId: "G" },
    ]);
  });

  it("開き元がアクティブでなければ，2 枚目以降も入らない", () => {
    const slots = strip("a:G", "n1", "n2");
    expect(absorb(slots, { newIds: ["n1", "n2"], active: ["nobody"] })).toEqual([]);
  });
});

describe("absorptions — 吸収しない場合 (誤吸収の防止)", () => {
  it("バンドの右外に手で開いたタブは吸収しない (開き元がアクティブでない)", () => {
    const slots = strip("a:G", "b:G", "outsider");
    expect(absorb(slots, { newIds: ["outsider"], active: ["somewhere-else"] })).toEqual([]);
  });

  it("既存タブを動かしただけでは吸収しない", () => {
    const slots = strip("a:G", "moved", "b:G");
    // newIds に入っていない = 前回時点で存在していた
    expect(absorb(slots, { newIds: [], active: ["a"] })).toEqual([]);
  });

  it("バンドどうしの境界に開かれても吸収しない", () => {
    const slots = strip("a:G", "new", "b:H");
    expect(absorb(slots, { newIds: ["new"], active: ["nobody"] })).toEqual([]);
  });

  it("先頭に開かれたタブは吸収しない (左隣が無い)", () => {
    const slots = strip("new", "a:G", "b:G");
    expect(absorb(slots, { newIds: ["new"], active: ["a"] })).toEqual([]);
  });

  it("左隣が無所属なら吸収しない", () => {
    const slots = strip("plain", "new", "b:G");
    expect(absorb(slots, { newIds: ["new"], active: ["plain"] })).toEqual([]);
  });

  it("既にバンドに属しているタブは対象外", () => {
    const slots = strip("a:G", "b:H", "c:G");
    expect(absorb(slots, { newIds: ["b"], active: ["a"] })).toEqual([]);
  });

  it("バンドが 1 つも無ければ何も起きない", () => {
    expect(absorb(strip("a", "b", "c"), { newIds: ["b"], active: ["a"] })).toEqual([]);
  });
});

describe("bandToJoinAtDrop", () => {
  it("両隣が同じバンドなら参加する", () => {
    expect(bandToJoinAtDrop(strip("a:G", "moved", "b:G"), "moved")).toBe("G");
  });

  it("バンドの末尾の 1 つ右に落としても参加しない", () => {
    expect(bandToJoinAtDrop(strip("a:G", "b:G", "moved"), "moved")).toBeNull();
  });

  it("バンドの先頭の 1 つ左に落としても参加しない", () => {
    expect(bandToJoinAtDrop(strip("moved", "a:G", "b:G"), "moved")).toBeNull();
  });

  it("バンドどうしの境界では参加しない", () => {
    expect(bandToJoinAtDrop(strip("a:G", "moved", "b:H"), "moved")).toBeNull();
  });

  it("同じバンド内の並べ替えでは何も起きない", () => {
    expect(bandToJoinAtDrop(strip("a:G", "moved:G", "b:G"), "moved")).toBeNull();
  });

  it("畳んだバンドには入れない (その場で消えて見えるため)", () => {
    expect(bandToJoinAtDrop(strip("a:G!", "moved", "b:G!"), "moved")).toBeNull();
  });

  it("別のバンドから移ってきた場合は参加する", () => {
    expect(bandToJoinAtDrop(strip("a:G", "moved:H", "b:G"), "moved")).toBe("G");
  });

  it("並びに居ないリーフは null", () => {
    expect(bandToJoinAtDrop(strip("a:G", "b:G"), "nope")).toBeNull();
  });
});

describe("escapeTarget", () => {
  it("畳むバンドに属さない最初のタブへ逃がす", () => {
    expect(escapeTarget(strip("a:G", "b:G", "free"), "a", "G")).toBe("free");
  });

  it("無所属のタブも逃げ先になる", () => {
    expect(escapeTarget(strip("plain", "a:G"), "a", "G")).toBe("plain");
  });

  it("畳まれている別のバンドは逃げ先にしない", () => {
    expect(escapeTarget(strip("a:G", "h:H!"), "a", "G")).toBeNull();
  });

  it("畳まれていない別のバンドは逃げ先になる", () => {
    expect(escapeTarget(strip("a:G", "h:H"), "a", "G")).toBe("h");
  });

  it("ペイン内が畳むバンドだけなら逃げ先は無い", () => {
    expect(escapeTarget(strip("a:G", "b:G"), "a", "G")).toBeNull();
  });

  it("アクティブ自身は逃げ先にしない", () => {
    expect(escapeTarget(strip("a:G"), "a", "G")).toBeNull();
  });
});
