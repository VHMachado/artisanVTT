import { describe, expect, test } from "vitest";

import { isMapState } from "./MapState";

/**
 * Notas post-it e desenhos livres saíram do
 * produto inteiro. Os campos `notes`/`drawings` deixaram de existir em
 * `MapState`, e suas flags deixaram o enum de `editFlags`. Estes testes
 * garantem que o estado já migrado continua validando e que restos desses
 * campos são ignorados em vez de invalidar todo o mapa.
 */
const migratedMapState = {
  mapId: "map-1",
  tokens: {},
  fogs: {},
  editFlags: ["tokens"],
};

describe("isMapState after legacy note and drawing purges", () => {
  test("a migrated map state validates", () => {
    expect(isMapState(migratedMapState)).toBe(true);
  });

  test("`notes` is no longer required", () => {
    // Antes desta remoção este objeto falhava por `required: [... "notes" ...]`.
    expect(isMapState({ ...migratedMapState })).toBe(true);
  });

  test("leftover notes and drawings do not invalidate the state", () => {
    // O schema não restringe additionalProperties, então um registro que
    // escapou da migração (ex.: mapState de cliente antigo) continua
    // utilizável; os campos já não são lidos pelo produto.
    expect(
      isMapState({ ...migratedMapState, notes: {}, drawings: {} })
    ).toBe(true);
  });

  test('the "notes" edit flag is rejected', () => {
    // Este é o motivo de upgrade.ts v43 existir: sem filtrar a flag dos
    // registros salvos, um mapa criado antes desta fase passaria a falhar
    // a validação por causa do enum.
    expect(isMapState({ ...migratedMapState, editFlags: ["notes"] })).toBe(false);
  });

  test('the "drawing" edit flag is rejected', () => {
    expect(isMapState({ ...migratedMapState, editFlags: ["drawing"] })).toBe(false);
  });

  test("the surviving edit flags are all accepted", () => {
    expect(
      isMapState({
        ...migratedMapState,
        editFlags: ["fog", "tokens"],
      })
    ).toBe(true);
  });
});
