**English** | [日本語](usage.ja.md)

# Usage

## Operations

| Action | How |
| --- | --- |
| Create a band | Right-click a tab → Organize into a new band |
| Add to a band | Drop the tab onto a chip / **drag it between two members of the band** / right-click → Add to band "…" |
| Auto-join for new tabs | Open a tab between two members / **open a tab while a member of the band is active** |
| Remove from a band | Right-click the tab → Remove from band |
| Collapse / expand | Click the chip. While collapsed, clicking the tab title works too |
| Rename, recolour, ungroup, close all | Right-click the chip |
| Move to a pane | Right-click the chip → Move to pane N / Move to a new pane |
| Move a whole band by dragging | Drag the tab **while the band is collapsed** (within a pane or across panes) |
| Commands | Four, starting with "Organize active tab into a new band" |

UI text is **English by default** and switches to Japanese when Obsidian's display
language is Japanese (`src/i18n.ts`).

## Band names

A new band is named `Tab-1`, `Tab-2`, … by default. Numbering picks the lowest
unused number, so deleting a band frees its number for reuse. A name may also be
empty: the chip of an unnamed band shows only the colour dot, but still reserves
the width of `Tab-X` so it does not collapse into the dot alone.

## When a new tab joins a band automatically

Opening a new tab **between two members** of a band puts it in that band. So does
opening a new tab while the **last member** of a band is active — the same
behaviour as Chrome.

Both apply only to a tab that is **newly opened at that moment**. Moving an
existing tab never changes its membership: inferring membership from position
alone causes runaway absorption (see [Internals](internals.md)).

## Known limitations

- Dragging the chip itself to reorder a whole band (it conflicts with the parent
  tab's `dragstart`).
- Mobile. `isDesktopOnly` is `true`; supporting mobile needs a branch for
  `WorkspaceMobileDrawer`.

## Prior plugins

- **Group Tabs** — bundles several files into one native tab.
- **Working tabs** — manages bands as "workspaces" in the left sidebar.
- **Tab Shifter** — moves tabs between tab groups through unofficial APIs.
