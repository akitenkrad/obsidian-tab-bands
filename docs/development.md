**English** | [日本語](development.ja.md)

# Development

## Build from source

```bash
git clone https://github.com/akitenkrad/obsidian-tab-bands.git \
  <vault>/.obsidian/plugins/tab-bands
cd <vault>/.obsidian/plugins/tab-bands
npm install
npm run build    # type check + production build
npm run dev      # watch build
npm test         # unit tests (vitest)
```

Then: Settings → Community plugins → Reload → enable **Tab Bands**. While
developing, [pjeby/hot-reload](https://github.com/pjeby/hot-reload) is handy (drop
an empty `.hotreload` into the plugin folder).

The directory name has to match the `id` in `manifest.json` (`tab-bands`).

## Tests

Tests live in `test/`. Anything that touches the Obsidian API can only be checked
on a real install, so the tests cover **the Obsidian-independent logic only**.

| File | Covers |
| --- | --- |
| `test/i18n.test.ts` | Language selection, interpolation, dictionary coverage |
| `test/rules.test.ts` | Absorbing new tabs, joining on drop, the escape target when collapsing. Weighted towards **not absorbing the wrong tab** |
| `test/store.test.ts` | Numbering, colour assignment, assign/unassign, carrying fingerprints across `remap`, restoring in `reconcile` |
| `test/workspace-tree.test.ts` | Walking the tree, tab order, picking up popouts (`floatingSplit`) |
| `test/obsidian-stub.ts` | Stands in for `obsidian`. `WorkspaceLeaf` is a real class because it is checked with `instanceof` |
| `test/setup.ts` | Fills in `Array.prototype.remove()`, which Obsidian adds |

What remains in `main.ts` is DOM manipulation and Obsidian API calls; the
membership **decisions** are extracted into `src/rules.ts` as pure functions.

## Node version

Both workflows pin Node 24. The lockfile is generated with the npm 11 line, and
Node 20 (npm 10) disagrees with it about optional platform packages for esbuild,
which makes `npm ci` fail with `EBADPLATFORM`.

## CI

- `.github/workflows/test.yml` — on push to `main` and on every pull request:
  `npm ci` → `npm test` → `npm run build`.
- `.github/workflows/release.yml` — pushing a version tag builds and creates a
  GitHub Release with `main.js` / `manifest.json` / `styles.css` attached. The tag
  name must match `version` in `manifest.json` exactly, with no leading `v`; the
  workflow verifies this.

## Releasing

1. Bump `version` in `manifest.json` and `package.json`, and add the new version
   to `versions.json` with its `minAppVersion`.
2. Commit, push, then push a tag with the same name as the version.
3. The release workflow does the rest.
