import { useEffect, useRef, useState } from "react";
import { Box, Card, Flex, Text, Input, Button, Divider } from "theme-ui";
import { useHistory } from "react-router-dom";

import AddIcon from "../../icons/AddIcon";
import EditTileIcon from "../../icons/EditTileIcon";
import DeleteIcon from "../../icons/DeleteIcon";
import ContextMenu, { ContextMenuPosition } from "../ContextMenu";

import { SyncedTable } from "../../types/SyncedTable";
import { renameTableLocally, deleteTableLocally } from "../../helpers/tablesSync";
import { assetObjectURL } from "../../helpers/assetUpload";
import { useAccount } from "../../contexts/AccountContext";
import CreateCharacterModal from "../../modals/CreateCharacterModal";

type TableCardProps = {
  table: SyncedTable;
  /** Whether the logged in account owns this Mesa — only the owner can
   * rename/delete it ("Regra de autorização em tables"): edit
   * requires being owner_id, enforced again server-side regardless of what
   * this hides in the UI). */
  isOwner: boolean;
  /** Live count of clients connected to this Mesa's game room right now
   * (game.Hub.OnlineCounts) — 0 when absent from the
   * broker's response. Polled once in Home.tsx and passed down so every
   * card doesn't open its own polling loop. */
  onlineCount: number;
};

/**
 * Restyled after the Alchemy-style card reference — a
 * bigger image area with role/online badges over the bottom-right corner,
 * a plain footer bar with just the name, and per-row actions moved off a
 * persistent 3-dot button onto a right-click context menu (same pattern
 * CharacterRosterItem already uses).
 */
function TableCard({ table, isOwner, onlineCount }: TableCardProps) {
  const history = useHistory();
  const { session } = useAccount();
  const [menuPosition, setMenuPosition] = useState<ContextMenuPosition | null>(
    null
  );
  const [isRenaming, setIsRenaming] = useState(false);
  const [isCreateCharacterOpen, setIsCreateCharacterOpen] = useState(false);
  const [name, setName] = useState(table.name);
  const [bannerURL, setBannerURL] = useState<string | undefined>();
  const renameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(table.name);
  }, [table.name]);

  // Load the banner image, authenticated (see helpers/assetUpload.ts —
  // the /asset/<hash> endpoint requires a bearer token, so this can't be
  // a plain <img src>). Revoke the previous object URL whenever the
  // banner changes or the card unmounts, to avoid leaking blobs.
  useEffect(() => {
    if (!session || !table.bannerAssetId) {
      setBannerURL(undefined);
      return;
    }
    let cancelled = false;
    let objectURL: string | undefined;
    assetObjectURL(session, table.bannerAssetId)
      .then((url) => {
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectURL = url;
        setBannerURL(url);
      })
      .catch(() => {
        // Broker unreachable or asset not synced yet — the card just
        // falls back to the plain background, matching offline-first.
      });
    return () => {
      cancelled = true;
      if (objectURL) {
        URL.revokeObjectURL(objectURL);
      }
    };
  }, [session, table.bannerAssetId]);

  useEffect(() => {
    if (isRenaming) {
      renameInputRef.current?.focus();
      renameInputRef.current?.select();
    }
  }, [isRenaming]);

  function handleOpen() {
    if (isRenaming) {
      return;
    }
    history.push(`/game/${table.id}`);
  }

  function handleContextMenu(event: React.MouseEvent) {
    if (isRenaming) {
      return;
    }
    event.preventDefault();
    setMenuPosition({ x: event.clientX, y: event.clientY });
  }

  async function handleRenameSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed && trimmed !== table.name) {
      await renameTableLocally(table.id, trimmed);
    }
    setIsRenaming(false);
  }

  async function handleDelete() {
    setMenuPosition(null);
    await deleteTableLocally(table.id);
  }

  return (
    <Card
      sx={{
        position: "relative",
        cursor: isRenaming ? "default" : "pointer",
        overflow: "hidden",
      }}
      onClick={handleOpen}
      onContextMenu={handleContextMenu}
    >
      <Box sx={{ position: "relative" }}>
        <Box
          sx={{
            // Aumentado de 170px para casar com a proporção do
            // card de referência (Alchemy) — imagem ocupando a maior
            // parte do card, footer só com o nome por baixo.
            height: "230px",
            backgroundColor: "muted",
            backgroundImage: bannerURL ? `url(${bannerURL})` : undefined,
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        />
        {/* Role + online badges, bottom-right of the artwork — reference:
            Alchemy's game cards. Role always shown; online count reflects
            game.Hub.OnlineCounts polled from Home.tsx. */}
        <Flex sx={{ position: "absolute", bottom: 2, right: 2, gap: 1 }}>
          <Flex
            sx={{
              alignItems: "center",
              bg: "overlay",
              borderRadius: "9999px",
              px: 2,
              py: "3px",
            }}
          >
            <Text
              as="span"
              sx={{
                fontSize: 0,
                fontWeight: "heading",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                color: "text",
              }}
            >
              {isOwner ? "GM" : "Player"}
            </Text>
          </Flex>
          <Flex
            sx={{
              alignItems: "center",
              gap: 1,
              bg: "overlay",
              borderRadius: "9999px",
              px: 2,
              py: "3px",
            }}
            title="Usuários online nesta Mesa"
          >
            <Box
              sx={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                backgroundColor: onlineCount > 0 ? "#4caf50" : "gray",
              }}
            />
            <Text as="span" sx={{ fontSize: 0, color: "text" }}>
              {onlineCount}
            </Text>
          </Flex>
        </Flex>
      </Box>
      <Flex sx={{ alignItems: "center" }} p={3}>
        {isRenaming ? (
          <Box
            as="form"
            onSubmit={handleRenameSubmit}
            onClick={(event: React.MouseEvent) => event.stopPropagation()}
            sx={{ flexGrow: 1 }}
          >
            <Input
              ref={renameInputRef}
              value={name}
              onChange={(event) => setName(event.target.value)}
              onBlur={handleRenameSubmit}
            />
          </Box>
        ) : (
          <Text
            as="p"
            sx={{
              fontSize: 2,
              fontWeight: "heading",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {table.name}
          </Text>
        )}
      </Flex>
      {menuPosition && (
        <Box onClick={(event: React.MouseEvent) => event.stopPropagation()}>
          <ContextMenu
            position={menuPosition}
            onRequestClose={() => setMenuPosition(null)}
          >
            {/* Criar personagem: available to the GM AND every Player
                (unlike Renomear/Excluir below, there is
                no isOwner gate here). */}
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
            {isOwner && (
              <>
                <Button
                  variant="menuItem"
                  onClick={() => {
                    setMenuPosition(null);
                    setIsRenaming(true);
                  }}
                >
                  <EditTileIcon />
                  Renomear
                </Button>
                <Divider sx={{ my: 1, opacity: 0.15 }} />
                <Button variant="menuItemDestructive" onClick={handleDelete}>
                  <DeleteIcon />
                  Excluir
                </Button>
              </>
            )}
          </ContextMenu>
        </Box>
      )}
      {/* Wrapped in a stopPropagation click handler for the same reason
          the context menu above is: react-modal renders this into a
          portal at document.body, but React bubbles synthetic events
          through the COMPONENT tree, not the DOM tree — a click on the
          modal's submit button, its X, or its overlay (to dismiss) would
          otherwise still reach this Card's onClick={handleOpen} and
          navigate to the game screen right after the modal closes. */}
      <Box onClick={(event: React.MouseEvent) => event.stopPropagation()}>
        <CreateCharacterModal
          isOpen={isCreateCharacterOpen}
          onRequestClose={() => setIsCreateCharacterOpen(false)}
          tableId={table.id}
          onCreated={() => undefined}
        />
      </Box>
    </Card>
  );
}

export default TableCard;
