/**
 * Obsidian は Array.prototype に remove() 等を生やしており，src はそれを
 * 前提に書かれている (store.ts の `leafIds.remove(id)`)．素の Node には
 * 無いので，テストでは同じ挙動を足しておく．
 *
 * 本体の実装と同じく «最初に一致した 1 つだけ» を取り除く．
 */
if (typeof Array.prototype.remove !== "function") {
  Object.defineProperty(Array.prototype, "remove", {
    value: function <T>(this: T[], item: T): T[] {
      const index = this.indexOf(item);
      if (index > -1) this.splice(index, 1);
      return this;
    },
    writable: true,
    configurable: true,
    enumerable: false,
  });
}
