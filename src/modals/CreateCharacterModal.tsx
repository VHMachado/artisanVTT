import { useRef, useState, useEffect, FormEvent, ChangeEvent } from "react";
import { Box, Label, Input, Button, Flex, Checkbox, Text } from "theme-ui";

import Modal from "../components/Modal";

import { useAccount } from "../contexts/AccountContext";
import { useTable } from "../hooks/useTable";
import { createCharacterLocally } from "../helpers/tablesSync";
import { uploadAsset } from "../helpers/assetUpload";
import { accountsAvailable } from "../helpers/account";

import { RequestCloseEventHandler } from "../types/Events";

type CreateCharacterModalProps = {
  isOpen: boolean;
  onRequestClose: RequestCloseEventHandler;
  tableId: string;
  onCreated: (characterId: string) => void;
};

/**
 * "Criar personagem": name + portrait + token image,
 * available to the table's GM AND its Players alike (unlike
 * CreateTableModal, there is no ownership gate here — see
 * broker-go/internal/tables/ops.go's applyCharacterOp, create is open to
 * any authenticated caller). "Vincular a mim agora" implements "Pode ou
 * não ser atribuído a um Jogador na criação" — leaving it unchecked
 * creates an unowned character, adoptable later (adoptCharacterLocally).
 *
 * The Mesa's GM never gets that checkbox: a GM already has full move/edit
 * rights over every character at the table without owning one
 * ("Mestre move e edita todos"), and self-assigning would blur "GM acting
 * on someone's behalf" with "GM playing a PC" — the broker rejects it
 * server-side too (applyCharacterOp), this just hides the option instead
 * of letting the GM hit that rejection.
 */
function CreateCharacterModal({
  isOpen,
  onRequestClose,
  tableId,
  onCreated,
}: CreateCharacterModalProps) {
  const { session } = useAccount();
  const table = useTable(tableId);
  const isOwner = Boolean(session && table && table.ownerId === session.accountId);
  const [name, setName] = useState("");
  const [portraitFile, setPortraitFile] = useState<File | undefined>();
  const [tokenFile, setTokenFile] = useState<File | undefined>();
  const [claim, setClaim] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // The GM can't claim a character — force the checkbox off if table
  // ownership resolves (or changes) while the modal is open.
  useEffect(() => {
    if (isOwner) {
      setClaim(false);
    }
  }, [isOwner]);
  const portraitInputRef = useRef<HTMLInputElement>(null);
  const tokenInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setName("");
    setPortraitFile(undefined);
    setTokenFile(undefined);
    setClaim(!isOwner);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session || !name.trim()) {
      return;
    }
    setIsSubmitting(true);
    try {
      let portraitAssetId: string | undefined;
      let tokenAssetId: string | undefined;
      // Best-effort uploads, same offline-first reasoning as
      // CreateTableModal's banner: the character is still created locally
      // even if the broker is unreachable right now.
      if (accountsAvailable) {
        if (portraitFile) {
          try {
            portraitAssetId = await uploadAsset(session, portraitFile);
          } catch {
            // Ignored — see comment above.
          }
        }
        if (tokenFile) {
          try {
            tokenAssetId = await uploadAsset(session, tokenFile);
          } catch {
            // Ignored — see comment above.
          }
        }
      }
      const id = await createCharacterLocally(
        session,
        tableId,
        name.trim(),
        portraitAssetId,
        tokenAssetId,
        claim
      );
      reset();
      onRequestClose();
      onCreated(id);
    } finally {
      setIsSubmitting(false);
    }
  }

  function focusInput() {
    nameInputRef.current?.focus();
  }

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      onAfterOpen={focusInput}
      style={{ content: { maxWidth: "320px", width: "100%" } }}
    >
      <Flex sx={{ flexDirection: "column", flexGrow: 1 }} m={2}>
        <Text as="h2" variant="heading" sx={{ fontSize: 3 }} mb={2}>
          Criar personagem
        </Text>
        <Box as="form" onSubmit={handleSubmit}>
          <Label htmlFor="character-name" mb={1}>
            Nome do personagem
          </Label>
          <Input
            id="character-name"
            name="name"
            value={name}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setName(event.target.value)
            }
            mb={3}
            ref={nameInputRef}
            required
          />
          <Label htmlFor="character-portrait" mb={1}>
            Imagem do personagem (opcional)
          </Label>
          <Input
            id="character-portrait"
            name="portrait"
            type="file"
            accept="image/jpeg, image/gif, image/png, image/webp"
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setPortraitFile(event.target.files?.[0])
            }
            mb={3}
            ref={portraitInputRef}
          />
          <Label htmlFor="character-token" mb={1}>
            Imagem do token (opcional)
          </Label>
          <Input
            id="character-token"
            name="token"
            type="file"
            accept="image/jpeg, image/gif, image/png, image/webp"
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setTokenFile(event.target.files?.[0])
            }
            mb={3}
            ref={tokenInputRef}
          />
          {!isOwner && (
            <Label mb={3} sx={{ alignItems: "center" }}>
              <Checkbox
                checked={claim}
                onChange={(event) => setClaim(event.target.checked)}
              />
              Vincular a mim agora
            </Label>
          )}
          {!claim && !isOwner && (
            <Text as="p" variant="caption" mb={3}>
              O personagem fica sem dono até alguém adotá-lo.
            </Text>
          )}
          <Flex>
            <Button sx={{ flexGrow: 1 }} disabled={!name.trim() || isSubmitting}>
              Criar personagem
            </Button>
          </Flex>
        </Box>
      </Flex>
    </Modal>
  );
}

export default CreateCharacterModal;
