import { useState } from "react";
import { Box, Button, Flex, Text } from "theme-ui";
import { useHistory } from "react-router-dom";

import Modal from "../components/Modal";
import CharacterPortrait from "../components/party/CharacterPortrait";
import CreateCharacterModal from "./CreateCharacterModal";

import { adoptCharacterLocally } from "../helpers/tablesSync";
import { AccountSession } from "../helpers/account";

import { Character } from "../types/Character";

type CharacterGateModalProps = {
  isOpen: boolean;
  tableId: string;
  session: AccountSession;
  unownedCharacters: Character[];
  onResolved: () => void;
};

/**
 * A player who joins the session without a character is required to
 * adopt an existing one or create a new one (blocking modal, before
 * the table unlocks). Rendered by Game.tsx whenever the logged in
 * account owns zero characters in this table — `allowClose={false}` and
 * both shouldCloseOn* props off make it genuinely non-dismissable, unlike
 * every other modal in this app.
 */
function CharacterGateModal({
  isOpen,
  tableId,
  session,
  unownedCharacters,
  onResolved,
}: CharacterGateModalProps) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [adoptingId, setAdoptingId] = useState<string | null>(null);
  const history = useHistory();

  async function handleAdopt(characterId: string) {
    setAdoptingId(characterId);
    try {
      await adoptCharacterLocally(session, characterId);
      onResolved();
    } finally {
      setAdoptingId(null);
    }
  }

  return (
    <>
      <Modal
        isOpen={isOpen && !isCreateOpen}
        onRequestClose={() => undefined}
        allowClose={false}
        shouldCloseOnEsc={false}
        shouldCloseOnOverlayClick={false}
        style={{ content: { maxWidth: "360px" } }}
      >
        <Box m={2}>
          <Text as="h2" variant="heading" mb={2}>
            Escolha um personagem
          </Text>
          <Text as="p" variant="caption" mb={3}>
            Você ainda não tem um personagem nesta mesa. Adote um existente
            ou crie um novo para continuar.
          </Text>
          {unownedCharacters.length > 0 && (
            <Flex sx={{ flexDirection: "column" }} mb={3}>
              {unownedCharacters.map((character) => (
                <Flex
                  key={character.id}
                  sx={{ alignItems: "center", justifyContent: "space-between" }}
                  py={1}
                >
                  <Flex sx={{ alignItems: "center", minWidth: 0 }}>
                    <Box
                      sx={{
                        width: "32px",
                        height: "32px",
                        minWidth: "32px",
                        borderRadius: "4px",
                        overflow: "hidden",
                        bg: "muted",
                      }}
                    >
                      <CharacterPortrait
                        portraitAssetId={character.portraitAssetId}
                        name={character.name}
                        sx={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </Box>
                    <Text
                      as="p"
                      variant="body2"
                      ml={2}
                      sx={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {character.name}
                    </Text>
                  </Flex>
                  <Button
                    variant="secondary"
                    disabled={adoptingId === character.id}
                    onClick={() => handleAdopt(character.id)}
                  >
                    Adotar
                  </Button>
                </Flex>
              ))}
            </Flex>
          )}
          <Button sx={{ width: "100%" }} onClick={() => setIsCreateOpen(true)}>
            Criar personagem
          </Button>
          {/* Not a way to bypass the gate — table-scoped adopt/create is
              still required to control a token — but a way out of the
              modal (see allowClose={false}/no ESC/no overlay-click above)
              back to a screen the player can actually act from, instead
              of a dead end with no back button reachable. */}
          <Button
            variant="secondary"
            sx={{ width: "100%", mt: 2 }}
            onClick={() => history.push("/")}
          >
            Voltar para a Home
          </Button>
        </Box>
      </Modal>
      <CreateCharacterModal
        isOpen={isCreateOpen}
        onRequestClose={() => setIsCreateOpen(false)}
        tableId={tableId}
        onCreated={() => {
          setIsCreateOpen(false);
          onResolved();
        }}
      />
    </>
  );
}

export default CharacterGateModal;
