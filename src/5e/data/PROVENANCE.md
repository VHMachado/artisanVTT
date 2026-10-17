# Vendored 5e SRD data

**Generated file — do not edit by hand.** Regenerate with
`node scripts/vendor-5e.mjs` (that script also pins the release and
documents why each field is dropped).

| | |
|---|---|
| Source | [`5e-bits/5e-database`](https://github.com/5e-bits/5e-database) |
| Release | `v5.12.0` (pinned) |
| Edition | 2014 SRD 5.1 |
| Datasets | `monsters-2014.json`, `classes-2014.json`, `subclasses-2014.json`, `races-2014.json`, `subraces-2014.json`, `features-2014.json`, `levels-2014.json`, `spells-2014.json`, `traits-2014.json` |
| Transform | `url` and `image` keys stripped recursively (they point at dnd5eapi.co — this app is offline-first and never depends on an external API at session time) |

## Licensing

The `5e-database` project itself is MIT (Adrian Padua, Christopher Ward).
The underlying game material is released by Wizards of the Coast under the
[Open Gaming License 1.0a](https://www.wizards.com/default.asp?x=d20/oglfaq/20040123f);
this is the System Reference Document, not the full Monster Manual.

## Why vendored in the client instead of the broker's SQLite

This data is **static, identical for every account, and read-only**: it
has no owner, no version, no conflict, and nothing to sync — none of the
sync machinery (`changes` log, outbox, `baseVersion` guard) applies to
it. Putting it in the broker would instead make a stat-block lookup fail
when the broker is unreachable, in an app whose whole point is working
offline. Derived and homebrew monsters are the opposite kind of data —
per-Mesa user content with an owner — and those DO belong in the broker,
alongside `tables`/`characters`.
