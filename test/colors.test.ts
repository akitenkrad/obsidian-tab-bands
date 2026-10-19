import { describe, expect, it } from "vitest";
import {
  COLOR_ORDER,
  GROUP_COLORS,
  isValidGroupColor,
  parseColorInput,
  resolveColor,
} from "../src/colors";

describe("parseColorInput", () => {
  it.each([
    ["#1a73e8", "#1a73e8"],
    ["#1A73E8", "#1a73e8"],
    ["  #1a73e8  ", "#1a73e8"],
    ["#abc", "#aabbcc"],
    ["#ABC", "#aabbcc"],
    ["1a73e8", "#1a73e8"],
    ["1A73E8", "#1a73e8"],
    ["rgb(26, 115, 232)", "#1a73e8"],
    ["RGB( 26 , 115 , 232 )", "#1a73e8"],
    ["rgb ( 0, 255, 16 )", "#00ff10"],
    ["26,115,232", "#1a73e8"],
    [" 26 , 115 , 232 ", "#1a73e8"],
    ["26 115 232", "#1a73e8"],
    ["26\t115\n232", "#1a73e8"],
  ])("%j を正規化する", (input, expected) => {
    expect(parseColorInput(input)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "#12",
    "#abcd",
    "#gggggg",
    "12345",
    "rgb(256,0,0)",
    "rgb(-1,0,0)",
    "rgb(1.5,2,3)",
    "rgb(1,2)",
    "rgb(1,2,3,4)",
    "1.5,2,3",
    "256,0,0",
    "1,2",
    "1,2,3,4",
    "1, 2 3",
    "red",
  ])("%j を拒否する", (input) => {
    expect(parseColorInput(input)).toBeNull();
  });
});

describe("resolveColor", () => {
  it("プリセットキーを hex に解決する", () => {
    expect(resolveColor("blue")).toBe(GROUP_COLORS.blue);
  });

  it("正規の任意色はそのまま返す", () => {
    expect(resolveColor("#1a73e8")).toBe("#1a73e8");
  });

  it.each(["unknown", "#1A73E8", "#abc", ""])("不正値 %j は grey に戻す", (input) => {
    expect(resolveColor(input)).toBe(GROUP_COLORS.grey);
  });
});

describe("isValidGroupColor", () => {
  it("既存 9 色の後ろに追加 9 色を定義順で並べる", () => {
    expect(COLOR_ORDER).toEqual([
      "grey",
      "blue",
      "red",
      "yellow",
      "green",
      "pink",
      "purple",
      "cyan",
      "orange",
      "indigo",
      "sky",
      "teal",
      "lime",
      "olive",
      "brown",
      "coral",
      "maroon",
      "slate",
    ]);
    expect(GROUP_COLORS).toEqual({
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
    });
  });

  it("全プリセットを受け付ける", () => {
    expect(COLOR_ORDER).toHaveLength(18);
    expect(COLOR_ORDER.every(isValidGroupColor)).toBe(true);
  });

  it("小文字の #rrggbb を受け付ける", () => {
    expect(isValidGroupColor("#1a73e8")).toBe(true);
  });

  it.each(["#1A73E8", "#abc", "unknown", "", null, undefined, 123])("不正値 %j を拒否する", (input) => {
    expect(isValidGroupColor(input)).toBe(false);
  });
});
