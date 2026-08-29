/**
 * テスト用の `obsidian` モジュールの代役．
 *
 * vitest.config.ts の alias で差し替える．本物の d.ts は abstract class
 * ばかりで実体を作れないので，テストが必要とするぶんだけを実クラスで持つ．
 *
 * **WorkspaceLeaf は実クラスであることが必須**．workspace-tree.ts の
 * isLeaf() が `instanceof WorkspaceLeaf` で判定するため，フェイクは
 * このクラスのインスタンスでなければならない．
 */

export interface ViewState {
  type: string;
  state?: Record<string, unknown>;
}

export class WorkspaceLeaf {
  parent: unknown = null;

  constructor(
    public id: string,
    private viewState: ViewState = { type: "markdown" },
  ) {}

  getViewState(): ViewState {
    return this.viewState;
  }

  getDisplayText(): string {
    return (this.viewState.state?.file as string | undefined) ?? this.id;
  }
}

/** 走査側は children の有無しか見ないので，中身は空でよい */
export class WorkspaceParent {
  children: unknown[] = [];
}

export class App {}
export class Plugin {}
