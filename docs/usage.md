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
| Rename, change colour, ungroup, close all | Right-click the chip |
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

## Band colours

Right-click a chip and choose **Change colour…**. The dialog offers 18 preset
colours; choosing a swatch applies it immediately. For any other colour, use the
colour picker or enter an RGB value, check the preview, and choose **Save**.

The text field accepts `#rgb`, `#rrggbb`, `rgb(r, g, b)`, and three integer RGB
components separated by commas or spaces (for example, `26, 115, 232` or
`26 115 232`). A six-digit hex value without `#`, such as `1a73e8`, is also
accepted. Hex digits are case-insensitive, whitespace is allowed around values,
and every RGB component must be an integer from 0 to 255.

## When a new tab joins a band automatically

Opening a new tab **between two members** of a band puts it in that band. So does
opening a new tab while the **last member** of a band is active — the same
behaviour as Chrome.

Both apply only to a tab that is **newly opened at that moment**. Moving an
existing tab never changes its membership: inferring membership from position
alone causes runaway absorption (see [Internals](internals.md)).

## Settings

Settings → Community plugins → **Tab Bands** (the gear icon).

| Setting | Default | What it does |
| --- | --- | --- |
| Band name width | 12 | Maximum width of the band name on a chip, in characters (4–32). Lower it when your theme makes the tab strip feel cramped. The name is ellipsised beyond it; the chip of an unnamed band is unaffected |
| Absorb newly opened tabs | on | Turns off both cases described above at once. With it off, a tab only joins a band by hand (drag, or the context menu) |
| Focus after closing a tab in a band | Left neighbour | When you close the active tab of an expanded band, the nearest member of the same band on this side becomes active; if there is none, the nearest one on the other side. Closing the last member, or a background tab, leaves the focus to Obsidian |

Everything else is fixed: the initial colour of a new band is auto-assigned from
the 18 presets, preferring unused preset colours, and a collapsed band shows
`Band name (N)`. The reasons are in
[Internals](internals.md). The settings are stored in the same `data.json` as the
bands.

## Known limitations

- Dragging the chip itself to reorder a whole band (it conflicts with the parent
  tab's `dragstart`).
- Mobile. `isDesktopOnly` is `true`; supporting mobile needs a branch for
  `WorkspaceMobileDrawer`.

## Prior plugins

- **Group Tabs** — bundles several files into one native tab.
- **Working tabs** — manages bands as "workspaces" in the left sidebar.
- **Tab Shifter** — moves tabs between tab groups through unofficial APIs.
