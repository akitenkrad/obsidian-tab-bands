**English** | [日本語](unofficial-api.ja.md)

# Dependence on unofficial APIs

This plugin decorates the tab strip, and Obsidian's public API exposes neither the
tab strip DOM nor the order of tabs. Both are load-bearing here, so some
dependence on unofficial APIs is unavoidable.

There are two kinds. **Declared in types** disappears as a type error when
Obsidian removes it, so the build catches it. **Not visible in types** keeps
compiling and breaks silently — you only notice by looking at the screen. The
second kind is the nastier one, so both are listed.

## Declared in types

Collected in `src/obsidian-internals.d.ts`. None of these are in the public d.ts.

| Property | Used for | Symptom if it breaks |
| --- | --- | --- |
| `WorkspaceLeaf.id` | Persistence key | Bands disappear on restart |
| `WorkspaceLeaf.tabHeaderEl` | The DOM being decorated | No decoration at all |
| `WorkspaceLeaf.tabHeaderInnerTitleEl` | Rewriting the title while collapsed | Collapsed bands show no name |
| `WorkspaceParent.containerEl` | Landing check for a pane move (`hasLanded`) | Reparenting always reads as failed and falls back to recreation |
| `Workspace.floatingSplit` | Walking popout windows | Popouts are not decorated (declared optional, so the rest still works) |
| `WorkspaceParent.children` | Leaf enumeration and tab order | Everything stops working |
| `WorkspaceParent.insertChild` / `removeChild` | Reparenting leaves on a pane move | Falls back automatically to recreation through the public API (`leafId` changes) |

`Workspace.requestSaveLayout()` is also used, but it has been **public** since
0.16.0 (a `Debouncer`), so it is not in the table above. `WorkspaceLeaf.parent` is
public as well.

The content container of a leaf is read through `leaf.view.containerEl` (public).
`WorkspaceLeaf.containerEl` is unofficial, but `View.containerEl` is a descendant
of it, which makes it equivalent for the landing check — and it survives on
deferred leaves (measured).

`WorkspaceLeaf.id` has a public counterpart: `Workspace.getLeafById()` (since
1.5.1) combined with `Workspace.getLayout()` builds an id-to-leaf table using only
public API. Because the notion of a leaf id is itself exposed publicly, this
dependency is comparatively unlikely to break.

If exhaustive typings become necessary, adopt
[fevol/obsidian-typings](https://github.com/Fevol/obsidian-typings).

## Not visible in types

These never appear in a type declaration, so if Obsidian changes them **the build
still passes and the plugin breaks quietly**.

| Dependency | Where | Symptom if it breaks |
| --- | --- | --- |
| CSS class `.workspace-tab-header` | `verifyOrder()` in `main.ts` (diagnostics only) | The diagnostic quietly becomes a no-op; features and decoration are unaffected |
| Tab headers are HTML5 `draggable`, and `dragstart`'s target is the tab header itself | The premise of all of `drag.ts` | Drag operations cannot be detected |
| Obsidian rebuilds the strip, and computes the drop position from the order of child elements | The premise of the whole design | Chips vanish; drop positions shift |

`styles.css` used to head this table. It no longer depends on Obsidian's class
names: instead of borrowing `.workspace-tab-header` for specificity, the selectors
repeat the plugin's own class (`.tb-member.tb-member`). Specificity is unchanged,
so the appearance is identical.

Two more class-name dependencies were dropped: the title element is read through
`tabHeaderInnerTitleEl` instead of
`querySelector(".workspace-tab-header-inner-title")`, and the drag source is
identified by asking whether a known `tabHeaderEl` contains the event target
rather than by `closest()`. The `hasClass` left in `verifyOrder()` is deliberate;
the reason is in that function's comment.

`app.dragManager` is **not used** — it was measured not to be involved in tab
dragging. Only a note in `drag.ts` records this, so it does not count as a
dependency.

## Is this acceptable for a community plugin?

Obsidian's official [plugin
guidelines](https://docs.obsidian.md/Plugins/Releasing/Plugin+guidelines) contain
no clause forbidding internal APIs, and dedicated typing packages for them are
independently maintained
([obsidian-typings](https://github.com/Fevol/obsidian-typings),
[obsidian-undocumented](https://github.com/eth-p/obsidian-undocumented)). The
community's convention is: look for a public API first, degrade safely when the
unofficial one fails, and be ready to follow breaking changes. This plugin does
all three — see [Internals](internals.md).
