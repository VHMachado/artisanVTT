#!/usr/bin/env node
// Vendors a PINNED release of 5e-bits/5e-database into src/5e/data/.
//
// Design decision: vendor a fixed release and import offline, never
// depend on an external API at session time — the app is offline-first.
// This script is the reproducible half of that promise — the committed JSON
// under src/5e/data/ is generated output, and re-running this script against
// the same RELEASE tag must reproduce it byte for byte.
//
// Usage:
//   node scripts/vendor-5e.mjs             # re-vendor the pinned release
//   node scripts/vendor-5e.mjs --check     # verify committed files match
//
// Bumping the SRD: change RELEASE below, re-run, review the diff, commit.
// Never hand-edit src/5e/data/*.json — the diff would be unreviewable and
// the next run would silently revert it.

import { writeFile, readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

/** Pinned release of https://github.com/5e-bits/5e-database (MIT). */
const RELEASE = "v5.12.0";

/**
 * Edition: the 2014 SRD 5.1 ("5e clássico"), the one this project targets.
 * The repo also ships a 2024 tree (SRD 5.2) with a different schema
 * (Species/Subspecies instead of Races/Subraces, Weapon Mastery, ...) —
 * supporting both would mean a per-Mesa edition selector, deliberately out
 * of scope here.
 */
const EDITION = "2014";

/**
 * Datasets to vendor.
 *
 * Monsters back the bestiary. The rest back the player sheet and its
 * prerequisite engine: `classes`/`subclasses`/`races`/`subraces`
 * are what a sheet picks, `features` and `levels` are what those picks
 * unlock at each level, `spells` is the largest single gate (a spell can
 * be restricted to a specific subclass — a rule many other VTTs get
 * wrong), and `traits` carries the racial features a sheet displays.
 *
 * Proficiencies.json is deliberately NOT vendored: every proficiency a
 * sheet can choose already arrives embedded (with its name) inside a
 * class's `proficiency_choices` or a feature's `feature_specific`, so the
 * separate file would be 46KB of duplication nothing reads.
 */
const DATASETS = [
  { source: "5e-SRD-Monsters.json", out: "monsters-2014.json" },
  { source: "5e-SRD-Classes.json", out: "classes-2014.json" },
  { source: "5e-SRD-Subclasses.json", out: "subclasses-2014.json" },
  { source: "5e-SRD-Races.json", out: "races-2014.json" },
  { source: "5e-SRD-Subraces.json", out: "subraces-2014.json" },
  { source: "5e-SRD-Features.json", out: "features-2014.json" },
  { source: "5e-SRD-Levels.json", out: "levels-2014.json" },
  { source: "5e-SRD-Spells.json", out: "spells-2014.json" },
  { source: "5e-SRD-Traits.json", out: "traits-2014.json" },
];

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(scriptDir, "..", "src", "5e", "data");

/**
 * Keys dropped from every object at every depth.
 *
 * `url` points at dnd5eapi.co (`/api/2014/monsters/aboleth`) and `image` at
 * its image host — both are exactly the runtime dependency on an external
 * API this app's offline-first design forbids, so keeping them around
 * would only invite someone to fetch them later. Dropping them also cuts
 * the payload from ~1.34MB to ~770KB.
 */
const DROPPED_KEYS = new Set(["url", "image"]);

function strip(value) {
  if (Array.isArray(value)) {
    return value.map(strip);
  }
  if (value && typeof value === "object") {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      if (DROPPED_KEYS.has(key)) {
        continue;
      }
      out[key] = strip(v);
    }
    return out;
  }
  return value;
}

async function fetchDataset(source) {
  const url = `https://raw.githubusercontent.com/5e-bits/5e-database/${RELEASE}/src/${EDITION}/en/${source}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${url} -> HTTP ${response.status}`);
  }
  return response.json();
}

/** Stable, diff-friendly serialisation: 1-space indent, trailing newline. */
function serialise(data) {
  return `${JSON.stringify(data, null, 1)}\n`;
}

async function main() {
  const check = process.argv.includes("--check");
  await mkdir(dataDir, { recursive: true });

  let failed = false;
  for (const { source, out } of DATASETS) {
    const raw = await fetchDataset(source);
    const text = serialise(strip(raw));
    const target = path.join(dataDir, out);
    if (check) {
      const current = await readFile(target, "utf8").catch(() => null);
      if (current === text) {
        console.log(`ok       ${out} (${raw.length} entries)`);
      } else {
        console.error(`MISMATCH ${out} — re-run without --check`);
        failed = true;
      }
      continue;
    }
    await writeFile(target, text, "utf8");
    console.log(`wrote    ${out} (${raw.length} entries)`);
  }

  if (!check) {
    await writeFile(
      path.join(dataDir, "PROVENANCE.md"),
      provenance(),
      "utf8"
    );
    console.log("wrote    PROVENANCE.md");
  }

  if (failed) {
    process.exitCode = 1;
  }
}

function provenance() {
  return `# Vendored 5e SRD data

**Generated file — do not edit by hand.** Regenerate with
\`node scripts/vendor-5e.mjs\` (that script also pins the release and
documents why each field is dropped).

| | |
|---|---|
| Source | [\`5e-bits/5e-database\`](https://github.com/5e-bits/5e-database) |
| Release | \`${RELEASE}\` (pinned) |
| Edition | ${EDITION} SRD 5.1 |
| Datasets | ${DATASETS.map((d) => `\`${d.out}\``).join(", ")} |
| Transform | \`url\` and \`image\` keys stripped recursively (they point at dnd5eapi.co — this app is offline-first and never depends on an external API at session time) |

## Licensing

The \`5e-database\` project itself is MIT (Adrian Padua, Christopher Ward).
The underlying game material is released by Wizards of the Coast under the
[Open Gaming License 1.0a](https://www.wizards.com/default.asp?x=d20/oglfaq/20040123f);
this is the System Reference Document, not the full Monster Manual.

## Why vendored in the client instead of the broker's SQLite

This data is **static, identical for every account, and read-only**: it
has no owner, no version, no conflict, and nothing to sync — none of the
sync machinery (\`changes\` log, outbox, \`baseVersion\` guard) applies to
it. Putting it in the broker would instead make a stat-block lookup fail
when the broker is unreachable, in an app whose whole point is working
offline. Derived and homebrew monsters are the opposite kind of data —
per-Mesa user content with an owner — and those DO belong in the broker,
alongside \`tables\`/\`characters\`.
`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
