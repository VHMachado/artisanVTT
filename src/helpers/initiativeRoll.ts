import { getTablesDatabase } from "./tablesDatabase";
import { loadCompendium } from "../5e/compendium";
import { maxHitPoints, parseSheet, totalInitiativeBonus } from "../5e/characterSheet";
import { loadMonster } from "../5e/bestiary";
import { parseOverrides, resolveTableMonster } from "./tableMonsters";
import { monsterIndexFromTokenId } from "./monsterToken";

import type { TokenState } from "../types/TokenState";
import type { Character } from "../types/Character";
import type { TableMonster } from "../types/TableMonster";

/** SRD ability-score -> modifier (floor((score-10)/2)) — same formula
 * 5e/characterSheet.ts's resolveAbilities uses internally, duplicated
 * here because a raw Monster/TableMonster score never goes through a
 * CharacterSheet's ability-resolution pipeline. */
function abilityModifier(score: number): number {
  return Math.floor((score - 10) / 2);
}

/**
 * Pedido do usuário (2026-10-12): "Rolar iniciativa" automaticamente —
 * 1d20 + bônus de iniciativa, puxado de onde o token vem:
 * - Um token de Personagem (tokenState.characterId) usa a ficha
 *   completa (5e/characterSheet.ts's totalInitiativeBonus — DEX mais
 *   qualquer ajuste manual que a ficha registre).
 * - Um token de monstro/NPC (tokenState.tokenId's
 *   `__monster-<index>` namespace, ver helpers/monsterToken.ts) usa o
 *   modificador de DEX puro: a SRD/TableMonster não tem uma "ficha" com
 *   bônus extras, só a estatística crua.
 * Qualquer outro token (prop, veículo, ou uma falha de leitura —
 * offline, personagem apagado) rola sem bônus (0) em vez de travar a
 * rolagem por um dado ausente.
 */
export async function initiativeBonusForToken(
  tokenState: TokenState
): Promise<number> {
  try {
    if (tokenState.characterId) {
      const character = (await getTablesDatabase()
        .table("characters")
        .get(tokenState.characterId)) as Character | undefined;
      if (!character) {
        return 0;
      }
      const compendium = await loadCompendium();
      const sheet = parseSheet(character.sheet);
      return totalInitiativeBonus(compendium, sheet);
    }

    const monsterIndex = monsterIndexFromTokenId(tokenState.tokenId);
    if (monsterIndex) {
      // `monsterIndex` is either an SRD slug or a homebrew
      // TableMonster's own id (see helpers/tableMonsters.ts's
      // tableMonsterSummary, which sets MonsterSummary.index to
      // monster.id) — try the static bestiary first since it's the
      // common case and needs no Dexie round trip.
      const srdMonster = await loadMonster(monsterIndex);
      if (srdMonster) {
        return abilityModifier(srdMonster.dexterity);
      }
      const tableMonster = (await getTablesDatabase()
        .table("monsters")
        .get(monsterIndex)) as TableMonster | undefined;
      if (tableMonster) {
        const overrides = parseOverrides(tableMonster.overrides);
        if (typeof overrides.dexterity === "number") {
          return abilityModifier(overrides.dexterity);
        }
        if (tableMonster.parentIndex) {
          const parent = await loadMonster(tableMonster.parentIndex);
          if (parent) {
            return abilityModifier(parent.dexterity);
          }
        }
      }
    }

    return 0;
  } catch {
    return 0;
  }
}

/** A plain 1d20 — a UI convenience roll the GM clicks per combatant, not
 * a shared/animated dice-tray result other players need to see or
 * reproduce, so `Math.random` (not a seeded roll) is the right tool. */
export function rollD20(): number {
  return Math.floor(Math.random() * 20) + 1;
}

/**
 * Pedido do usuário (2026-10-12): HP máximo "puxado direto da ficha" —
 * um valor INICIAL sugerido (não travado: o GM ainda pode sobrescrever
 * em TokenMenu.tsx/InitiativeTrackerModal.tsx depois, ver
 * types/TokenState.ts's TokenHp). Mesma origem por token que
 * initiativeBonusForToken usa: ficha completa (classe+CON+nível) para
 * um Personagem, stat block resolvido (SRD ou TableMonster, overrides
 * incluídos) para um monstro/NPC. Retorna undefined (não 0) quando a
 * origem não pôde ser lida — um fallback silencioso para 0 pareceria
 * HP real e esconderia o problema; o chamador decide o que fazer com
 * "sem sugestão".
 */
export async function suggestedMaxHpForToken(
  tokenState: TokenState
): Promise<number | undefined> {
  try {
    if (tokenState.characterId) {
      const character = (await getTablesDatabase()
        .table("characters")
        .get(tokenState.characterId)) as Character | undefined;
      if (!character) {
        return undefined;
      }
      const compendium = await loadCompendium();
      const sheet = parseSheet(character.sheet);
      const hp = maxHitPoints(compendium, sheet);
      return hp > 0 ? hp : undefined;
    }

    const monsterIndex = monsterIndexFromTokenId(tokenState.tokenId);
    if (monsterIndex) {
      const srdMonster = await loadMonster(monsterIndex);
      if (srdMonster) {
        return srdMonster.hit_points;
      }
      const tableMonster = (await getTablesDatabase()
        .table("monsters")
        .get(monsterIndex)) as TableMonster | undefined;
      if (tableMonster) {
        const parent = tableMonster.parentIndex
          ? await loadMonster(tableMonster.parentIndex)
          : undefined;
        return resolveTableMonster(tableMonster, parent).hit_points;
      }
    }

    return undefined;
  } catch {
    return undefined;
  }
}
