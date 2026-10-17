# Third-party content and licenses

This project vendors or depends on third-party content under the licenses
listed below, in addition to the npm/Go dependencies declared in
`package.json`, `backend/package.json`, `broker-go/go.mod` and `yarn.lock`
(each under its own upstream license, not relisted individually here).

## Vendored data and assets

| Content | Location | License | Notes |
|---|---|---|---|
| 5e SRD game data (monsters, classes, spells, races, features, levels, traits) | `src/5e/data/*.json` | `5e-database` project: MIT (Adrian Padua, Christopher Ward). Underlying game text: Open Gaming License 1.0a (Wizards of the Coast) | Pinned at `5e-bits/5e-database` release `v5.12.0`. Regenerate with `node scripts/vendor-5e.mjs`; see `src/5e/data/PROVENANCE.md`. This is the System Reference Document, not the full Monster Manual. |
| Dice 3D models/textures | `public/dice/` | CC0 1.0 Universal | See `public/dice/LICENSE`. Public-domain dedication, no attribution required. |
| Archivo (variable + static weights) | npm packages `@fontsource/archivo`, `@fontsource-variable/archivo` | SIL Open Font License 1.1 | Used for the wordmark and all UI text; see `src/theme.ts` for the exact weight/width axes used. |

## Fonts, icons and other UI assets

All icon components under `src/icons/` are original SVG markup written for
this project. UI chrome (buttons, cards, layout) is original CSS-in-JS via
`theme-ui`, styled against this project's own `DESIGN.md` specification —
not a copy of any third-party design system's assets.

## Removed third-party content (not in this repository)

Two asset packs were part of this project's history but are **not**
distributed here, and must not be reintroduced without separately resolving
their licenses:

- A commercial monster token art pack (Forgotten Adventures) — its license
  forbids embedding into "virtual tabletop" software; only local, personal
  use was ever permitted. Kept out of the repository entirely; a GM who owns
  a license can point their own local installation at it through the
  external-art-folder setting, but nothing from that pack ships here.
- Monster reference art scraped without a license from third-party wikis —
  removed outright, no redistribution right ever existed.

## Backend dependencies

`broker-go/` (Go) and `backend/` (Node/Express, legacy) pin their
dependencies in `go.mod`/`go.sum` and `package.json`/`yarn.lock`
respectively; each dependency's license is whatever its own upstream
declares and is not relisted here.
