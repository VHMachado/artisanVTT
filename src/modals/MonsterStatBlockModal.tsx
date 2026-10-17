import { useEffect, useState } from "react";
import { Flex, Text } from "theme-ui";
import SimpleBar from "simplebar-react";

import Modal from "../components/Modal";
import MonsterStatBlock from "../components/monster/MonsterStatBlock";
import LoadingOverlay from "../components/LoadingOverlay";

import { loadMonster } from "../5e/bestiary";
import { monsterArtUrl } from "../5e/monsterArt";
import { isArtOnlyOverlay, resolveTableMonster } from "../helpers/tableMonsters";
import { useTableMonsters } from "../hooks/useTableMonsters";

import type { Monster } from "../types/Monster";
import { RequestCloseEventHandler } from "../types/Events";

type MonsterStatBlockModalProps = {
  isOpen: boolean;
  onRequestClose: RequestCloseEventHandler;
  /** Slug of the SRD monster, or the id of a homebrew creature
   * at this Mesa (MonsterSummary.index covers both), null when closed. */
  monsterIndex: string | null;
  /** The Mesa whose homebrew creatures this modal can also resolve. */
  tableId?: string;
};

/**
 * "Abrir fichas ... de monstros durante a sessão, para
 * consulta rápida."
 *
 * The full stat block is fetched by index on open rather than passed in:
 * the bestiary panel only ever holds light summaries (see
 * 5e/bestiary.ts's MonsterSummary), so the ~1MB dataset chunk is loaded the
 * first time someone actually opens a monster and never for a session that
 * doesn't.
 *
 * A homebrew id resolves through the SAME path: its stored overrides are
 * merged over its SRD parent (helpers/tableMonsters.ts) into an ordinary
 * `Monster`, so MonsterStatBlock renders both without knowing the
 * difference.
 */
function MonsterStatBlockModal({
  isOpen,
  onRequestClose,
  monsterIndex,
  tableId,
}: MonsterStatBlockModalProps) {
  const [monster, setMonster] = useState<Monster | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const tableMonsters = useTableMonsters(tableId);
  const homebrew = tableMonsters.find((m) => m.id === monsterIndex);
  // An SRD row (homebrew undefined) may still have art attached
  // via an art-only overlay keyed by parentIndex rather than id.
  const artOverlay = tableMonsters.find(
    (m) => isArtOnlyOverlay(m) && m.parentIndex === monsterIndex
  );
  const portraitAssetId = homebrew?.portraitAssetId ?? artOverlay?.portraitAssetId;
  // The per-Mesa overlay (arte global de monstros) ainda vence quando
  // existe (um GM pode ter escolhido/enviado outra imagem de propósito) —
  // a arte curada abaixo é só o fallback para todo SRD que não tem overlay.
  const globalArtUrl = !homebrew ? monsterArtUrl(monsterIndex ?? "") : undefined;

  useEffect(() => {
    let cancelled = false;
    if (!isOpen || !monsterIndex) {
      setMonster(undefined);
      return;
    }
    setIsLoading(true);

    const resolve = homebrew
      ? // A derived creature needs its parent's stat block first; one built
        // from scratch resolves against neutral defaults.
        (homebrew.parentIndex
          ? loadMonster(homebrew.parentIndex)
          : Promise.resolve(undefined)
        ).then((parent) => resolveTableMonster(homebrew, parent))
      : loadMonster(monsterIndex);

    resolve
      .then((loaded) => {
        if (!cancelled) {
          setMonster(loaded);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [isOpen, monsterIndex, tableMonsters]);

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      style={{ content: { maxWidth: "480px", width: "100%" } }}
    >
      <Flex sx={{ flexDirection: "column", flexGrow: 1 }} m={2}>
        <SimpleBar style={{ maxHeight: "70vh", paddingRight: "12px" }}>
          {monster ? (
            <MonsterStatBlock
              monster={monster}
              portraitAssetId={portraitAssetId}
              globalArtUrl={globalArtUrl}
            />
          ) : (
            !isLoading && (
              <Text as="p" variant="body2">
                Ficha não encontrada.
              </Text>
            )
          )}
        </SimpleBar>
        {isLoading && <LoadingOverlay />}
      </Flex>
    </Modal>
  );
}

export default MonsterStatBlockModal;
