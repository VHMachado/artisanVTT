import { useState } from "react";
import { Box, Flex, IconButton, Text } from "theme-ui";

import ContextMenu, { ContextMenuPosition } from "../ContextMenu";
import MonsterMenuItems from "./MonsterMenuItems";
import MonsterThumbnail from "./MonsterThumbnail";

import type { MonsterSummary } from "../../types/Monster";

type NpcPickerRowProps = {
  monster: MonsterSummary;
  /** How many entries of this creature are already staged to be added to
   * the current map's NPCs roster (AddNpcModal's own pending quantities,
   * reset when the modal closes) — a UI-only counter, not a persisted
   * "battle count" on the roster entry itself. */
  count: number;
  onIncrement: (monster: MonsterSummary) => void;
  onDecrement: (monster: MonsterSummary) => void;
  /** Opens this monster's stat block (also the row's left-click action,
   * same as BestiaryRow — clicking the thumbnail/name area inspects the
   * creature rather than adding it, the +/- stepper is the add action). */
  onOpen: (monster: MonsterSummary) => void;
  /** GM only, SRD row only: derive a new homebrew creature from this row. */
  onDerive?: (monster: MonsterSummary) => void;
  /** GM only, homebrew row only: edit/delete it. */
  onEdit?: (monster: MonsterSummary) => void;
  /** GM only, SRD row only: attach a Perfil image/token variants directly. */
  onEditArt?: (monster: MonsterSummary) => void;
  /** GM only, homebrew row only: deletes the creature itself straight
   * from the context menu — the caller owns the confirmation step. */
  onDelete?: (monster: MonsterSummary) => void;
};

/**
 * One row of AddNpcModal's Bestiário/Criações lists — same look as
 * BestiaryRow (thumbnail, name, CR, right-click Abrir ficha/Criar
 * variação/Editar imagens/Editar criatura via MonsterMenuItems), but with
 * a "−/count/+" stepper instead of drag-to-map: this modal builds the
 * current map's NPCs roster (components/party/NpcRoster.tsx), it doesn't
 * drop a token directly onto the board the way the old bestiary panel did.
 */
function NpcPickerRow({
  monster,
  count,
  onIncrement,
  onDecrement,
  onOpen,
  onDerive,
  onEdit,
  onEditArt,
  onDelete,
}: NpcPickerRowProps) {
  const [menuPosition, setMenuPosition] = useState<ContextMenuPosition | null>(
    null
  );
  const isHomebrew = monster.source === "table";

  function handleContextMenu(event: React.MouseEvent) {
    event.preventDefault();
    setMenuPosition({ x: event.clientX, y: event.clientY });
  }

  return (
    <Flex
      onContextMenu={handleContextMenu}
      sx={{
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        borderRadius: "4px",
        px: 2,
        py: 1,
        gap: 2,
        "&:hover": { bg: "rgba(255, 255, 255, 0.06)" },
      }}
    >
      <Flex
        onClick={() => onOpen(monster)}
        sx={{
          alignItems: "center",
          gap: 2,
          minWidth: 0,
          flexGrow: 1,
          cursor: "pointer",
        }}
      >
        <MonsterThumbnail
          index={monster.index}
          portraitAssetId={monster.portraitAssetId}
          name={monster.name}
          sx={{ borderRadius: "50%" }}
        />
        <Flex sx={{ flexDirection: "column", minWidth: 0 }}>
          <Text
            as="p"
            variant="body2"
            sx={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {monster.name}
          </Text>
          <Text
            as="p"
            variant="caption"
            sx={{
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {monster.parentName
              ? `variação de ${monster.parentName}`
              : `${monster.size} ${monster.type}`}
          </Text>
        </Flex>
      </Flex>
      <Text variant="labelCaps" sx={{ flexShrink: 0, color: "gray" }}>
        CR {monster.challengeRating}
      </Text>
      <Flex sx={{ alignItems: "center", gap: 1, flexShrink: 0 }}>
        <IconButton
          aria-label="Remover"
          title="Remover"
          disabled={count <= 0}
          onClick={() => onDecrement(monster)}
          sx={{ width: "22px", height: "22px", p: 0 }}
        >
          −
        </IconButton>
        <Text variant="body2" sx={{ minWidth: "16px", textAlign: "center" }}>
          {count}
        </Text>
        <IconButton
          aria-label="Adicionar"
          title="Adicionar"
          onClick={() => onIncrement(monster)}
          sx={{ width: "22px", height: "22px", p: 0 }}
        >
          +
        </IconButton>
      </Flex>
      {menuPosition && (
        <Box
          onClick={(event) => event.stopPropagation()}
          sx={{ position: "absolute", width: 0, height: 0 }}
        >
          <ContextMenu
            position={menuPosition}
            onRequestClose={() => setMenuPosition(null)}
          >
            <MonsterMenuItems
              isHomebrew={isHomebrew}
              onOpen={() => {
                setMenuPosition(null);
                onOpen(monster);
              }}
              onDerive={
                onDerive
                  ? () => {
                      setMenuPosition(null);
                      onDerive(monster);
                    }
                  : undefined
              }
              onEditArt={
                onEditArt
                  ? () => {
                      setMenuPosition(null);
                      onEditArt(monster);
                    }
                  : undefined
              }
              onEdit={
                onEdit
                  ? () => {
                      setMenuPosition(null);
                      onEdit(monster);
                    }
                  : undefined
              }
              onDelete={
                onDelete
                  ? () => {
                      setMenuPosition(null);
                      onDelete(monster);
                    }
                  : undefined
              }
            />
          </ContextMenu>
        </Box>
      )}
    </Flex>
  );
}

export default NpcPickerRow;
