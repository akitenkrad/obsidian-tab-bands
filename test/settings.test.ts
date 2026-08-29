import { describe, expect, it } from "vitest";
import { CHIP_NAME_WIDTH, DEFAULT_SETTINGS, normalizeSettings } from "../src/settings";

describe("設定の正規化", () => {
  it("何も無ければ既定値", () => {
    expect(normalizeSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normalizeSettings({})).toEqual(DEFAULT_SETTINGS);
  });

  it("正しい値はそのまま通す", () => {
    expect(normalizeSettings({ chipNameMaxWidth: 20, absorbNewTabs: false })).toEqual({
      chipNameMaxWidth: 20,
      absorbNewTabs: false,
    });
  });

  it("幅は可動域に丸める", () => {
    expect(normalizeSettings({ chipNameMaxWidth: 0 }).chipNameMaxWidth).toBe(CHIP_NAME_WIDTH.min);
    expect(normalizeSettings({ chipNameMaxWidth: -5 }).chipNameMaxWidth).toBe(CHIP_NAME_WIDTH.min);
    expect(normalizeSettings({ chipNameMaxWidth: 999 }).chipNameMaxWidth).toBe(CHIP_NAME_WIDTH.max);
  });

  it("幅は整数にする (CSS の ch は小数でも効くが，スライダーの値と食い違わせない)", () => {
    expect(normalizeSettings({ chipNameMaxWidth: 12.4 }).chipNameMaxWidth).toBe(12);
    expect(normalizeSettings({ chipNameMaxWidth: 12.6 }).chipNameMaxWidth).toBe(13);
  });

  it("型の違う値は既定値に落とす", () => {
    expect(normalizeSettings({ chipNameMaxWidth: "12" }).chipNameMaxWidth).toBe(
      DEFAULT_SETTINGS.chipNameMaxWidth,
    );
    expect(normalizeSettings({ chipNameMaxWidth: NaN }).chipNameMaxWidth).toBe(
      DEFAULT_SETTINGS.chipNameMaxWidth,
    );
    expect(normalizeSettings({ absorbNewTabs: 1 }).absorbNewTabs).toBe(
      DEFAULT_SETTINGS.absorbNewTabs,
    );
  });

  it("知らないキーは捨てる", () => {
    expect(normalizeSettings({ absorbNewTabs: false, futureOption: 3 })).toEqual({
      ...DEFAULT_SETTINGS,
      absorbNewTabs: false,
    });
  });

  it("既定値は可動域の中にある", () => {
    expect(DEFAULT_SETTINGS.chipNameMaxWidth).toBeGreaterThanOrEqual(CHIP_NAME_WIDTH.min);
    expect(DEFAULT_SETTINGS.chipNameMaxWidth).toBeLessThanOrEqual(CHIP_NAME_WIDTH.max);
  });
});
