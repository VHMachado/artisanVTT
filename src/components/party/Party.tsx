import { useState, useEffect } from "react";
import { Flex, Box, Button } from "theme-ui";

import ConnectionStatusDot from "../ConnectionStatusDot";
import CharacterRoster from "./CharacterRoster";
import NpcRoster from "./NpcRoster";
import ResizeHandle from "../ResizeHandle";
import ContextMenu, { ContextMenuPosition } from "../ContextMenu";
import AddIcon from "../../icons/AddIcon";
import CreateCharacterModal from "../../modals/CreateCharacterModal";

import useSetting from "../../hooks/useSetting";
import useResizableWidth from "../../hooks/useResizableWidth";

import { useMapTokenCreate } from "../../contexts/MapTokenCreateContext";
import { useAccount } from "../../contexts/AccountContext";
import { useCurrentMap } from "../../contexts/CurrentMapContext";
import { useTable } from "../../hooks/useTable";
import { TokensStateCreateHandler } from "../../types/Events";

type PartyProps = {
  tableId: string;
};

type PartyTab = "players" | "npcs";

/**
 * This used to list connections (Nickname.tsx per
 * party member, ChangeNicknameButton, AddPartyMemberModal's invite link).
 * It lists the Mesa's Personagens now (CharacterRoster) — "a identidade
 * agora é conta + personagem", so there's no more freeform nickname to
 * change and no invite link (per-table passwords were already dropped;
 * every account sees every Mesa).
 *
 * Gained a second tab ("NPCs", components/party/NpcRoster.tsx) replacing
 * the old right-hand Tokens/Monstros panel: "Jogadores" (this roster,
 * renamed from "Party") and "NPCs" (Mestre-only, hidden entirely for a
 * Player — same gate the initiative tracker applies to isOwner-gated
 * content).
 *
 * Deixou de ser dona dos dados e do tracker de iniciativa —
 * ambos foram para o dock inferior do mapa (components/map/MapDock.tsx),
 * e com eles saíram o `Session`, o `playerState.dice` e a flag de
 * compartilhar rolagem, que só existiam aqui para alimentá-los.
 */
function Party({ tableId }: PartyProps) {
  const mapTokenCreateRef = useMapTokenCreate();
  const { session: accountSession } = useAccount();
  const { currentMapId } = useCurrentMap();
  const table = useTable(tableId);
  // The tracker is Mestre-only — the user decided
  // Jogadores neither edit NOR see it. The NPCs tab follows the same rule:
  // a Player never sees it at all, not even read-only.
  const isOwner = Boolean(
    accountSession && table && table.ownerId === accountSession.accountId
  );

  const [fullScreen] = useSetting<boolean>("map.fullScreen");
  const [partyWidth, setPartyWidth] = useSetting<number>("map.partyWidth");
  const [tab, setTab] = useSetting<PartyTab>("map.partyTab");
  const handleResizeStart = useResizableWidth(
    partyWidth,
    setPartyWidth,
    "left",
    180,
    480
  );

  // A Player never sees the NPCs tab at all — always resolve to "players"
  // for anyone who isn't this table's owner, regardless of what the
  // (per-device, cross-table) setting happens to hold.
  const activeTab: PartyTab = isOwner && tab === "npcs" ? "npcs" : "players";

  // The NPCs tab is mounted LAZILY — only once selected at least once —
  // since it loads the same ~1MB bestiary dataset chunk BestiaryPanel used
  // to (see 5e/bestiary.ts). Kept mounted afterwards so switching tabs
  // doesn't redo that load or lose the roster's scroll position, matching
  // the convention RightPanel's own MONSTROS tab established.
  const [hasOpenedNpcs, setHasOpenedNpcs] = useState(activeTab === "npcs");
  useEffect(() => {
    if (activeTab === "npcs") {
      setHasOpenedNpcs(true);
    }
  }, [activeTab]);

  // Right-clicking the sidebar's empty space (not a character
  // row — CharacterRosterItem stops propagation on its own right-click,
  // see that file) opens the same "Criar personagem" action already
  // available from a Mesa card's context menu, so the sidebar itself is
  // a second, more discoverable entry point to it. Only wired on the
  // Jogadores tab's own content area — NPCs has its own right-click
  // ("Adicionar NPCs", see NpcRoster.tsx) for its own empty space.
  const [menuPosition, setMenuPosition] = useState<ContextMenuPosition | null>(
    null
  );
  const [isCreateCharacterOpen, setIsCreateCharacterOpen] = useState(false);

  function handleContextMenu(event: React.MouseEvent) {
    event.preventDefault();
    setMenuPosition({ x: event.clientX, y: event.clientY });
  }

  const handleMapTokensStateCreate: TokensStateCreateHandler = (states) => {
    mapTokenCreateRef.current?.(states);
  };

  return (
    // A barra FLUTUA sobre o mapa em vez de ocupar largura no
    // flex de Game.tsx (decisão do usuário, referência visual: o painel
    // sobreposto à arte do Alchemy). Por isso `position: absolute` aqui e
    // nenhum `bg` no container externo — ele é só o quadro de
    // posicionamento, e um fundo opaco nele voltaria a esconder o mapa.
    // Consequência aceita: o mapa agora se centra sob a barra, então um
    // naco dele fica atrás dela — é o comportamento "canvas primeiro" que
    // o DESIGN.md pede, e o véu translúcido deixa ver o que está por lá.
    // `pointerEvents: none` no quadro + `all` no painel: sem isso a faixa
    // vazia abaixo do painel (quando ele não chega ao fim da altura)
    // engoliria cliques destinados ao mapa.
    <Box
      sx={{
        position: "absolute",
        top: 0,
        left: 0,
        bottom: 0,
        zIndex: 2,
        pointerEvents: "none",
      }}
    >
      <Box
        // SEM fundo: a barra é totalmente transparente (ajuste pedido
        // depois da primeira rodada da 16b — `overlay` no painel inteiro
        // ainda lia como fosco). O véu que garante legibilidade passou a
        // ser POR BLOCO: cada linha de jogador/NPC carrega o seu próprio
        // (`cards.panelItem`, ver CharacterRosterItem/NpcRosterRow),
        // exatamente como a referência visual, em vez de uma camada única
        // cobrindo a coluna toda.
        //
        // `onDragStart` previne o drag NATIVO do navegador
        // (seleção de texto virando drag, ou um <img> arrastado por
        // padrão do browser) a partir de qualquer espaço vazio deste
        // painel — como ele agora é transparente e flutua SOBRE o mapa,
        // um drag assim cruza para a área do mapa e aciona o
        // GlobalImageDrop (listener global de "solte uma imagem aqui"),
        // mostrando a borda tracejada "Drop as map" e, ao soltar, o toast
        // "Unable to import image" — nada disso tem a ver com o drag de
        // dnd-kit usado por Jogadores/NPCs (que não usa a API nativa de
        // drag, só eventos de pointer, então preventDefault aqui não
        // afeta aquele). Única forma de arrastar algo para a grid continua
        // sendo uma linha de personagem/NPC, via seu próprio <Draggable>.
        onDragStart={(event: React.DragEvent) => event.preventDefault()}
        sx={{
          flexDirection: "column",
          overflow: "visible",
          alignItems: "center",
          height: "100%",
          display: fullScreen ? "none" : "flex",
          width: `${partyWidth}px`,
          minWidth: `${partyWidth}px`,
          pointerEvents: "all",
          // Right padding trimmed to 4px, not the 16px p={3} used on every
          // other edge: the user found a dead gap between the roster
          // cards' right edge and the sidebar's actual edge (where
          // MapBackButton/ResizeHandle sit, both pinned to `partyWidth` —
          // see MapBackButton.tsx) confusing, since this panel has no
          // visible border of its own to judge that edge by otherwise.
          // Left/top/bottom stay at 16px: the left inset still has to
          // match the header's own px={2}=8px-over-this-16px inset (see
          // CharacterRoster.tsx/NpcRoster.tsx's SimpleBar comment).
          pt: 3,
          pr: "4px",
          pb: 3,
          pl: 3,
        }}
      >
        {/* The connectivity dot sits above the tabs and
            shows the same label Home's own dot shows.

            O cabeçalho voltou a ser SEM véu — pedido explícito do
            usuário a partir da referência visual (Alchemy): lá as abas do
            topo ficam totalmente transparentes sobre a arte, diferente das
            linhas da lista logo abaixo, que mantêm seu próprio véu
            (`cards.panelItem`). A legibilidade sobre arte clara fica a
            cargo de um `textShadow` no lugar do bloco opaco. */}
        <Box
          sx={{
            width: "100%",
            flexShrink: 0,
            px: 2,
            textShadow: "0 1px 4px rgba(0, 0, 0, 0.85)",
          }}
          py={2}
          mb={2}
        >
          <ConnectionStatusDot />
          {isOwner && (
            <Flex
              sx={{
                width: "100%",
                justifyContent: "center",
                borderBottom: "1px solid",
                borderColor: "rgba(255, 255, 255, 0.06)",
                flexShrink: 0,
              }}
              mt={1}
            >
              <Button
                variant={activeTab === "players" ? "tabActive" : "tab"}
                onClick={() => setTab("players")}
                aria-pressed={activeTab === "players"}
              >
                Jogadores
              </Button>
              <Button
                variant={activeTab === "npcs" ? "tabActive" : "tab"}
                onClick={() => setTab("npcs")}
                aria-pressed={activeTab === "npcs"}
              >
                NPCs
              </Button>
            </Flex>
          )}
        </Box>
        {/* Both tabs stay MOUNTED once opened (see hasOpenedNpcs above),
            with the inactive one merely hidden — same convention the old
            RightPanel used for its TOKENS/MONSTROS tabs. */}
        <Box
          sx={{
            width: "100%",
            flexGrow: 1,
            minHeight: 0,
            display: activeTab === "players" ? "flex" : "none",
            flexDirection: "column",
            alignItems: "center",
          }}
          onContextMenu={handleContextMenu}
        >
          <CharacterRoster
            tableId={tableId}
            onMapTokensStateCreate={handleMapTokensStateCreate}
          />
        </Box>
        {isOwner && hasOpenedNpcs && (
          <Box
            sx={{
              width: "100%",
              flexGrow: 1,
              minHeight: 0,
              display: activeTab === "npcs" ? "flex" : "none",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <NpcRoster
              tableId={tableId}
              mapId={currentMapId}
              onMapTokensStateCreate={handleMapTokensStateCreate}
            />
          </Box>
        )}
      </Box>
      {!fullScreen && (
        <ResizeHandle edge="right" onPointerDown={handleResizeStart} />
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
              setIsCreateCharacterOpen(true);
            }}
          >
            <AddIcon />
            Criar personagem
          </Button>
        </ContextMenu>
      )}
      <CreateCharacterModal
        isOpen={isCreateCharacterOpen}
        onRequestClose={() => setIsCreateCharacterOpen(false)}
        tableId={tableId}
        onCreated={() => undefined}
      />
    </Box>
  );
}

export default Party;
