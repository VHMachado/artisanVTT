import { useState } from "react";
import { Box, Flex, Button, Divider, Text } from "theme-ui";

import CharacterPortrait from "./CharacterPortrait";
import Draggable from "../drag/Draggable";
import ContextMenu, { ContextMenuPosition } from "../ContextMenu";
import EditTileIcon from "../../icons/EditTileIcon";
import ExpandMoreIcon from "../../icons/ExpandMoreIcon";
import DeleteIcon from "../../icons/DeleteIcon";

import { Character } from "../../types/Character";

type CharacterRosterItemProps = {
  character: Character;
  online: boolean;
  draggable?: boolean;
  /** GM of the table, or this character's own owner (
   * "Mestre move e edita todos" + a player edits their own). Enables the
   * right-click "Editar"/"Excluir" menu; enforced again server-side
   * regardless. */
  canManage?: boolean;
  onEdit?: (character: Character) => void;
  /** GM/owner only: deletes this character directly from the context
   * menu, no detour through "Editar" — mirrors the bestiary's own
   * right-click "Excluir" on a homebrew creature. The caller owns the
   * confirmation step (see CharacterRoster's ConfirmModal). */
  onDelete?: (character: Character) => void;
  /** Opens the 5e sheet. Available to everyone (a sheet is
   * readable by the whole table), with editing gated by canManage inside
   * the modal. */
  onOpenSheet?: (character: Character) => void;
};

/**
 * One row of the roster: portrait, character
 * name, owning player's name in a muted tone below it, and a connection
 * dot on the right. Draggable onto the map the same way TokenBarToken is
 * (see CharacterRoster's DragContext) — dropping it is what spawns the
 * token (helpers/characterToken.ts).
 */
function CharacterRosterItem({
  character,
  online,
  draggable = true,
  canManage = false,
  onEdit,
  onDelete,
  onOpenSheet,
}: CharacterRosterItemProps) {
  const [menuPosition, setMenuPosition] = useState<ContextMenuPosition | null>(
    null
  );

  function handleContextMenu(event: React.MouseEvent) {
    // Always stop propagation, even when this row doesn't open
    // its own menu (canManage/onEdit missing) — otherwise a right-click
    // on a character row bubbles up to Party's sidebar-wide "Criar
    // personagem" context menu, opening the
    // wrong menu for a row the user right-clicked on.
    event.stopPropagation();
    // The sheet is readable by anyone, so a row opens its menu
    // whenever EITHER action is available — gating the whole menu on
    // canManage would hide the sheet from the players who most want it.
    if (!onOpenSheet && (!canManage || (!onEdit && !onDelete))) {
      return;
    }
    event.preventDefault();
    setMenuPosition({ x: event.clientX, y: event.clientY });
  }

  const content = (
    <Flex
      // A barra lateral é transparente sobre a arte do mapa, então
      // o véu de legibilidade vive AQUI, por linha (`cards.panelItem` em
      // theme.ts / `card-panel-item` em DESIGN.md) — bloco escuro de cantos
      // arredondados, como a referência visual pedida. Antes a linha não
      // tinha fundo nenhum porque o painel inteiro era opaco.
      variant="cards.panelItem"
      sx={{
        alignItems: "center",
        width: "100%",
        px: 2,
      }}
      py={2}
      mb={2}
      onContextMenu={handleContextMenu}
    >
      <Box
        sx={{
          width: "48px",
          height: "48px",
          minWidth: "48px",
          borderRadius: "4px",
          overflow: "hidden",
          bg: "muted",
        }}
      >
        <CharacterPortrait
          portraitAssetId={character.portraitAssetId}
          name={character.name}
          sx={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            userSelect: "none",
            touchAction: "none",
            pointerEvents: "none",
          }}
        />
      </Box>
      <Flex sx={{ flexDirection: "column", minWidth: 0, flexGrow: 1 }} ml={2}>
        <Text
          as="p"
          variant="body2"
          sx={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {character.name}
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
          {character.ownerDisplayName || "Sem dono"}
        </Text>
      </Flex>
      <Box
        title={online ? "Conectado" : "Desconectado"}
        aria-label={online ? "Conectado" : "Desconectado"}
        sx={{
          width: "10px",
          height: "10px",
          minWidth: "10px",
          borderRadius: "50%",
          backgroundColor: online ? "#4caf50" : "gray",
          ml: 2,
        }}
      />
      {menuPosition && (
        <ContextMenu
          position={menuPosition}
          onRequestClose={() => setMenuPosition(null)}
        >
          {onOpenSheet && (
            <Button
              variant="menuItem"
              onClick={() => {
                setMenuPosition(null);
                onOpenSheet(character);
              }}
            >
              <ExpandMoreIcon />
              Ficha
            </Button>
          )}
          {canManage && onEdit && (
            <Button
              variant="menuItem"
              onClick={() => {
                setMenuPosition(null);
                onEdit(character);
              }}
            >
              <EditTileIcon />
              Editar
            </Button>
          )}
          {canManage && onDelete && (
            <>
              <Divider sx={{ my: 1, opacity: 0.15 }} />
              <Button
                variant="menuItemDestructive"
                onClick={() => {
                  setMenuPosition(null);
                  onDelete(character);
                }}
              >
                <DeleteIcon />
                Excluir
              </Button>
            </>
          )}
        </ContextMenu>
      )}
    </Flex>
  );

  if (!draggable) {
    return content;
  }

  return (
    <Draggable id={character.id} data={{ character }}>
      {content}
    </Draggable>
  );
}

export default CharacterRosterItem;
