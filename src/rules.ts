/**
 * バンドの membership に関する「判断」だけを集めた純関数群．
 *
 * ここには Obsidian の API も DOM も持ち込まない．タブ列を TabSlot の並びに
 * 落としてから決め，結果の適用 (store への反映・DOM 操作) は main.ts が行う．
 *
 * 【なぜ切り出すか】これまでのバグと「実測して削除したルール」はすべて
 * この判断に集中している (バンドの分断，端のタブを外へドラッグしたときの
 * 芋づる式の誤吸収，イベント発火順への依存)．判断だけを取り出せば，
 * Obsidian を起動せずに «誤吸収しない» ことを検査できる．
 */

export interface TabSlot {
  leafId: string;
  /** 属しているバンドの id．無所属は undefined */
  groupId?: string;
  /** そのバンドが畳まれているか */
  collapsed?: boolean;
}

export interface Absorption {
  leafId: string;
  groupId: string;
}

/**
 * 新しく開かれたタブのうち，どれをどのバンドに入れるかを決める．
 *
 * 吸収するのは 2 つの場合だけ:
 *   (a) 同一バンドのメンバーに左右を挟まれた位置に開かれた
 *   (b) バンドのメンバーの直後に開かれ，かつそのメンバーが直前までアクティブ
 *       だった (= そのタブから開かれた)
 *
 * (b) に「直前までアクティブ」を要求しているのは，位置だけでは
 * 「バンドの右外に手で開いた無関係なタブ」と区別できないため．
 *
 * **対象は isNew が真のリーフだけ**．既存タブの移動を含めると，バンド端の
 * タブを外へドラッグしたときに間のタブを芋づる式に取り込む (実測済み)．
 *
 * 走査は左から 1 回だけ．吸収した結果は直後の判定に反映されるので，
 * 連続して開かれた新規タブは数珠つなぎに同じバンドへ入る．
 */
export function absorptions(
  slots: readonly TabSlot[],
  opts: {
    /** そのリーフが「今回はじめて現れた」か */
    isNew: (leafId: string) => boolean;
    /** そのリーフが「今」または「1 つ前」のアクティブか */
    wasRecentlyActive: (leafId: string) => boolean;
  },
): Absorption[] {
  const out: Absorption[] = [];
  // 吸収の結果を後続の判定に効かせるための作業用の写し
  const groupOf = slots.map((s) => s.groupId);

  for (let i = 1; i < slots.length; i += 1) {
    if (groupOf[i]) continue; // 既にどこかのバンドに属している
    if (!opts.isNew(slots[i].leafId)) continue; // 既存タブの移動は対象外

    const left = groupOf[i - 1];
    if (!left) continue;

    const sandwiched = groupOf[i + 1] === left;
    const openedFromMember = opts.wasRecentlyActive(slots[i - 1].leafId);
    if (!sandwiched && !openedFromMember) continue;

    groupOf[i] = left;
    out.push({ leafId: slots[i].leafId, groupId: left });
  }

  return out;
}

/**
 * ドラッグで落とされた 1 枚が参加するバンドを決める．
 *
 * 「左右の隣が同一のバンド」だけで判定する．この一点で，バンドの外
 * (末尾の 1 つ右を含む) とバンドどうしの境界を自然に除外できる．
 *
 * **離脱は判定しない**．「外に出た」は「どのバンドにも挟まれていない」と
 * 同じ形になり，末尾の 1 つ右に落とした場合と区別できないため，離脱は
 * 明示操作 (右クリック → バンドから外す) に限る．
 *
 * 畳んだバンドへは入れない．そのタブがその場で消えて見えるので，
 * 畳んだバンドへの導線はチップへのドロップに任せる．
 */
export function bandToJoinAtDrop(slots: readonly TabSlot[], movedLeafId: string): string | null {
  const index = slots.findIndex((s) => s.leafId === movedLeafId);
  if (index <= 0 || index >= slots.length - 1) return null; // 両隣が要る

  const left = slots[index - 1];
  const right = slots[index + 1];
  if (!left.groupId || left.groupId !== right.groupId) return null; // バンドの外 / 境界
  if (left.groupId === slots[index].groupId) return null; // 同じバンド内の並べ替え
  if (left.collapsed) return null;

  return left.groupId;
}

/**
 * バンドを畳むとき，アクティブなタブの逃げ先を決める．
 *
 * 逃げ先は「同じペインにいて，畳まれておらず，これから畳むバンドにも
 * 属さない」最初のタブ．見つからなければ null (呼び出し元はアクティブを
 * 中に残し，戻ってきたときに開き直さないよう覚えておく).
 */
export function escapeTarget(
  slots: readonly TabSlot[],
  activeLeafId: string,
  collapsingGroupId: string,
): string | null {
  const escape = slots.find(
    (s) => s.leafId !== activeLeafId && s.groupId !== collapsingGroupId && !s.collapsed,
  );
  return escape?.leafId ?? null;
}
