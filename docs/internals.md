**English** | [日本語](internals.ja.md)

# Internals

## Design principles

- **Never rebuild the DOM.** The plugin puts a class and `--tb-color` on
  `.workspace-tab-header` and inserts a chip inside the tab header of the band's
  first member. Nothing else. Obsidian's own drag and drop, the overflow menu and
  the theme's appearance all keep working.
- **The chip is not a direct child of the strip.** Obsidian decides the drop
  position from the order of children inside the strip, so injecting an element
  there shifts its index calculation — and it rebuilds the strip when tabs are
  reordered, throwing the injected element away. Making the chip a child of a tab
  header avoids both, and a drop on the chip is then read by Obsidian as "a drop
  on the left half of the first member", which moves the tab to just before the
  band.
- **Never cancel Obsidian's drop handling.** `preventDefault()` is returned from
  `dragover` only while over a chip, and `stopPropagation()` is never called. The
  plugin only records membership.
- **State is keyed by leafId.** `WorkspaceLeaf.id` is persisted in
  `workspace.json` and survives restarts (measured). When it is lost, membership
  is restored from a file-path fingerprint (`GroupStore.reconcile`).
- **Rendering follows "runs".** A chip is drawn per contiguous block of the same
  band, so nothing breaks when tabs are moved by hand. Two chips for the same band
  in two places is a normal state, not an error.
- **Collapsing is CSS only.** Leaves are never detached, so editor scroll
  positions and unsaved edits survive. Only the first member stays visible, as the
  host of the chip.
- **A whole band is moved through the menu, not by dragging.** While expanded,
  every member is a separate visible tab, so there is no way to tell "drag this
  one tab" from "drag the whole band" (while collapsed there is only the host tab
  in the DOM, which is what makes that case work). A modifier key or dragging the
  chip itself would disambiguate it, but right-click the chip → Move to pane N is
  enough in practice. Kept as is after use (2026-08-29).
- **Settings are few, and they live in Obsidian's own settings screen.** Two are
  exposed through `PluginSettingTab` (`src/settings-tab.ts`): the band name width
  on a chip, which a theme can make too cramped, and an on/off switch for
  absorbing newly opened tabs, which is the only automatic change of membership.
  The default colour (auto-assigned from unused colours) and the collapsed title
  format (`Band name (N)`) are **not** exposed: the first would turn into an
  "auto or fixed" choice, and the second would need placeholder validation and
  escaping — neither has caused an observed problem (2026-08-29).
- **The settings live in `data.json`, next to the bands.** `saveData()` replaces
  the whole file, so a second writer would erase the first one's content.
  `GroupStore` stays the only writer and holds the settings under a `settings`
  key beside `version` / `groups` / `fingerprints`. Values are put through
  `normalizeSettings()` on load, because `data.json` is editable by hand and
  older versions wrote no settings at all. The chip name width reaches the CSS as
  a variable **set on the chip element** (`--tb-chip-name-max-width`); setting it
  on `document.body` would not reach popout windows.
- **A drop on a chip inserts at the head of the band** (Chrome appends to the
  tail). The chip lives inside the first member's tab header, so Obsidian reads a
  drop there as "the left half of the first member" and carries the tab to just
  before the band. Matching Chrome would mean undoing that move and placing the
  tab again, which collides with "never cancel Obsidian's drop handling". Kept at
  the head after use (2026-08-29).
- **Popouts go through the same path.** Adding `floatingSplit` to the walk is
  enough, because both the strip and the `MutationObserver` are reached from
  `leaf.tabHeaderEl.parentElement` — that works across windows, whereas
  `document.querySelector` would grab the wrong window's strip. Only drag
  monitoring is per-document, so it is attached again on `window-open`. **Panes in
  other windows are not offered as move targets** for a band, because whether
  reparenting can cross documents is unverified.
- **All text lives in one place.** Every UI string goes through the dictionary in
  `src/i18n.ts` (`t("key")`). The dictionary is a `Record<Key, string>`, so adding
  an English string and forgetting the Japanese one is **a type error**. English
  is sentence case (Obsidian's guideline). Only the exception messages attached to
  `console.error` are fixed in English and not translated — they are developer
  detail meant to be pasted into an issue.
- **Separate deciding from applying.** "Which tab joins which band" is decided by
  pure functions in `src/rules.ts`; DOM manipulation and writing to the store stay
  in `main.ts`. Every bug so far has been in that decision, so it is now shaped so
  that "no runaway absorption" can be checked without launching Obsidian.
- **Membership changes only on an explicit action.** The single exception is a tab
  newly opened inside a band, and even that is restricted to newly appeared
  leaves.

## What we measured

Behaviour that is not in Obsidian's public documentation. All of it was confirmed
on a real install (macOS, Obsidian 1.x).

| Item | Result |
| --- | --- |
| Tab drag mechanism | HTML5 drag (`tabHeaderEl` is `draggable`); `dragstart`'s target is the tab header itself |
| `app.dragManager` | Not involved in tab dragging (`draggable` is always `null`); it is for the file explorer |
| Dropping on a chip | Returning `preventDefault()` from `dragover` makes `drop` arrive directly |
| Dropping outside a tab header | Obsidian moves the tab (it computes the index from the order of children in the strip) |
| Strip rebuilds | Obsidian rebuilds it when tabs are reordered, discarding injected elements |
| **`iterateRootLeaves()` / `iterateAllLeaves()`** | **They do not enumerate deferred leaves.** Re-measured on 2026-08-29 with 1.10.3: 2 returned out of 12 leaves, 10 of which were deferred |
| `WorkspaceParent.children` | Deferred leaves are in it, and they do have `tabHeaderEl` |
| Moving a tab between panes | Obsidian reparents the leaf; `leaf.id` is preserved |
| `MenuItem.setSubmenu()` | Does not exist in this version; menus have to be flat |
| Tab header width | There is no inline style, and CSS `min-width` / `fit-content` cannot reserve width for the content |

The `iterate*Leaves()` finding matters most. Since deferred loading arrived in
Obsidian 1.7, those APIs cannot be used to enumerate leaves, so
`src/workspace-tree.ts` walks `children` recursively instead.

**This has not changed in 1.10.3** (re-measured 2026-08-29). The number returned
matched the number of non-deferred leaves exactly (12 − 10 = 2). The dependency on
`WorkspaceParent.children` cannot be dropped until the public API handles deferred
leaves.

The tab header width finding is why the band name is not drawn inside the chip
while collapsed. Instead **the tab's title element is overwritten with
`Band name (N)`**, letting Obsidian compute the width (the original string is
stashed in `dataset.tbOriginal` and restored on expand and in `resetTab()`).

## Implementation notes

**Why inferring membership from position was abandoned.** The original rule was
"absorb a tab sandwiched between members, and release a member that leaves the
run". Dragging a tab from the edge of a band to the outside then absorbed the tabs
in between, one after another. Order alone cannot tell "the tab left the band"
from "the band grew". Only leaves that **did not exist at the previous check** are
absorbed now (`absorbNewNeighbors`), which distinguishes them from moved tabs.

**`onLayoutChange()` must not return early.** Both `applyPending()` and
`absorbNewNeighbors()` always run. The latter updates `knownLeafIds`, so skipping
it makes existing tabs look "new" on the next pass.

**`gatherGroup()` anchors on the leaf that moved.** By default it anchors on "the
first member in order", but dragging a band to the right changes which leaf
`members[0]` is and pulls the band back to its old position. The drag path passes
the host explicitly as the third argument.

**Joining a band by dragging is decided purely by "both neighbours are the same
band"** (`bandToJoinAtDrop`). That single rule naturally excludes the outside of a
band — including one position past its tail — and the boundary between two bands.
**Leaving is never inferred**: "went outside" looks identical to "is not sandwiched
by any band", which cannot be told apart from a drop one position past the tail,
so leaving is limited to the explicit action (right-click → Remove from band). The
subject is always **the single tab moved by that drag**. A rule that inferred
membership for every leaf in the pane from their order was tried once and absorbed
the tabs in between when a tab was dragged out from the edge of a band (measured
and removed).

**There are two ways for the active tab to be hidden, and their fixes are
opposite.** When a band is collapsed (the active tab has not moved), the active
tab is **evacuated outside** (`evacuateActive`). When the user navigates to a
member of a collapsed band (a link, the quick switcher), the **band is opened**
(`revealActiveBand`). The two are told apart by "did the active leaf change"
(`onActiveLeafChange`). Opening on a redraw that involves no change would make
"collapse all bands" reopen them one by one.

**A band collapsed with nowhere to escape to stays collapsed even when focus
returns.** When every tab in a pane belongs to the collapsed band, the active tab
stays inside it (the editor keeps showing the previous note). Moving to another
pane and back then looks like "the active tab moved into a collapsed band", which
would break the collapsed state. The stranded tab is recorded in `trappedLeafIds`
and expansion is suppressed only when returning to that tab. **Moving to a
different member expands as usual** — the suppression covers only the single tab
that was merely returned to.

**A pane move first tries to reparent the leaf directly.** Reparenting through
`WorkspaceParent.insertChild` / `removeChild` (unofficial) preserves `leafId` and
unsaved state (`reparent`). Because it is unofficial, one leaf is moved first and
verified to have landed in both `children` and the DOM (`hasLanded`); if not, it
is put back and the old path of `createLeafInParent()` + `setViewState()` +
`detach()` is used instead (`recreate`). That path changes `leafId`, so
`GroupStore.remap()` rewrites the store (carrying `fingerprints` across too).

## Source layout

| File | Responsibility |
| --- | --- |
| `src/main.ts` | The plugin itself: commands, menus, event wiring, pane moves |
| `src/decorator.ts` | Decorating the tab strip: building and placing chips, collapsed display |
| `src/drag.ts` | Watching drags: detecting drops on chips, reporting drag results |
| `src/i18n.ts` | UI text dictionary (English / Japanese) |
| `src/rules.ts` | Membership decisions (pure functions; touch neither Obsidian nor the DOM) |
| `src/settings.ts` | Settings: types, defaults, normalization (pure; touches neither Obsidian nor the DOM) |
| `src/settings-tab.ts` | The settings screen (`PluginSettingTab`) |
| `src/store.ts` | Band state, settings and persistence |
| `src/workspace-tree.ts` | Leaf enumeration by walking `children` (replaces `iterate*Leaves`); also walks popouts |
| `src/obsidian-internals.d.ts` | Type declarations for unofficial APIs |
| `test/` | Unit tests (vitest); `obsidian` is replaced with a stub |
