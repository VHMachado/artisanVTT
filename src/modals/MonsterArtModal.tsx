import { useEffect, useState, FormEvent } from "react";
import { Flex, Text, Button } from "theme-ui";

import Modal from "../components/Modal";
import MonsterArtFields from "../components/monster/MonsterArtFields";

import { useAccount } from "../contexts/AccountContext";
import {
  createTableMonsterLocally,
  editTableMonsterLocally,
  deleteTableMonsterLocally,
} from "../helpers/tablesSync";
import { serialiseOverrides } from "../helpers/tableMonsters";
import { uploadAsset } from "../helpers/assetUpload";
import { accountsAvailable } from "../helpers/account";
import { monsterArtUrl } from "../5e/monsterArt";
import { monsterTokenArtVariants, monsterTokenArtUrl } from "../5e/monsterTokenArt";

import type { Monster } from "../types/Monster";
import type { TableMonster } from "../types/TableMonster";
import { RequestCloseEventHandler } from "../types/Events";

type MonsterArtModalProps = {
  isOpen: boolean;
  onRequestClose: RequestCloseEventHandler;
  tableId: string;
  /** The SRD monster this art attaches to. */
  monster: Monster;
  /** This Mesa's existing art-only overlay for `monster`, if one was
   * already saved (see helpers/tableMonsters.ts's isArtOnlyOverlay) —
   * undefined the first time art is attached to this monster. */
  overlay?: TableMonster;
};

/**
 * "Editar imagens" on an SRD row — attaches a Perfil image and/or
 * token variants directly to a vendored monster, no "Criar variação"
 * detour. Reuses the SAME per-Mesa TableMonster entity used for homebrew
 * creatures (no new broker column, no new EntityType): this row just carries no
 * stat overrides, only art, and is marked `artOnly` (see
 * helpers/tableMonsters.ts's isArtOnlyOverlay) so the panel merges its art
 * onto the SRD row instead of listing it as a separate variation.
 *
 * Authorization is UNCHANGED from any other monster op: `applyMonsterOp`
 * only accepts the Mesa's owner (GM) regardless of whether the op carries
 * stat overrides or only art, so this modal is gated the same way
 * MonsterFormModal already is (canManage in BestiaryPanel) — never opened
 * for a Player.
 */
function MonsterArtModal({
  isOpen,
  onRequestClose,
  tableId,
  monster,
  overlay,
}: MonsterArtModalProps) {
  const { session } = useAccount();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [portraitFile, setPortraitFile] = useState<File | undefined>();
  const [removePortrait, setRemovePortrait] = useState(false);
  const [existingTokenAssetIds, setExistingTokenAssetIds] = useState<string[]>(
    []
  );
  const [newTokenFiles, setNewTokenFiles] = useState<File[]>([]);

  // Every SRD monster has a curated global portrait/token art
  // (src/5e/monsterArt.ts, src/5e/monsterTokenArt.ts) — this modal
  // predates that and only ever showed the per-Mesa overlay's OWN art,
  // so opening "Editar imagens" on a monster that already has default
  // art looked like a blank/broken form. Resolve the default art here
  // (static lookups, no network) and pass it down for MonsterArtFields
  // to show as a read-only reference whenever the GM hasn't overridden
  // it with their own upload.
  const defaultPortraitUrl = monsterArtUrl(monster.index);
  const defaultTokenVariantUrls = monsterTokenArtVariants(monster.index)
    .map((key) => monsterTokenArtUrl(key))
    .filter((url): url is string => Boolean(url));

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    setPortraitFile(undefined);
    setRemovePortrait(false);
    setExistingTokenAssetIds(overlay?.tokenAssetIds ?? []);
    setNewTokenFiles([]);
  }, [isOpen, overlay]);

  function removeExistingVariant(hash: string) {
    setExistingTokenAssetIds((prev) => prev.filter((h) => h !== hash));
  }

  function removeNewVariant(index: number) {
    setNewTokenFiles((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session) {
      return;
    }
    setIsSubmitting(true);
    try {
      let portraitAssetId = removePortrait ? undefined : overlay?.portraitAssetId;
      let tokenAssetIds = [...existingTokenAssetIds];
      if (accountsAvailable) {
        if (portraitFile) {
          try {
            portraitAssetId = await uploadAsset(session, portraitFile);
          } catch {
            // Ignored — same offline-first reasoning as MonsterFormModal.
          }
        }
        for (const file of newTokenFiles) {
          try {
            tokenAssetIds.push(await uploadAsset(session, file));
          } catch {
            // Ignored — see comment above.
          }
        }
      }

      const hasArt = Boolean(portraitAssetId) || tokenAssetIds.length > 0;
      const overrides = serialiseOverrides({ artOnly: true });

      if (!hasArt) {
        // Nothing left to keep — remove the overlay row entirely rather
        // than leaving an empty artOnly row behind.
        if (overlay) {
          await deleteTableMonsterLocally(overlay.id, tableId);
        }
      } else if (overlay) {
        await editTableMonsterLocally(overlay.id, {
          portraitAssetId,
          tokenAssetIds,
          overrides,
        });
      } else {
        await createTableMonsterLocally(
          session,
          tableId,
          monster.name,
          overrides,
          monster.index,
          portraitAssetId,
          tokenAssetIds
        );
      }
      onRequestClose();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      style={{ content: { maxWidth: "360px", width: "100%" } }}
    >
      <Flex sx={{ flexDirection: "column", flexGrow: 1 }} m={2}>
        <Text as="h2" variant="heading" sx={{ fontSize: 3 }} mb={1}>
          Imagens de {monster.name}
        </Text>
        <Text as="p" variant="caption" mb={2}>
          Vale para esta Mesa. As estatísticas continuam as do bestiário.
        </Text>
        <form id="monster-art-form" onSubmit={handleSubmit}>
          <MonsterArtFields
            portraitAssetId={overlay?.portraitAssetId}
            portraitFile={portraitFile}
            removePortrait={removePortrait}
            onPortraitFileChange={(file) => {
              setPortraitFile(file);
              setRemovePortrait(false);
            }}
            onRemovePortrait={() => {
              setPortraitFile(undefined);
              setRemovePortrait(true);
            }}
            existingTokenAssetIds={existingTokenAssetIds}
            newTokenFiles={newTokenFiles}
            onAddTokenFiles={(files) =>
              setNewTokenFiles((prev) => [...prev, ...files])
            }
            onRemoveExistingVariant={removeExistingVariant}
            onRemoveNewVariant={removeNewVariant}
            defaultPortraitUrl={defaultPortraitUrl}
            defaultTokenVariantUrls={defaultTokenVariantUrls}
          />
        </form>
        <Flex mt={2}>
          <Button form="monster-art-form" sx={{ flexGrow: 1 }} disabled={isSubmitting}>
            Salvar
          </Button>
        </Flex>
      </Flex>
    </Modal>
  );
}

export default MonsterArtModal;
