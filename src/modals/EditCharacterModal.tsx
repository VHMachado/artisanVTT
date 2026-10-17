import { useRef, useState, useEffect, FormEvent, ChangeEvent } from "react";
import { Box, Label, Input, Button, Flex } from "theme-ui";

import Modal from "../components/Modal";
import ConfirmModal from "./ConfirmModal";
import { PortraitThumbnail } from "../components/monster/MonsterArtFields";

import { useAccount } from "../contexts/AccountContext";
import { editCharacterLocally, deleteCharacterLocally } from "../helpers/tablesSync";
import { uploadAsset } from "../helpers/assetUpload";
import { accountsAvailable } from "../helpers/account";

import { Character } from "../types/Character";
import { RequestCloseEventHandler } from "../types/Events";

type EditCharacterModalProps = {
  isOpen: boolean;
  onRequestClose: RequestCloseEventHandler;
  character: Character;
};

/**
 * "Editar personagem" / "Excluir personagem" — the counterpart to
 * CreateCharacterModal for a Personagem that already exists. Only ever
 * mounted for a character the caller is allowed to touch (the table's GM,
 * or the character's own owner — see CharacterRosterItem's canManage),
 * matching applyCharacterOp's authorization server-side; this is a UI
 * convenience gate only, not the real one.
 */
function EditCharacterModal({
  isOpen,
  onRequestClose,
  character,
}: EditCharacterModalProps) {
  const { session } = useAccount();
  const [name, setName] = useState(character.name);
  const [portraitFile, setPortraitFile] = useState<File | undefined>();
  const [removePortrait, setRemovePortrait] = useState(false);
  const [tokenFile, setTokenFile] = useState<File | undefined>();
  const [removeToken, setRemoveToken] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isConfirmDeleteOpen, setIsConfirmDeleteOpen] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);

  // Re-sync the form whenever a different (or freshly renamed) character
  // is opened — react-modal keeps this component mounted between opens.
  useEffect(() => {
    if (isOpen) {
      setName(character.name);
      setPortraitFile(undefined);
      setRemovePortrait(false);
      setTokenFile(undefined);
      setRemoveToken(false);
    }
  }, [isOpen, character.name]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session || !name.trim()) {
      return;
    }
    setIsSubmitting(true);
    try {
      let portraitAssetId = removePortrait ? undefined : character.portraitAssetId;
      let tokenAssetId = removeToken ? undefined : character.tokenAssetId;
      // Best-effort uploads, same offline-first reasoning as
      // CreateCharacterModal: the edit still applies locally even if the
      // broker is unreachable right now.
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
      await editCharacterLocally(character.id, {
        name: name.trim(),
        portraitAssetId,
        tokenAssetId,
      });
      onRequestClose();
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleDelete() {
    setIsConfirmDeleteOpen(false);
    await deleteCharacterLocally(character.id, character.tableId);
    onRequestClose();
  }

  function focusInput() {
    nameInputRef.current?.focus();
  }

  return (
    <Modal isOpen={isOpen} onRequestClose={onRequestClose} onAfterOpen={focusInput}>
      <Flex
        sx={{
          flexDirection: "column",
          justifyContent: "center",
          maxWidth: "300px",
          flexGrow: 1,
        }}
        m={2}
      >
        <Box as="form" onSubmit={handleSubmit}>
          <Label htmlFor="edit-character-name" mb={1}>
            Nome do personagem
          </Label>
          <Input
            id="edit-character-name"
            name="name"
            value={name}
            onChange={(event: ChangeEvent<HTMLInputElement>) =>
              setName(event.target.value)
            }
            mb={3}
            ref={nameInputRef}
            required
          />
          <Label htmlFor="edit-character-portrait" mb={1}>
            Imagem do personagem (opcional)
          </Label>
          <Flex sx={{ alignItems: "center", gap: 2 }} mb={1}>
            {!removePortrait && (portraitFile || character.portraitAssetId) && (
              <PortraitThumbnail
                assetId={portraitFile ? undefined : character.portraitAssetId}
                file={portraitFile}
              />
            )}
            <Input
              id="edit-character-portrait"
              name="portrait"
              type="file"
              accept="image/jpeg, image/gif, image/png, image/webp"
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setPortraitFile(event.target.files?.[0]);
                setRemovePortrait(false);
              }}
              sx={{ flexGrow: 1 }}
            />
            {!removePortrait && (portraitFile || character.portraitAssetId) && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setPortraitFile(undefined);
                  setRemovePortrait(true);
                }}
              >
                Remover
              </Button>
            )}
          </Flex>
          <Box mb={3} />
          <Label htmlFor="edit-character-token" mb={1}>
            Imagem do token (opcional)
          </Label>
          <Flex sx={{ alignItems: "center", gap: 2 }} mb={1}>
            {!removeToken && (tokenFile || character.tokenAssetId) && (
              <PortraitThumbnail
                assetId={tokenFile ? undefined : character.tokenAssetId}
                file={tokenFile}
              />
            )}
            <Input
              id="edit-character-token"
              name="token"
              type="file"
              accept="image/jpeg, image/gif, image/png, image/webp"
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                setTokenFile(event.target.files?.[0]);
                setRemoveToken(false);
              }}
              sx={{ flexGrow: 1 }}
            />
            {!removeToken && (tokenFile || character.tokenAssetId) && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setTokenFile(undefined);
                  setRemoveToken(true);
                }}
              >
                Remover
              </Button>
            )}
          </Flex>
          <Box mb={3} />
          <Flex>
            <Button
              type="button"
              variant="secondary"
              sx={{ flexGrow: 1 }}
              mr={1}
              onClick={() => setIsConfirmDeleteOpen(true)}
              disabled={isSubmitting}
            >
              Excluir
            </Button>
            <Button sx={{ flexGrow: 1 }} ml={1} disabled={!name.trim() || isSubmitting}>
              Salvar
            </Button>
          </Flex>
        </Box>
      </Flex>
      <ConfirmModal
        isOpen={isConfirmDeleteOpen}
        onRequestClose={() => setIsConfirmDeleteOpen(false)}
        onConfirm={handleDelete}
        confirmText="Excluir"
        label="Excluir personagem"
        description={`Isso remove "${character.name}" da Mesa para sempre.`}
      />
    </Modal>
  );
}

export default EditCharacterModal;
