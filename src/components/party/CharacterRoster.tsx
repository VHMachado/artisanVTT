import { useState } from "react";
import { createPortal } from "react-dom";
import { Box, Flex, Text } from "theme-ui";
import SimpleBar from "simplebar-react";
import { DragOverlay, DragStartEvent } from "@dnd-kit/core";
import { useToasts } from "react-toast-notifications";

import CharacterRosterItem from "./CharacterRosterItem";
import DiceRolls from "./DiceRolls";
import DragContext, { CustomDragEndEvent } from "../../contexts/DragContext";
import EditCharacterModal from "../../modals/EditCharacterModal";
import CharacterSheetModal from "../../modals/CharacterSheetModal";
import ConfirmModal from "../../modals/ConfirmModal";

import { useTableCharacters } from "../../hooks/useTableCharacters";
import { useTable } from "../../hooks/useTable";
import { useParty } from "../../contexts/PartyContext";
import { usePlayerState } from "../../contexts/PlayerContext";
import { useAccount } from "../../contexts/AccountContext";
import { useUserId } from "../../contexts/UserIdContext";
import { useMapStage } from "../../contexts/MapStageContext";
import { useAssets } from "../../contexts/AssetsContext";
import { useCurrentMap } from "../../contexts/CurrentMapContext";

import { createCharacterTokenState } from "../../helpers/characterToken";
import { clientPositionToMapPosition } from "../../helpers/token";
import { deleteCharacterLocally } from "../../helpers/tablesSync";

import { TokensStateCreateHandler } from "../../types/Events";
import { Character } from "../../types/Character";

type CharacterRosterProps = {
  tableId: string;
  onMapTokensStateCreate: TokensStateCreateHandler;
};

/**
 * The Party sidebar's connected-players list becomes
 * this — the Mesa's Personagens, not its connections. One row per
 * character (portrait, name, owning player's name, online dot); dragging
 * a row onto the map spawns its token (helpers/characterToken.ts).
 *
 * Online status and dice rolls are resolved by account id, matching a
 * character's ownerAccountId against the caller's own PlayerState and
 * every other connected member's PlayerState in PartyState — "a
 * identidade agora é conta + personagem", so what used to hang
 * off a typed-in nickname now hangs off whichever character that account
 * owns in THIS table.
 */
function CharacterRoster({
  tableId,
  onMapTokensStateCreate,
}: CharacterRosterProps) {
  const characters = useTableCharacters(tableId);
  const table = useTable(tableId);
  const partyState = useParty();
  const playerState = usePlayerState();
  const { session } = useAccount();
  const userId = useUserId();
  const mapStageRef = useMapStage();
  const { getAsset, putAsset } = useAssets();
  const { placedCharacterIds } = useCurrentMap();
  const { addToast } = useToasts();

  const [dragId, setDragId] = useState<string | null>(null);
  const [editingCharacter, setEditingCharacter] = useState<Character | null>(
    null
  );
  const [sheetCharacter, setSheetCharacter] = useState<Character | null>(null);
  const [deletingCharacter, setDeletingCharacter] = useState<Character | null>(
    null
  );

  const isOwner = Boolean(
    session && table && table.ownerId === session.accountId
  );

  /** "Mestre move e edita todos" — the table's GM can
   * manage every character; a Player can only manage their own. Both are
   * re-checked server-side in applyCharacterOp regardless of what this
   * hides in the UI (same discipline as TableCard's isOwner gate). */
  function canManage(character: Character): boolean {
    if (!session) {
      return false;
    }
    return isOwner || character.ownerAccountId === session.accountId;
  }

  function accountOnline(accountId: number | null): boolean {
    if (accountId === null) {
      return false;
    }
    if (playerState.accountId === accountId) {
      return true;
    }
    return Object.values(partyState).some((p) => p.accountId === accountId);
  }

  function diceRollsFor(accountId: number | null) {
    if (accountId === null) {
      return undefined;
    }
    if (playerState.accountId === accountId) {
      return playerState.dice.share ? playerState.dice.rolls : undefined;
    }
    const member = Object.values(partyState).find(
      (p) => p.accountId === accountId
    );
    if (member && member.dice.share) {
      return member.dice.rolls;
    }
    return undefined;
  }

  function handleDragStart({ active }: DragStartEvent) {
    setDragId(String(active.id));
  }

  async function handleDragEnd({
    active,
    overlayNodeClientRect,
  }: CustomDragEndEvent) {
    setDragId(null);
    if (!userId) {
      return;
    }
    const character = active.data.current?.character as Character | undefined;
    const mapStage = mapStageRef.current;
    if (!character || !mapStage || !overlayNodeClientRect) {
      return;
    }
    if (placedCharacterIds.has(character.id)) {
      // A linha não é mais desabilitada nem apagada ao arrastar
      // (pedido do usuário) — o bloqueio real acontece aqui, com um toast
      // explicando, em vez de simplesmente ignorar o drop em silêncio.
      addToast("Este personagem já está no mapa", { appearance: "warning" });
      return;
    }
    const dragRect = overlayNodeClientRect;
    const dragPosition = {
      x: dragRect.left + dragRect.width / 2,
      y: dragRect.top + dragRect.height / 2,
    };
    const mapPosition = clientPositionToMapPosition(mapStage, dragPosition);
    if (!mapPosition) {
      return;
    }
    const tokenState = await createCharacterTokenState(
      character,
      session,
      getAsset,
      putAsset,
      mapPosition,
      userId
    );
    onMapTokensStateCreate([tokenState]);
  }

  function handleDragCancel() {
    setDragId(null);
  }

  async function handleConfirmDelete() {
    if (!deletingCharacter) {
      return;
    }
    await deleteCharacterLocally(deletingCharacter.id, deletingCharacter.tableId);
    setDeletingCharacter(null);
  }

  const dragCharacter = characters.find((c) => c.id === dragId);

  return (
    <DragContext
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragCancel={handleDragCancel}
      autoScroll={false}
    >
      <SimpleBar
        style={{
          flexGrow: 1,
          width: "100%",
          // Left 8px, não 16px — tinha que bater com o inset horizontal
          // do cabeçalho (px={2} = 8px sobre o padding p={3}=16px do
          // container de Party), senão as linhas do roster ficam mais
          // estreitas que o cabeçalho (bug reportado pelo usuário).
          // Right trimmed to 2px: stacked on Party.tsx's own 4px right
          // padding it used to add up to a 24px dead strip after the
          // card's right edge, confusing since the panel's own edge
          // (where MapBackButton/ResizeHandle sit) has no visible
          // border to judge it by — see Party.tsx's note there.
          padding: "0 2px 0 8px",
          height: "calc(100% - 232px)",
        }}
      >
        {characters.length === 0 && (
          // Véu próprio, como as linhas do roster — a barra é
          // transparente agora e este texto cairia direto sobre a arte do
          // mapa.
          <Box variant="cards.panelItem" sx={{ px: 2 }} py={2} mb={2}>
            <Text as="p" variant="caption">
              Nenhum Personagem nesta Mesa ainda. Clique com o botão direito
              para adicionar.
            </Text>
          </Box>
        )}
        {characters.map((character) => {
          const online = accountOnline(character.ownerAccountId);
          const rolls = diceRollsFor(character.ownerAccountId);
          return (
            <Flex key={character.id} sx={{ flexDirection: "column" }}>
              <CharacterRosterItem
                character={character}
                online={online}
                canManage={canManage(character)}
                onEdit={setEditingCharacter}
                onDelete={setDeletingCharacter}
                onOpenSheet={setSheetCharacter}
              />
              {rolls && <DiceRolls rolls={rolls} />}
            </Flex>
          );
        })}
      </SimpleBar>
      {createPortal(
        <DragOverlay dropAnimation={null}>
          {dragCharacter && (
            <Box sx={{ width: "220px" }}>
              <CharacterRosterItem
                character={dragCharacter}
                online={accountOnline(dragCharacter.ownerAccountId)}
                draggable={false}
              />
            </Box>
          )}
        </DragOverlay>,
        document.body
      )}
      {editingCharacter && (
        <EditCharacterModal
          isOpen={Boolean(editingCharacter)}
          onRequestClose={() => setEditingCharacter(null)}
          character={editingCharacter}
        />
      )}
      {sheetCharacter && (
        <CharacterSheetModal
          isOpen={Boolean(sheetCharacter)}
          onRequestClose={() => setSheetCharacter(null)}
          character={sheetCharacter}
          canEdit={canManage(sheetCharacter)}
          tableId={tableId}
          isTableOwner={isOwner}
        />
      )}
      <ConfirmModal
        isOpen={Boolean(deletingCharacter)}
        onRequestClose={() => setDeletingCharacter(null)}
        onConfirm={handleConfirmDelete}
        confirmText="Excluir"
        label="Excluir personagem"
        description={
          deletingCharacter
            ? `Isso remove "${deletingCharacter.name}" da Mesa para sempre.`
            : ""
        }
      />
    </DragContext>
  );
}

export default CharacterRoster;
