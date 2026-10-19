/**
 * バンドのプリセット色．
 *
 * 既存色の並びは新規バンドの自動配色にも使うため変更しない．
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
  indigo: "#3f51b5",
  sky: "#039be5",
  teal: "#00897b",
  lime: "#7cb342",
  olive: "#827717",
  brown: "#8d6e63",
  coral: "#f4511e",
  maroon: "#8e2430",
  slate: "#546e7a",
} as const;

export type GroupColor = keyof typeof GROUP_COLORS;
export type CustomColor = `#${string}`;
export type TabGroupColor = GroupColor | CustomColor;

export const COLOR_ORDER = Object.keys(GROUP_COLORS) as GroupColor[];

const HEX_6 = /^#[0-9a-f]{6}$/;
const HEX_6_CASE_INSENSITIVE = /^#[0-9a-f]{6}$/i;

export function isPresetColor(value: unknown): value is GroupColor {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(GROUP_COLORS, value);
}

export function isValidGroupColor(value: unknown): value is TabGroupColor {
  return isPresetColor(value) || (typeof value === "string" && HEX_6.test(value));
}

/** data.json に保存された色だけを検証する．UI 入力の省略形は受け付けない． */
export function normalizeStoredGroupColor(value: unknown): TabGroupColor | null {
  if (isValidGroupColor(value)) return value;
  if (typeof value === "string" && HEX_6_CASE_INSENSITIVE.test(value)) {
    return value.toLowerCase() as CustomColor;
  }
  return null;
}

function rgbToHex(parts: string[]): string | null {
  const values = parts.map(Number);
  if (values.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) return null;
  return `#${values.map((value) => value.toString(16).padStart(2, "0")).join("")}`;
}

/** UI で入力された色を小文字の #rrggbb へ正規化する． */
export function parseColorInput(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  const shortHex = /^#([0-9a-f]{3})$/i.exec(value);
  if (shortHex) {
    return `#${[...shortHex[1]].map((digit) => `${digit}${digit}`).join("")}`.toLowerCase();
  }

  const longHex = /^#?([0-9a-f]{6})$/i.exec(value);
  if (longHex) return `#${longHex[1].toLowerCase()}`;

  const rgbFunction = /^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i.exec(value);
  if (rgbFunction) return rgbToHex(rgbFunction.slice(1));

  const commaSeparated = /^(\d+)\s*,\s*(\d+)\s*,\s*(\d+)$/.exec(value);
  if (commaSeparated) return rgbToHex(commaSeparated.slice(1));

  const spaceSeparated = /^(\d+)\s+(\d+)\s+(\d+)$/.exec(value);
  if (spaceSeparated) return rgbToHex(spaceSeparated.slice(1));

  return null;
}

/** 描画に使える hex を返す．不正値は grey にフォールバックする． */
export function resolveColor(color: string): string {
  if (isPresetColor(color)) return GROUP_COLORS[color];
  return HEX_6.test(color) ? color : GROUP_COLORS.grey;
}
