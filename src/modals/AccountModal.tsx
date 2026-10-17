import { useRef, useState } from "react";
import { Box, Text, Button, Flex } from "theme-ui";
import * as Comlink from "comlink";
import { useToasts } from "react-toast-notifications";

import Modal from "../components/Modal";
import LoadingOverlay from "../components/LoadingOverlay";
import LoadingBar from "../components/LoadingBar";
import ErrorBanner from "../components/banner/ErrorBanner";

import { useDatabase } from "../contexts/DatabaseContext";
import { useAccount } from "../contexts/AccountContext";
import { downloadBackup, uploadBackup } from "../helpers/account";
import { RequestCloseEventHandler } from "../types/Events";

/**
 * Save/load a full database backup to the account created at login
 * (AuthGate). This modal used to also own its own login/register
 * form (a separate "Game Master Account" concept) — that's gone now that
 * every user is already authenticated before reaching Settings, via
 * AccountContext.
 */
function AccountModal({
  isOpen,
  onRequestClose,
}: {
  isOpen: boolean;
  onRequestClose: RequestCloseEventHandler;
}) {
  const { worker } = useDatabase();
  const { addToast } = useToasts();
  const { session, clearSession } = useAccount();

  const [isLoading, setIsLoading] = useState(false);
  const [loadingText, setLoadingText] = useState("");
  const [error, setError] = useState<Error>();

  const loadingProgressRef = useRef(0);
  const backgroundTaskRunningRef = useRef(false);

  function handleDBProgress({
    completedRows,
    totalRows,
  }: {
    completedRows: number;
    totalRows: number;
  }) {
    loadingProgressRef.current = completedRows / totalRows;
  }

  function startTask(text: string) {
    loadingProgressRef.current = 0;
    setLoadingText(text);
    setIsLoading(true);
    backgroundTaskRunningRef.current = true;
  }

  function endTask() {
    setIsLoading(false);
    backgroundTaskRunningRef.current = false;
  }

  /** Session expired server side, drop it so AuthGate asks the user to log in again */
  function handleExpired() {
    clearSession();
    setError(new Error("Sua sessão expirou, faça login novamente"));
  }

  async function handleSave() {
    if (!session) {
      return;
    }
    startTask("Salvando no servidor");
    try {
      const buffer = await worker.exportAllData(
        Comlink.proxy(handleDBProgress) as any
      );
      await uploadBackup(session.token, new Blob([buffer.buffer]));
      addToast("Mapas e tokens salvos no servidor");
    } catch (e) {
      if (e instanceof Error) {
        if (e.message === "Not logged in") {
          handleExpired();
        } else {
          console.error(e);
          setError(e);
        }
      }
    }
    endTask();
  }

  async function handleLoad() {
    if (!session) {
      return;
    }
    startTask("Carregando do servidor");
    try {
      const backup = await downloadBackup(session.token);
      if (!backup) {
        setError(new Error("Nenhum backup salvo ainda — use Salvar no Servidor primeiro"));
        endTask();
        return;
      }
      await worker.importAllData(
        backup,
        Comlink.proxy(handleDBProgress) as any
      );
      addToast("Mapas e tokens carregados, atualizando");
      // The app caches database contents in React state, a refresh is the
      // cheapest way to make every context pick up the restored data.
      // ponytail: reload instead of invalidating each context, revisit if the
      // restore ever needs to happen mid game.
      setTimeout(() => window.location.reload(), 1000);
      return;
    } catch (e) {
      if (e instanceof Error) {
        if (e.message === "Not logged in") {
          handleExpired();
        } else {
          console.error(e);
          setError(e);
        }
      }
    }
    endTask();
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
      style={{ content: { maxWidth: "360px", width: "100%" } }}
    >
      <Flex sx={{ flexDirection: "column", flexGrow: 1 }} m={2}>
        <Box>
          <Text as="h2" variant="heading" sx={{ fontSize: 3 }} mb={2}>
            Backup no servidor
          </Text>
          <Text as="p" mb={2} variant="body2">
            Conectado como <b>{session?.displayName}</b>. Salve seus mapas e
            tokens no servidor para carregá-los em qualquer outro computador.
          </Text>
          <Flex sx={{ gap: 2 }} mb={2}>
            <Button variant="primary" sx={{ flexGrow: 1 }} onClick={handleSave}>
              Salvar no servidor
            </Button>
            <Button variant="primary" sx={{ flexGrow: 1 }} onClick={handleLoad}>
              Carregar do servidor
            </Button>
          </Flex>
          <Text as="p" mb={2} variant="caption">
            Carregar substitui mapas e tokens que compartilham um id com o
            backup, e atualiza a página.
          </Text>
        </Box>
        {isLoading && (
          <Box
            sx={{
              width: "100%",
              height: "100%",
              position: "absolute",
              top: 0,
              left: 0,
            }}
          >
            <LoadingOverlay bg="overlay" />
            <Box sx={{ zIndex: 3, position: "absolute", width: "100%" }}>
              <LoadingBar
                isLoading={isLoading}
                loadingProgressRef={loadingProgressRef}
              />
              <Text
                variant="caption"
                sx={{ display: "block", textAlign: "center" }}
              >
                {loadingText}
              </Text>
            </Box>
          </Box>
        )}
        <ErrorBanner error={error} onRequestClose={() => setError(undefined)} />
      </Flex>
    </Modal>
  );
}

export default AccountModal;
