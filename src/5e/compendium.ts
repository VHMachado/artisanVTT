import type {
  SRDClass,
  SRDFeature,
  SRDLevel,
  SRDRace,
  SRDSpell,
  SRDSubclass,
  SRDSubrace,
  SRDTrait,
} from "../types/SRD";

/**
 * Access to the vendored 2014 SRD character-building datasets (see
 * `data/PROVENANCE.md`) — vendoring a fixed release means this app can
 * stay offline-first: it never depends on an external API at session time.
 *
 * Same discipline as 5e/bestiary.ts: every dataset is a DYNAMIC import
 * memoised on its promise, so Vite emits its own chunk and a session that
 * never opens a character sheet never fetches any of it. Unlike the
 * bestiary these load as ONE bundle (`loadCompendium`) because the
 * prerequisite engine is cross-referential by nature — deciding which
 * features a level-3 Lore bard gets needs classes, levels and features at
 * once, so loading them separately would only add three round trips to the
 * same first paint.
 */

export type Compendium = {
  classes: SRDClass[];
  subclasses: SRDSubclass[];
  races: SRDRace[];
  subraces: SRDSubrace[];
  features: SRDFeature[];
  levels: SRDLevel[];
  spells: SRDSpell[];
  traits: SRDTrait[];
  /** Pre-built lookups — every one of these is read per rendered option, so
   * building them once with the compendium beats an Array.find per row. */
  classByIndex: Map<string, SRDClass>;
  subclassByIndex: Map<string, SRDSubclass>;
  raceByIndex: Map<string, SRDRace>;
  subraceByIndex: Map<string, SRDSubrace>;
  featureByIndex: Map<string, SRDFeature>;
  spellByIndex: Map<string, SRDSpell>;
  traitByIndex: Map<string, SRDTrait>;
};

let compendiumPromise: Promise<Compendium> | undefined;

export function loadCompendium(): Promise<Compendium> {
  if (!compendiumPromise) {
    compendiumPromise = Promise.all([
      import("./data/classes-2014.json"),
      import("./data/subclasses-2014.json"),
      import("./data/races-2014.json"),
      import("./data/subraces-2014.json"),
      import("./data/features-2014.json"),
      import("./data/levels-2014.json"),
      import("./data/spells-2014.json"),
      import("./data/traits-2014.json"),
    ]).then(
      ([
        classes,
        subclasses,
        races,
        subraces,
        features,
        levels,
        spells,
        traits,
      ]) => {
        const data = {
          classes: (classes.default as unknown) as SRDClass[],
          subclasses: (subclasses.default as unknown) as SRDSubclass[],
          races: (races.default as unknown) as SRDRace[],
          subraces: (subraces.default as unknown) as SRDSubrace[],
          features: (features.default as unknown) as SRDFeature[],
          levels: (levels.default as unknown) as SRDLevel[],
          spells: (spells.default as unknown) as SRDSpell[],
          traits: (traits.default as unknown) as SRDTrait[],
        };
        return {
          ...data,
          classByIndex: byIndex(data.classes),
          subclassByIndex: byIndex(data.subclasses),
          raceByIndex: byIndex(data.races),
          subraceByIndex: byIndex(data.subraces),
          featureByIndex: byIndex(data.features),
          spellByIndex: byIndex(data.spells),
          traitByIndex: byIndex(data.traits),
        };
      }
    );
  }
  return compendiumPromise;
}

function byIndex<T extends { index: string }>(items: T[]): Map<string, T> {
  return new Map(items.map((item) => [item.index, item]));
}

/**
 * Test seam, mirroring bestiary.ts's: drops the memoised promise so a test
 * can load again. Never called by app code.
 */
export function resetCompendiumCache(): void {
  compendiumPromise = undefined;
}
