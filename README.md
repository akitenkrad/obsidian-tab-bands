<p align="center"><img src="docs/assets/hero.svg" width="100%"></p>

**English** | [日本語](README.ja.md)

# Tab Bands

An Obsidian plugin that lays named, colour-coded, collapsible **bands** over the
tab strip. Group the tabs that belong together, collapse the bands you are not
using, and get the width of the tab strip back. Bands survive restarts, and
collapsing one never detaches a leaf — editor scroll positions and unsaved edits
are kept.

> [!WARNING]
> **This plugin depends on unofficial APIs.** It relies on properties absent from
> the public d.ts (`WorkspaceLeaf.id`, `WorkspaceParent.children`, …) and on
> Obsidian's DOM structure, so an update to Obsidian can break it without notice.
> If it breaks, decoration stops appearing, bands vanish on restart, or
> collapsing stops working. **Your notes are never affected**: band state and
> settings live only in the plugin folder's `data.json`, and disabling the plugin returns the
> tab strip to normal. The full list, with the symptom of each,
> is in [Unofficial APIs](docs/unofficial-api.md).

## Install

Not in the community plugin list yet, so install it by hand.

1. Download `main.js`, `manifest.json` and `styles.css` from the latest
   [release](https://github.com/akitenkrad/obsidian-tab-bands/releases).
2. Put all three into `<vault>/.obsidian/plugins/tab-bands/`. The directory name
   has to match the `id` in `manifest.json`.
3. Settings → Community plugins → (turn off restricted mode if needed) → Reload →
   enable **Tab Bands**.

Desktop only (`isDesktopOnly: true`); requires Obsidian 1.7.0 or later. To update,
overwrite the same three files and reload Obsidian — do not delete `data.json` in
that folder, which holds your bands.

## Docs

- [Usage](docs/usage.md) — operations, band names, when a new tab joins a band,
  settings, known limitations
- [Unofficial APIs](docs/unofficial-api.md) — what this plugin depends on and what
  breaks if each one goes away
- [Internals](docs/internals.md) — design principles, what we measured about
  Obsidian, implementation notes
- [Development](docs/development.md) — building, tests, CI, releasing

## License

MIT. See [LICENSE](LICENSE).
