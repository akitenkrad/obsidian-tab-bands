import { afterEach, describe, expect, it } from "vitest";
import { t } from "../src/i18n";
import { moment } from "./obsidian-stub";

afterEach(() => moment.locale("en"));

describe("表示言語の選択", () => {
  it("既定は英語", () => {
    expect(t("cmdCollapseAll")).toBe("Collapse all bands");
  });

  it("日本語の Obsidian では日本語を返す", () => {
    moment.locale("ja");
    expect(t("cmdCollapseAll")).toBe("すべてのバンドを折りたたむ");
  });

  it("地域つきの ja-JP でも日本語を返す", () => {
    moment.locale("ja-JP");
    expect(t("chipMenuRename")).toBe("バンド名を変更");
  });

  it("辞書を持たない言語は英語に落ちる", () => {
    moment.locale("fr");
    expect(t("chipMenuRename")).toBe("Rename band");
  });
});

describe("差し込み", () => {
  it("{name} を置き換える", () => {
    expect(t("tabMenuAddToBand", { name: "Docs" })).toBe('Add to band "Docs"');
    moment.locale("ja");
    expect(t("tabMenuAddToBand", { name: "資料" })).toBe("バンド「資料」に追加");
  });

  it("複数の差し込みを扱う", () => {
    expect(t("paneLabel", { n: 2, title: "notes.md" })).toBe("Pane 2 (notes.md)");
  });

  it("値を渡さなかったプレースホルダはそのまま残す (取り違えに気付けるように)", () => {
    expect(t("paneLabel", { n: 2 })).toBe("Pane 2 ({title})");
  });

  it("params を渡さなければ置換しない", () => {
    expect(t("chipMenuMoveTo")).toBe("Move to {target}");
  });
});

describe("辞書の網羅", () => {
  it("英語で引ける文言はすべて日本語でも空でない", () => {
    // 型 (Record<Key, string>) で漏れは防いでいるが，空文字は防げない
    moment.locale("ja");
    const keys = ["cmdNewBand", "chipMenuUngroup", "renameSave", "diagOrderMismatch"] as const;
    for (const key of keys) expect(t(key).length).toBeGreaterThan(0);
  });

  it("診断メッセージには報告先の URL が入っている", () => {
    for (const locale of ["en", "ja"]) {
      moment.locale(locale);
      expect(t("diagOrderMismatch")).toContain(
        "https://github.com/akitenkrad/obsidian-tab-bands/issues",
      );
    }
  });
});
