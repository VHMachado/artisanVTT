import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Box, Button, Text } from "theme-ui";
import SimpleBar from "simplebar-react";
import { useToasts } from "react-toast-notifications";
import {
  DragOverlay,
  DragStartEvent,
  MouseSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";

import NpcRosterRow from "./NpcRosterRow";
import MonsterStatBlockModal from "../../modals/MonsterStatBlockModal";
import MonsterArtModal from "../../modals/MonsterArtModal";
import AddNpcModal from "../../modals/AddNpcModal";
import ContextMenu, { ContextMenuPosition } from "../ContextMenu";
import AddIcon from "../../icons/AddIcon";

import DragContext, { CustomDragEndEvent } from "../../contexts/DragContext";
import { useMapStage } from "../../contexts/MapStageContext";
import { useUserId } from "../../contexts/UserIdContext";
import { useAccount } from "../../contexts/AccountContext";
import { useAssets } from "../../contexts/AssetsContext";
import { useMapNpcs } from "../../contexts/MapNpcsContext";
import { useCurrentMap } from "../../contexts/CurrentMapContext";

import { loadMonsterSummaries, loadMonstersByIndex } from "../../5e/bestiary";
import { createMonsterTokenStateWithArt } from "../../helpers/monsterToken";
import { combineMonsterSummaries, isArtOnlyOverlay } from "../../helpers/tableMonsters";
import { clientPositionToMapPosition } from "../../helpers/token";
import { useTableMonsters } from "../../hooks/useTableMonsters";

import type { Monster, MonsterSummary } from "../../types/Monster";
import type { TableMonster } from "../../types/TableMonster";
import type { MapNpc } from "../../types/MapNpc";
import { TokensStateCreateHandler } from "../../types/Events";

type NpcRosterProps = {
  tableId: string;
  mapId: string | undefined;
  onMapTokensStateCreate: TokensStateCreateHandler;
};

/**
 * NPCs tab of the Party sidebar (see components/party/Party.tsx) —
 * Mestre-only, per-map roster of bestiary entries the GM explicitly added
 * via right-click "Adicionar NPCs" (modals/AddNpcModal.tsx). Empty by
 * default: unlike the old Tokens/Monstros panel, this never lists the
 * whole bestiary directly — a Mestre curates a shortlist for the map
 * that's actually loaded.
 *
 * Right-clicking empty space here opens AddNpcModal, mirroring how
 * CharacterRoster's own empty-space right-click opens "Criar personagem".
 * Dragging a row onto the map drops a token via
 * helpers/monsterToken.ts, same as the old bestiary panel did.
 */
function NpcRoster({ tableId, mapId, onMapTokensStateCreate }: NpcRosterProps) {
  const [srdSummaries, setSrdSummaries] = useState<MonsterSummary[]>([]);
  const [parents, setParents] = useState<Map<string, Monster>>(new Map());
  const [dragNpcId, setDragNpcId] = useState<string | null>(null);
  const [openIndex, setOpenIndex] = useState<string | null>(null);
  const [menuPosition, setMenuPosition] = useState<ContextMenuPosition | null>(
    null
  );
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [artTarget, setArtTarget] = useState<
    false | { monster: Monster; overlay?: TableMonster }
  >(false);

  const mapStageRef = useMapStage();
  const userId = useUserId();
  const { session } = useAccount();
  const { getAsset, putAsset } = useAssets();
  const tableMonsters = useTableMonsters(tableId);
  const { mapNpcs, removeMapNpc } = useMapNpcs();
  const { addToast } = useToasts();
  const { placedNpcIds } = useCurrentMap();

  useEffect(() => {
    let cancelled = false;
    Promise.all([loadMonsterSummaries(), loadMonstersByIndex()]).then(
      ([loaded, byIndex]) => {
        if (!cancelled) {
          setSrdSummaries(loaded);
          setParents(byIndex);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const summariesByIndex = useMemo(() => {
    const combined = combineMonsterSummaries(srdSummaries, tableMonsters, parents);
    return new Map(combined.map((summary) => [summary.index, summary]));
  }, [srdSummaries, tableMonsters, parents]);

  /** Each MapNpc entry resolved to its bestiary/homebrew summary, dropping
   * any entry whose creature vanished (a dataset bump, a deleted homebrew
   * row) rather than rendering a broken row. */
  const rosterEntries = useMemo(() => {
    const entries: { npc: MapNpc; monster: MonsterSummary }[] = [];
    for (const npc of mapNpcs) {
      const monster = summariesByIndex.get(npc.monsterIndex);
      if (monster) {
        entries.push({ npc, monster });
      }
    }
    return entries.sort((a, b) => a.npc.createdAt - b.npc.createdAt);
  }, [mapNpcs, summariesByIndex]);

  const mouseSensor = useSensor(MouseSensor, {
    activationConstraint: { distance: 5 },
  });
  const touchSensor = useSensor(TouchSensor, {
    activationConstraint: { distance: 5 },
  });
  const keyboardSensor = useSensor(KeyboardSensor);
  const sensors = useSensors(mouseSensor, touchSensor, keyboardSensor);

  function handleDragStart({ active }: DragStartEvent) {
    setDragNpcId(String(active.id));
  }

  function handleDragEnd({ active, overlayNodeClientRect }: CustomDragEndEvent) {
    setDragNpcId(null);
    const monster = active.data.current?.monster as MonsterSummary | undefined;
    const draggedNpcId = active.data.current?.npcId as string | undefined;
    const mapStage = mapStageRef.current;
    if (!monster || !userId || !mapStage || !overlayNodeClientRect) {
      return;
    }
    if (draggedNpcId && placedNpcIds.has(draggedNpcId)) {
      // A linha não é mais desabilitada/apagada ao arrastar
      // (pedido do usuário) — o bloqueio real acontece aqui, com um toast
      // explicando, em vez de simplesmente ignorar o drop em silêncio.
      addToast("Este NPC já está no mapa", { appearance: "warning" });
      return;
    }
    const dragPosition = {
      x: overlayNodeClientRect.left + overlayNodeClientRect.width / 2,
      y: overlayNodeClientRect.top + overlayNodeClientRect.height / 2,
    };
    const mapPosition = clientPositionToMapPosition(mapStage, dragPosition);
    if (!mapPosition) {
      return;
    }
    createMonsterTokenStateWithArt(
      monster,
      mapPosition,
      userId,
      session,
      getAsset,
      putAsset,
      draggedNpcId
    ).then((tokenState) => onMapTokensStateCreate([tokenState]));
  }

  function handleEditArt(monster: MonsterSummary) {
    const srdMonster = parents.get(monster.index);
    if (!srdMonster) {
      return;
    }
    const overlay = tableMonsters.find(
      (m) => isArtOnlyOverlay(m) && m.parentIndex === monster.index
    );
    setArtTarget({ monster: srdMonster, overlay });
  }

  function handlePanelContextMenu(event: React.MouseEvent) {
    event.preventDefault();
    setMenuPosition({ x: event.clientX, y: event.clientY });
  }

  const dragEntry = rosterEntries.find(
    (entry) => `npc-${entry.npc.id}` === dragNpcId
  );

  return (
    <DragContext
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDragNpcId(null)}
      autoScroll={false}
      sensors={sensors}
    >
      <Box
        onContextMenu={handlePanelContextMenu}
        sx={{
          width: "100%",
          height: "100%",
          flexGrow: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <SimpleBar
          style={{
            flexGrow: 1,
            width: "100%",
            height: "100%",
            minHeight: 0,
            // 8px, não 16px — mesmo motivo do CharacterRoster:
            // tinha que bater com o inset horizontal do cabeçalho.
            padding: "0 8px",
          }}
        >
          <Box sx={{ minHeight: "100%" }}>
            {rosterEntries.length === 0 && (
              // Véu próprio, como as linhas do roster — a barra é
              // transparente agora e este texto cairia direto sobre a arte
              // do mapa.
              <Box variant="cards.panelItem" sx={{ px: 2 }} py={2} mb={2}>
                <Text as="p" variant="caption">
                  Nenhum NPC neste mapa ainda. Clique com o botão direito para
                  adicionar.
                </Text>
              </Box>
            )}
            {rosterEntries.map(({ npc, monster }) => (
              <NpcRosterRow
                key={npc.id}
                npcId={npc.id}
                monster={monster}
                onOpen={(opened) => setOpenIndex(opened.index)}
                onEditArt={handleEditArt}
                onRemove={() => removeMapNpc(npc.id)}
              />
            ))}
          </Box>
        </SimpleBar>
      </Box>
      {createPortal(
        <DragOverlay dropAnimation={null}>
          {dragEntry && (
            <Box bg="surface" sx={{ width: "200px", borderRadius: "4px" }}>
              <NpcRosterRow
                npcId={dragEntry.npc.id}
                monster={dragEntry.monster}
                draggable={false}
                onOpen={() => undefined}
                onRemove={() => undefined}
              />
            </Box>
          )}
        </DragOverlay>,
        document.body
      )}
      {menuPosition && (
        <ContextMenu
          position={menuPosition}
          onRequestClose={() => setMenuPosition(null)}
        >
          <Button
            variant="menuItem"
            onClick={() => {
              setMenuPosition(null);
              if (!mapId) {
                addToast("Abra um mapa antes de adicionar NPCs", {
                  appearance: "warning",
                });
                return;
              }
              setIsAddOpen(true);
            }}
          >
            <AddIcon />
            Adicionar NPCs
          </Button>
        </ContextMenu>
      )}
      <MonsterStatBlockModal
        isOpen={openIndex !== null}
        onRequestClose={() => setOpenIndex(null)}
        monsterIndex={openIndex}
        tableId={tableId}
      />
      {artTarget !== false && (
        <MonsterArtModal
          isOpen
          onRequestClose={() => setArtTarget(false)}
          tableId={tableId}
          monster={artTarget.monster}
          overlay={artTarget.overlay}
        />
      )}
      {mapId && (
        <AddNpcModal
          isOpen={isAddOpen}
          onRequestClose={() => setIsAddOpen(false)}
          tableId={tableId}
          mapId={mapId}
        />
      )}
    </DragContext>
  );
}

export default NpcRoster;
