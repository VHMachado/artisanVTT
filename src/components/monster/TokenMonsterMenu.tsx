import { useEffect, useState } from "react";
import { Box, Button, Divider, Image } from "theme-ui";

import ContextMenu, { ContextMenuPosition } from "../ContextMenu";
import MonsterMenuItems from "./MonsterMenuItems";
import DeleteIcon from "../../icons/DeleteIcon";
import LightIcon from "../../icons/LightIcon";

import { useAccount } from "../../contexts/AccountContext";
import { useTable } from "../../hooks/useTable";
import { useTableMonsters } from "../../hooks/useTableMonsters";
import { useAssetPreviewURL } from "../../hooks/useAssetPreviewURL";
import { loadMonster } from "../../5e/bestiary";
import { isArtOnlyOverlay } from "../../helpers/tableMonsters";
import { monsterIndexFromTokenId } from "../../helpers/monsterToken";
import {
  isMonsterTokenArtKey,
  monsterTokenArtUrl,
} from "../../5e/monsterTokenArt";

import type { Monster } from "../../types/Monster";
import type { TableMonster } from "../../types/TableMonster";
import type { TokenState } from "../../types/TokenState";

type TokenMonsterMenuProps = {
  position: ContextMenuPosition;
  onRequestClose: () => void;
  tokenState: TokenState;
  tableId: string;
  onOpenStatBlock: (monsterIndex: string) => void;
  onDerive: (parent: Monster | undefined, parentIndex: string) => void;
  onEditArt: (monster: Monster, overlay: TableMonster | undefined) => void;
  onEdit: (monster: TableMonster, parent: Monster | undefined) => void;
  /** GM only, homebrew row only: deletes the creature itself (not just
   * this placed token) — the owning hook holds the confirmation state,
   * same split as onEdit/onDerive/onEditArt above. */
  onDelete: (monster: TableMonster) => void;
  /** Switches the token's shown look. Takes the live variant
   * list along with the picked index — see the note on liveVariantAssetIds
   * below for why this isn't just tokenState.monsterTokenVariants. */
  onVariantSelect: (index: number, variantAssetIds: string[]) => void;
  /** Whether this user may remove the token — gates the
   * always-last "Excluir" entry. */
  canRemove: boolean;
  onRemove: () => void;
  /** Opens the token's light/vision editor. Only passed when
   * this user may configure it (the map's Mestre — see useMapTokens),
   * absent otherwise so the entry doesn't render at all. */
  onEditLight?: () => void;
};

/**
 * "Deve dar trigger nas opções que aparecem também ao clicar no
 * Monstro no menu direito" — right-clicking a monster token already
 * PLACED on the map gets the exact same action list as right-clicking its
 * row in the bestiary panel (Abrir ficha / Criar variação / Editar
 * imagens / Editar criatura, see MonsterMenuItems, this repo's shared
 * component for both), plus the variant-switch thumbnail grid
 * when the monster has more than one uploaded look.
 *
 * This is now ALSO the right-click menu for a non-monster
 * token (character/prop) — the drag-to-trash removal icon is gone, and
 * "Excluir" is offered here as the last entry (same danger styling as
 * TableCard's own delete action) for any token the user is allowed to
 * remove (see canRemove/onRemove), monster or not. A non-monster token
 * simply gets no monster-specific entries above it.
 *
 * Purely presentational: resolves what this token's monster identity
 * (via helpers/monsterToken.ts's monsterIndexFromTokenId) currently
 * allows, then calls back up to the OWNER (useMapTokens.tsx) to actually
 * open a modal. This component does NOT hold its own modal state —
 * useMapTokens.tsx's parent state persists across a menu close, whereas
 * this component itself unmounts the instant onRequestClose fires (see
 * useMapTokens.tsx: closing the menu nulls monsterMenuPosition, and that's
 * this component's own render condition), which would have thrown away
 * any state held locally here before a modal ever got a chance to render
 * — exactly the bug an earlier version of this file had.
 */
function TokenMonsterMenu({
  position,
  onRequestClose,
  tokenState,
  tableId,
  onOpenStatBlock,
  onDerive,
  onEditArt,
  onEdit,
  onDelete,
  onVariantSelect,
  canRemove,
  onRemove,
  onEditLight,
}: TokenMonsterMenuProps) {
  const { session } = useAccount();
  const table = useTable(tableId);
  const tableMonsters = useTableMonsters(tableId);
  const canManage = Boolean(
    session && table && table.ownerId === session.accountId
  );

  const monsterIndex = monsterIndexFromTokenId(tokenState.tokenId);
  const homebrew = tableMonsters.find((m) => m.id === monsterIndex);
  const isHomebrew = Boolean(homebrew);
  const artOverlay = tableMonsters.find(
    (m) => isArtOnlyOverlay(m) && m.parentIndex === monsterIndex
  );

  // The SRD stat block this menu's actions need: the monster itself for
  // an SRD token (derive-from / attach-art-to), or its parent for a
  // homebrew token being edited (blank when it was built from scratch).
  // Lazily loaded — this component only exists while the menu is open —
  // and shared with 5e/bestiary.ts's memoised promise, so it costs
  // nothing extra once the bestiary panel or another token has loaded it.
  const parentIndexToLoad = isHomebrew ? homebrew?.parentIndex : monsterIndex;
  const [srdMonster, setSrdMonster] = useState<Monster | undefined>();
  useEffect(() => {
    let cancelled = false;
    if (!parentIndexToLoad) {
      setSrdMonster(undefined);
      return;
    }
    loadMonster(parentIndexToLoad).then((loaded) => {
      if (!cancelled) {
        setSrdMonster(loaded);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [parentIndexToLoad]);
  // A from-scratch homebrew creature (no parentIndex) needs no load at
  // all; anything else waits for the fetch above before offering an
  // action that depends on the parent stat block.
  const parentReady = isHomebrew ? !homebrew?.parentIndex || !!srdMonster : !!srdMonster;

  // The variant list to show/switch through is read LIVE from the
  // monster's own TableMonster row (homebrew's own tokenAssetIds, or an
  // SRD row's art overlay) rather than tokenState.monsterTokenVariants —
  // that field is only a SNAPSHOT taken when the token was dropped
  // (helpers/monsterToken.ts's createMonsterTokenStateWithArt), so a
  // token placed before art existed, or before a later variant was
  // added, would otherwise never show what was uploaded afterwards. Falls
  // back to the token's own snapshot only when neither live source
  // exists (e.g. the TableMonster row was since deleted).
  const liveVariantAssetIds =
    homebrew?.tokenAssetIds ??
    artOverlay?.tokenAssetIds ??
    tokenState.monsterTokenVariants;
  const hasVariants = Boolean(
    liveVariantAssetIds && liveVariantAssetIds.length > 1
  );

  if (!monsterIndex && !canRemove && !onEditLight) {
    return null;
  }

  return (
    <ContextMenu position={position} onRequestClose={onRequestClose}>
      {monsterIndex && (
        <MonsterMenuItems
          isHomebrew={isHomebrew}
          onOpen={() => {
            onRequestClose();
            onOpenStatBlock(monsterIndex);
          }}
          onDerive={
            canManage && !isHomebrew && parentReady
              ? () => {
                  onRequestClose();
                  onDerive(srdMonster, monsterIndex);
                }
              : undefined
          }
          onEditArt={
            canManage && !isHomebrew && parentReady && srdMonster
              ? () => {
                  onRequestClose();
                  onEditArt(srdMonster, artOverlay);
                }
              : undefined
          }
          onEdit={
            canManage && isHomebrew && parentReady && homebrew
              ? () => {
                  onRequestClose();
                  onEdit(homebrew, srdMonster);
                }
              : undefined
          }
          onDelete={
            canManage && isHomebrew && homebrew
              ? () => {
                  onRequestClose();
                  onDelete(homebrew);
                }
              : undefined
          }
        />
      )}
      {hasVariants && liveVariantAssetIds && (
        <>
          <Divider sx={{ my: 1, opacity: 0.15 }} />
          <Box
            sx={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: "4px",
              width: "160px",
            }}
          >
            {liveVariantAssetIds.map((assetId, index) => (
              <VariantThumbnail
                key={assetId + index}
                assetId={assetId}
                active={
                  isMonsterTokenArtKey(assetId)
                    ? tokenState.type === "default" && tokenState.key === assetId
                    : tokenState.type === "file" && tokenState.file === assetId
                }
                onClick={() => {
                  onVariantSelect(index, liveVariantAssetIds);
                  onRequestClose();
                }}
              />
            ))}
          </Box>
        </>
      )}
      {onEditLight && (
        <>
          {(monsterIndex || hasVariants) && (
            <Divider sx={{ my: 1, opacity: 0.15 }} />
          )}
          <Button
            variant="menuItem"
            onClick={() => {
              onRequestClose();
              onEditLight();
            }}
          >
            <LightIcon />
            Luz
          </Button>
        </>
      )}
      {canRemove && (
        <>
          <Divider sx={{ my: 1, opacity: 0.15 }} />
          <Button
            variant="menuItemDestructive"
            onClick={() => {
              onRequestClose();
              onRemove();
            }}
          >
            <DeleteIcon />
            Excluir
          </Button>
        </>
      )}
    </ContextMenu>
  );
}

/** Same look as the old TokenVariantMenu's thumbnail — kept here since
 * this is now its only caller. `assetId` may be either a real
 * broker asset hash (a homebrew/uploaded variant, fetched authenticated
 * via useAssetPreviewURL) or a synthetic global monster-art key
 * (monster-art:<index>:<n>) that resolves to a static public/ URL with no
 * fetch at all — the two are visually indistinguishable in this grid, so
 * the thumbnail picks its URL source per-key rather than the caller
 * branching on it. */
function VariantThumbnail({
  assetId,
  active,
  onClick,
}: {
  assetId: string;
  active: boolean;
  onClick: () => void;
}) {
  const isTokenArt = isMonsterTokenArtKey(assetId);
  const remoteUrl = useAssetPreviewURL(isTokenArt ? undefined : assetId);
  const url = isTokenArt ? monsterTokenArtUrl(assetId) : remoteUrl;
  return (
    <Box
      onClick={onClick}
      sx={{
        width: "48px",
        height: "48px",
        borderRadius: "4px",
        overflow: "hidden",
        cursor: "pointer",
        border: "2px solid",
        borderColor: active ? "primary" : "transparent",
        bg: "rgba(255, 255, 255, 0.06)",
      }}
    >
      {url && (
        <Image
          src={url}
          alt="Variação de token"
          sx={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      )}
    </Box>
  );
}

export default TokenMonsterMenu;
