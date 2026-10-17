import { useRef, useState, FormEvent, ChangeEvent } from "react";
import { Box, Label, Input, Button, Flex } from "theme-ui";

import Modal from "../components/Modal";

import { useAccount } from "../contexts/AccountContext";
import { createTableLocally } from "../helpers/tablesSync";
import { uploadAsset } from "../helpers/assetUpload";
import { accountsAvailable } from "../helpers/account";

import { RequestCloseEventHandler } from "../types/Events";

type CreateTableModalProps = {
  isOpen: boolean;
  onRequestClose: RequestCloseEventHandler;
  /** Called with the new table's id once it's been created locally
   * (creation is local-first, so the caller can navigate
   * immediately, sync happens in the background). */
  onCreated: (tableId: string) => void;
};

/**
 * "Criar Mesa": name + optional banner image, only
 * enabled once a name is entered. Whoever creates it becomes Dono/Mestre —
 * enforced server-side (owner_id is stamped from the Bearer token, see
 * broker-go/internal/tables/ops.go), this modal never sends an owner.
 */
function CreateTableModal({
  isOpen,
  onRequestClose,
  onCreated,
}: CreateTableModalProps) {
  const { session } = useAccount();
  const [name, setName] = useState("");
  const [bannerFile, setBannerFile] = useState<File | undefined>();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  function handleNameChange(event: ChangeEvent<HTMLInputElement>) {
    setName(event.target.value);
  }

  function handleBannerChange(event: ChangeEvent<HTMLInputElement>) {
    setBannerFile(event.target.files?.[0]);
  }

  function reset() {
    setName("");
    setBannerFile(undefined);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!session || !name.trim()) {
      return;
    }
    setIsSubmitting(true);
    try {
      let bannerAssetId: string | undefined;
      // Uploading the banner is best-effort here: if the broker is
      // unreachable the table is still created locally (offline-first)
      // and the banner just syncs whenever a future edit
      // re-attempts it — this modal's scope is Mesas, not asset retry queues.
      if (bannerFile && accountsAvailable) {
        try {
          bannerAssetId = await uploadAsset(session, bannerFile);
        } catch {
          // Ignored — see comment above.
        }
      }
      const id = await createTableLocally(session, name.trim(), bannerAssetId);
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
    <Modal isOpen={isOpen} onRequestClose={onRequestClose} onAfterOpen={focusInput}>
      <Flex
        sx={{ flexDirection: "column", justifyContent: "center", maxWidth: "300px", flexGrow: 1 }}
        m={2}
      >
        <Box as="form" onSubmit={handleSubmit}>
          <Label htmlFor="table-name" mb={1}>
            Nome da Mesa
          </Label>
          <Input
            id="table-name"
            name="name"
            value={name}
            onChange={handleNameChange}
            mb={3}
            ref={nameInputRef}
            required
          />
          <Label htmlFor="table-banner" mb={1}>
            Imagem de banner (opcional)
          </Label>
          <Input
            id="table-banner"
            name="banner"
            type="file"
            accept="image/jpeg, image/gif, image/png, image/webp"
            onChange={handleBannerChange}
            mb={3}
            ref={fileInputRef}
          />
          <Flex>
            <Button
              variant="cta"
              sx={{ flexGrow: 1 }}
              disabled={!name.trim() || isSubmitting}
            >
              Criar Mesa
            </Button>
          </Flex>
        </Box>
      </Flex>
    </Modal>
  );
}

export default CreateTableModal;
