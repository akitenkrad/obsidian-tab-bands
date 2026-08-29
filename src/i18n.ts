import { moment } from "obsidian";

/**
 * UI 文言の辞書．
 *
 * 既定は英語で，Obsidian の表示言語が日本語のときだけ日本語を出す．
 * Obsidian 本体に翻訳の仕組みは無いので，プラグイン側で辞書を持つ
 * (コミュニティプラグインの通例).
 *
 * 【文言を足すときの決まり】
 *  - EN に足すと JA が型エラーになる (Record<Key, string> で網羅を強制している).
 *    2 言語ぶん書くこと．
 *  - 英語は sentence case．先頭だけ大文字にして，各単語を大文字にしない
 *    (Obsidian のプラグインガイドライン).
 *  - 差し込みは {name} の形．t() の第 2 引数で渡す．
 */
const EN = {
  // コマンドパレット
  cmdNewBand: "Organize active tab into a new band",
  cmdRemoveFromBand: "Remove active tab from its band",
  cmdToggleBand: "Collapse or expand the active tab's band",
  cmdCollapseAll: "Collapse all bands",

  // タブの右クリックメニュー
  tabMenuNewBand: "Organize into a new band",
  tabMenuAddToBand: 'Add to band "{name}"',
  tabMenuRemoveFromBand: "Remove from band",

  // チップの右クリックメニュー
  chipMenuExpand: "Expand band",
  chipMenuCollapse: "Collapse band",
  chipMenuRename: "Rename band",
  chipMenuMoveTo: "Move to {target}",
  chipMenuMoveToNewPane: "Move to a new pane",
  chipMenuUngroup: "Ungroup band",
  chipMenuCloseTabs: "Close tabs in band",

  // チップ本体
  chipAria: "{name} — {action}",
  actionExpand: "expand",
  actionCollapse: "collapse",
  unnamedBand: "Band",

  // 設定画面
  settingChipWidthName: "Band name width",
  settingChipWidthDesc:
    "Maximum width of the band name on a chip, counted in characters. " +
    "Lower it when your theme makes the tab strip feel cramped.",
  settingAbsorbName: "Absorb newly opened tabs",
  settingAbsorbDesc:
    "Add a new tab to a band when it opens between two of its members, " +
    "or right after the member it was opened from. " +
    "Turn this off to put every tab into a band by hand.",

  // 名前の変更ダイアログ
  renameTitle: "Rename band",
  renameNameLabel: "Name",
  renameNameDesc: "Leave it empty to show only the colour dot",
  renamePlaceholder: "(unnamed)",
  renameSave: "Save",

  // 移動先のペイン
  paneLabel: "Pane {n} ({title})",

  // 通知 (Notice)
  noticeMovedTabs: 'Moved {count} tabs of "{name}"',
  noticeClosedTabs: 'Closed {count} tabs of "{name}"',

  // 診断 (開発者コンソール)
  diagFailure: "[tab-bands] {op} failed. Obsidian's internals may have changed.",
  diagOrderMismatch:
    "[tab-bands] children and the DOM disagree on tab order. " +
    "Please report this output with steps to reproduce at " +
    "https://github.com/akitenkrad/obsidian-tab-bands/issues",
  opReparent: "Reparenting a leaf",
  opReparentRollback: "Rolling back a reparent",
  opCreateLeaf: "Recreating a leaf",
  opReorderBand: "Reordering a band",
  opFixDropPosition: "Fixing the drop position",
} as const;

type Key = keyof typeof EN;

/** Record<Key, string> なので，EN に足して JA を忘れると型エラーになる */
const JA: Record<Key, string> = {
  cmdNewBand: "アクティブタブを新しいバンドにまとめる",
  cmdRemoveFromBand: "アクティブタブをバンドから外す",
  cmdToggleBand: "アクティブタブのバンドを折りたたむ/展開する",
  cmdCollapseAll: "すべてのバンドを折りたたむ",

  tabMenuNewBand: "新しいバンドにまとめる",
  tabMenuAddToBand: "バンド「{name}」に追加",
  tabMenuRemoveFromBand: "バンドから外す",

  chipMenuExpand: "バンドを展開",
  chipMenuCollapse: "バンドを折りたたむ",
  chipMenuRename: "バンド名を変更",
  chipMenuMoveTo: "{target} へ移動",
  chipMenuMoveToNewPane: "新しいペインへ移動",
  chipMenuUngroup: "バンドを解除",
  chipMenuCloseTabs: "バンド内のタブを閉じる",

  chipAria: "{name} — {action}",
  actionExpand: "展開",
  actionCollapse: "折りたたむ",
  unnamedBand: "バンド",

  settingChipWidthName: "バンド名の幅",
  settingChipWidthDesc:
    "チップに出すバンド名の最大幅 (文字数)．" +
    "テーマの都合でタブ列が窮屈なときは短くする．",
  settingAbsorbName: "新しく開いたタブを吸収する",
  settingAbsorbDesc:
    "バンドのメンバーに挟まれた位置に開かれたタブと，" +
    "メンバーから開かれたタブを，そのバンドに入れる．" +
    "切ると，バンドへの追加はすべて手動になる．",

  renameTitle: "バンド名を変更",
  renameNameLabel: "名前",
  renameNameDesc: "空にすると色ドットのみのチップになります",
  renamePlaceholder: "(無名)",
  renameSave: "保存",

  paneLabel: "ペイン {n} ({title})",

  noticeMovedTabs: "「{name}」の {count} タブを移動しました",
  noticeClosedTabs: "「{name}」の {count} 個のタブを閉じました",

  diagFailure: "[tab-bands] {op} に失敗しました．Obsidian の内部構造が変わった可能性があります．",
  diagOrderMismatch:
    "[tab-bands] children と DOM の並びが一致しません．再現手順とこの出力を " +
    "https://github.com/akitenkrad/obsidian-tab-bands/issues に報告してください．",
  opReparent: "リーフの付け替え",
  opReparentRollback: "付け替えの巻き戻し",
  opCreateLeaf: "リーフの移送",
  opReorderBand: "バンドの並べ替え",
  opFixDropPosition: "ドロップ位置の補正",
};

/**
 * 表示言語ごとの辞書を返す．
 * moment は Obsidian が再エクスポートしている公開 API で，本体の表示言語に
 * 追従する．未知の言語や取得に失敗した場合は英語に落とす．
 */
function table(): Record<Key, string> {
  const locale = typeof moment?.locale === "function" ? moment.locale() : "";
  return locale?.toLowerCase().startsWith("ja") ? JA : EN;
}

/** 文言を引く．{name} 形式の差し込みは params で渡す */
export function t(key: Key, params?: Record<string, string | number>): string {
  const raw = table()[key] || EN[key];
  if (!params) return raw;
  return raw.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in params ? String(params[name]) : whole,
  );
}
