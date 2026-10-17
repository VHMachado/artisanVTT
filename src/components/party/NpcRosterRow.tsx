import { useRef, useState } from "react";
import { Box, Flex, Text } from "theme-ui";

import ContextMenu, { ContextMenuPosition } from "../ContextMenu";
import Draggable from "../drag/Draggable";
import MonsterMenuItems from "../monster/MonsterMenuItems";
import MonsterThumbnail from "../monster/MonsterThumbnail";

import Vector2 from "../../helpers/Vector2";

import type { MonsterSummary } from "../../types/Monster";

type NpcRosterRowProps = {
  /** The MapNpc entry's own id — unique per roster row even when several
   * entries share the same monster.index (three goblins, say), unlike
   * BestiaryRow's plain `monster-${index}` scheme which assumes one row
   * per creature. Used as this row's dnd-kit drag id. */
  npcId: string;
  monster: MonsterSummary;
  draggable?: boolean;
  onOpen: (monster: MonsterSummary) => void;
  /** GM only, SRD row only: attach a Perfil image/token variants directly
   * — same as the Bestiário's own row, offered here too since a GM may
   * want to give an NPC art without leaving this tab. */
  onEditArt?: (monster: MonsterSummary) => void;
  /** Removes this entry from the map's NPCs roster (unlink, not a
   * creature delete — see MonsterMenuItems' onRemove doc). */
  onRemove: () => void;
};

/**
 * One row of the NPCs tab's roster (components/party/NpcRoster.tsx) — an
 * entry the Mestre already added to THIS map via AddNpcModal. Same visual
 * treatment as BestiaryRow (thumbnail, name, CR) and the same drag-to-map
 * behaviour (drops a token via helpers/monsterToken.ts), but its
 * right-click menu only offers "Abrir ficha / Editar imagens / Excluir" —
 * editing the creature itself or deriving a new one is AddNpcModal's job,
 * not this roster's.
 */
function NpcRosterRow({
  npcId,
  monster,
  draggable = true,
  onOpen,
  onEditArt,
  onRemove,
}: NpcRosterRowProps) {
  const [menuPosition, setMenuPosition] = useState<ContextMenuPosition | null>(
    null
  );

  const isHomebrew = monster.source === "table";

  // Same drag-vs-click disambiguation BestiaryRow/TokenBarTokenGroup use:
  // dnd-kit's drag gesture starts from a plain pointerdown/up on this same
  // element, so a completed drag would otherwise also fire the click.
  const pointerDownPositionRef = useRef(new Vector2(0, 0));
  function handlePointerDown(event: React.PointerEvent) {
    pointerDownPositionRef.current = new Vector2(event.clientX, event.clientY);
  }
  function handleClick(event: React.MouseEvent) {
    const clickPosition = new Vector2(event.clientX, event.clientY);
    const distance = Vector2.distance(
      clickPosition,
      pointerDownPositionRef.current
    );
    if (distance < 5) {
      onOpen(monster);
    }
  }

  function handleContextMenu(event: React.MouseEvent) {
    // Party's sidebar has its own onContextMenu ("Adicionar NPCs") — stop
    // propagation so a right-click on a row never opens both.
    event.stopPropagation();
    event.preventDefault();
    setMenuPosition({ x: event.clientX, y: event.clientY });
  }

  const content = (
    <Flex
      onPointerDown={handlePointerDown}
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      // Mesmo véu por linha que CharacterRosterItem — a barra
      // lateral ficou transparente sobre a arte do mapa, então cada linha
      // carrega o próprio fundo escuro arredondado (`cards.panelItem`).
      variant="cards.panelItem"
      sx={{
        alignItems: "center",
        justifyContent: "space-between",
        width: "100%",
        px: 2,
        py: 2,
        mb: 2,
        gap: 2,
        // O hover soma ao véu em vez de substituí-lo: `bg` aqui venceria o
        // fundo do variant e a linha piscaria translúcida ao passar o mouse.
        "&:hover": {
          boxShadow: "inset 0 0 0 999px rgba(255, 255, 255, 0.06)",
        },
      }}
    >
      <Flex sx={{ alignItems: "center", gap: 2, minWidth: 0, flexGrow: 1 }}>
        <MonsterThumbnail
          index={monster.index}
          portraitAssetId={monster.portraitAssetId}
          name={monster.name}
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
              onEditArt={
                onEditArt && !isHomebrew
                  ? () => {
                      setMenuPosition(null);
                      onEditArt(monster);
                    }
                  : undefined
              }
              onRemove={() => {
                setMenuPosition(null);
                onRemove();
              }}
            />
          </ContextMenu>
        </Box>
      )}
    </Flex>
  );

  if (!draggable) {
    return content;
  }

  return (
    <Draggable id={`npc-${npcId}`} data={{ monster, npcId }}>
      {content}
    </Draggable>
  );
}

export default NpcRosterRow;
