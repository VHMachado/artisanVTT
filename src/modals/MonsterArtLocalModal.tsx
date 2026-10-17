import { useEffect, useState } from "react";
import { Box, Text, Button, Flex } from "theme-ui";
import { useToasts } from "react-toast-notifications";

import Modal from "../components/Modal";
import LoadingOverlay from "../components/LoadingOverlay";
import ErrorBanner from "../components/banner/ErrorBanner";

import {
  getLocalMonsterArtRoot,
  pickLocalMonsterArtRoot,
  pickImportSourceDirectory,
  importLocalMonsterArtPack,
} from "../5e/monsterArtLocal";
import { RequestCloseEventHandler } from "../types/Events";

/**
 * The Settings screen for the local monster-art
 * override folder. Lets the user see the current folder, point it
 * somewhere else (e.g. a drive with more room, or a folder they already
 * use for another VTT), and import an existing pack (their own
 * Forgotten Adventures tokens / WotC portraits, or any other
 * third-party pack) into it — `public/monster-token-art/` and
 * `public/monster-art/` no longer ship in this repo at all; this is the
 * only supported path to get that kind of art into the app.
 *
 * Every action here degrades to "desktop only" (the underlying helpers in
 * monsterArtLocal.ts resolve to undefined/throw a clear message) rather
 * than crashing in the web build/preview, consistent with the rest of
 * this mechanism.
 */
function MonsterArtLocalModal({
  isOpen,
  onRequestClose,
}: {
  isOpen: boolean;
  onRequestClose: RequestCloseEventHandler;
}) {
  const { addToast } = useToasts();
  const [root, setRoot] = useState<string>();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error>();

  useEffect(() => {
    if (isOpen) {
      getLocalMonsterArtRoot().then(setRoot);
    }
  }, [isOpen]);

  async function handleChooseFolder() {
    setError(undefined);
    try {
      const selected = await pickLocalMonsterArtRoot();
      if (selected) {
        setRoot(selected);
        addToast("Pasta de arte local atualizada");
      }
    } catch (e) {
      if (e instanceof Error) {
        setError(e);
      }
    }
  }

  async function handleImportPack() {
    setError(undefined);
    try {
      const tokenArtSourceDir = await pickImportSourceDirectory(
        "Escolher pasta de tokens (ex.: Forgotten Adventures)"
      );
      const portraitsSourceDir = await pickImportSourceDirectory(
        "Escolher pasta de retratos (ex.: WotC) — opcional, cancelar pula"
      );
      if (!tokenArtSourceDir && !portraitsSourceDir) {
        return;
      }
      setIsLoading(true);
      const result = await importLocalMonsterArtPack(
        tokenArtSourceDir,
        portraitsSourceDir
      );
      addToast(
        `Importado: ${result.tokenArtFiles} tokens (${result.tokenArtMonsters} monstros), ` +
          `${result.portraits} retratos. ` +
          `Ignorados por já existir: ${result.tokenArtSkipped} tokens, ` +
          `${result.portraitsSkipped} retratos.`
      );
    } catch (e) {
      if (e instanceof Error) {
        setError(e);
      }
    }
    setIsLoading(false);
  }

  function handleClose() {
    if (isLoading) {
      return;
    }
    onRequestClose();
  }

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={handleClose}
      allowClose={!isLoading}
      style={{ content: { maxWidth: "440px", width: "100%" } }}
    >
      <Flex sx={{ flexDirection: "column", flexGrow: 1 }} m={2}>
        <Text as="h2" variant="heading" sx={{ fontSize: 3 }} mb={2}>
          Arte local de monstros
        </Text>
        <Text as="p" mb={2} variant="body2">
          Guarda a arte de monstros (tokens e retratos) fora do repositório,
          numa pasta própria da sua máquina. Tem prioridade sobre a arte
          embutida no app, mas perde para um upload feito numa Mesa
          específica.
        </Text>
        <Box
          mb={2}
          p={2}
          bg="overlay"
          sx={{ borderRadius: "4px", wordBreak: "break-all" }}
        >
          <Text variant="caption" sx={{ display: "block", mb: 1 }}>
            Pasta atual
          </Text>
          <Text as="p" variant="body2">
            {root ?? "Disponível apenas no app desktop"}
          </Text>
        </Box>
        <Flex sx={{ gap: 2, flexDirection: "column" }} mb={2}>
          <Button
            variant="primary"
            onClick={handleChooseFolder}
            disabled={root === undefined || isLoading}
          >
            Escolher outra pasta
          </Button>
          <Button
            variant="primary"
            onClick={handleImportPack}
            disabled={root === undefined || isLoading}
          >
            Importar pacote existente
          </Button>
        </Flex>
        <Text as="p" variant="caption">
          Importar lê uma pasta de tokens no layout{" "}
          <code>&lt;monstro&gt;/&lt;arquivo&gt;.png</code> e/ou uma pasta de
          retratos no layout <code>&lt;monstro&gt;.jpg</code>, copiando para a
          pasta local sem sobrescrever o que já existir lá.
        </Text>
        {isLoading && <LoadingOverlay bg="overlay" />}
        <ErrorBanner error={error} onRequestClose={() => setError(undefined)} />
      </Flex>
    </Modal>
  );
}

export default MonsterArtLocalModal;
