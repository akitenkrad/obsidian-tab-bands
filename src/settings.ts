/**
 * 設定値の定義・既定値・正規化．
 *
 * ここには Obsidian の API も DOM も持ち込まない (rules.ts と同じ方針)．
 * 設定画面そのものは settings-tab.ts，永続化は store.ts が持つ．
 *
 * 【出す項目を絞っている理由】
 * 既定色 (未使用色の自動割り当て) と折りたたみ時の書式 (「バンド名 (N)」) は
 * 出していない．前者は «自動割り当てか固定色か» の二択を設定に持ち込むことに
 * なり，後者は書式文字列としてプレースホルダの検証とエスケープが要る．
 * どちらも実害が観測されていないので，出さない側に倒している．
 */

export interface TabBandsSettings {
  /**
   * チップに出すバンド名の最大幅 (ch)．
   * テーマによってはタブ幅が窮屈になるので，利用者が詰められるようにする．
   */
  chipNameMaxWidth: number;
  /**
   * 新しく開かれたタブをバンドへ自動で吸収するか (rules.ts の absorptions)．
   * 挟まれ吸収と «メンバーから開かれたタブ» の吸収をまとめて 1 つで切る．
   */
  absorbNewTabs: boolean;
}

export const DEFAULT_SETTINGS: TabBandsSettings = {
  chipNameMaxWidth: 12,
  absorbNewTabs: true,
};

/**
 * チップ名の幅の可動域．
 * 下限は色ドット + 数文字が読める幅，上限はタブ 1 枚の幅を超えない程度．
 * 既定値 (DEFAULT_SETTINGS) と styles.css の var() のフォールバックは
 * 同じ値にしておくこと．
 */
export const CHIP_NAME_WIDTH = { min: 4, max: 32, step: 1 } as const;

/**
 * 保存されていた値を設定として使える形に均す．
 *
 * data.json は利用者が手で編集できるうえ，過去バージョンが書いた形も来る．
 * 型の合わない値・範囲外の値は既定値と可動域に丸め，**知らないキーは捨てる**
 * (将来の版が足したキーを古い版が持ち回っても意味が無いため)．
 */
export function normalizeSettings(raw: unknown): TabBandsSettings {
  const partial = (raw ?? {}) as Partial<Record<keyof TabBandsSettings, unknown>>;
  return {
    chipNameMaxWidth: clampWidth(partial.chipNameMaxWidth),
    absorbNewTabs:
      typeof partial.absorbNewTabs === "boolean"
        ? partial.absorbNewTabs
        : DEFAULT_SETTINGS.absorbNewTabs,
  };
}

function clampWidth(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return DEFAULT_SETTINGS.chipNameMaxWidth;
  const rounded = Math.round(value);
  return Math.min(CHIP_NAME_WIDTH.max, Math.max(CHIP_NAME_WIDTH.min, rounded));
}
