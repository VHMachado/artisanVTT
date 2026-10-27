import { useState, useEffect } from "react";
import { Box, Label, Flex, Button, Checkbox, Text } from "theme-ui";
import prettyBytes from "pretty-bytes";

import Slider from "../components/Slider";
import LoadingOverlay from "../components/LoadingOverlay";
import Divider from "../components/Divider";

import { useUserId } from "../contexts/UserIdContext";
import { useDatabase } from "../contexts/DatabaseContext";

import useSetting from "../hooks/useSetting";

import ConfirmModal from "./ConfirmModal";
import ImportExportModal from "./ImportExportModal";
import MonsterArtLocalModal from "./MonsterArtLocalModal";

import { MapState } from "../types/MapState";

const SECTION_LABEL_STYLE = { fontSize: 0, fontWeight: "heading", color: "gray" } as const;
const SLIDER_LABEL_STYLE = { flexDirection: "column", alignItems: "stretch" } as const;

/**
 * Content of the Popover anchored on the dock's gear button (MapDock.tsx)
 * — moved out of a centered Modal. It only mounts
 * while that panel is open, so the storage-estimate effect below needs no
 * `isOpen` gate of its own: mounting IS the open event.
 *
 * Follows DESIGN.md's modal/typography conventions (`h2`/`heading` title,
 * `caption`/`gray` section labels, a `fill` divider) and is entirely
 * pt-BR, matching the rest of the app (this used to be the one
 * English-only surface — "Settings", "Clear Cache" — before this pass).
 *
 * The sub-dialogs (erase-everything confirm, import/export) stay real
 * Modals rather than nested Popover content — a
 * modal nested in a popover is how you get a panel that
 * closes itself mid-import.
 */
export default function SettingsModal() {
  const { database, databaseStatus } = useDatabase();
  const userId = useUserId();

  const [confirmingErase, setConfirmingErase] = useState(false);
  const [importExportOpen, setImportExportOpen] = useState(false);
  const [monsterArtModalOpen, setMonsterArtModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const [labelSize, setLabelSize] = useSetting<number>("map.labelSize");
  const [snapSensitivity, setSnapSensitivity] = useSetting<number>(
    "map.gridSnappingSensitivity"
  );
  const [showFogGuides, setShowFogGuides] = useSetting<boolean>("fog.showGuides");
  const [fogEditOpacity, setFogEditOpacity] = useSetting<number>("fog.editOpacity");

  const [storageEstimate, setStorageEstimate] = useState<StorageEstimate>();

  useEffect(() => {
    if (!navigator.storage) {
      return;
    }

    async function measureStorage() {
      // Firefox excludes persisted data from the quota it reports here —
      // showing that number would understate real usage, so skip it.
      const isPersistedAndFirefox =
        (await navigator.storage.persisted()) &&
        navigator.userAgent.toLowerCase().includes("firefox");
      if (isPersistedAndFirefox) {
        return;
      }
      setStorageEstimate(await navigator.storage.estimate());
    }

    measureStorage();
  }, []);

  async function eraseEverythingAndReload() {
    setBusy(true);
    try {
      localStorage.clear();
      database?.close();
      await database?.delete();
    } catch {
      // A failed delete shouldn't block the reload below — worst case
      // the user retries, rather than getting stuck in a broken state.
    } finally {
      window.location.reload();
    }
  }

  /** Drop asset rows this browser doesn't own AND no map/token on hand
   * still points at (safe to redownload later), then repair map states
   * still carrying the pre-Fase-30 `fogShapes` field name. */
  async function pruneUnusedAssetsAndReload() {
    setBusy(true);
    localStorage.clear();

    if (database && userId) {
      const foreignAssets = await database
        .table("assets")
        .where("owner")
        .notEqual(userId)
        .toArray();
      const allStates: MapState[] = await database.table("states").toArray();

      const isAssetStillPlaced = (assetId: string) =>
        allStates.some((state) =>
          Object.values(state.tokens).some(
            (tokenState) => tokenState.type === "file" && tokenState.file === assetId
          )
        );

      for (const asset of foreignAssets) {
        if (!isAssetStillPlaced(asset.id)) {
          await database.table("assets").delete(asset.id);
        }
      }

      for (const state of allStates) {
        const legacyState = state as any;
        if (legacyState.fogShapes) {
          await database.table("states").update(state.mapId, {
            fogShapes: undefined,
            fogs: legacyState.fogShapes,
          });
        }
      }
    }

    window.location.reload();
  }

  const storagePercentUsed = storageEstimate
    ? Math.round(
        ((storageEstimate.usage as number) /
          Math.max(storageEstimate.quota as number, 1)) *
          100
      )
    : 0;

  return (
    <>
      <Box p={3} sx={{ width: "360px", maxWidth: "calc(100vw - 24px)" }}>
        <Flex sx={{ flexDirection: "column", flexGrow: 1 }}>
          <Text as="h2" variant="heading" mb={2} sx={{ fontSize: 3 }}>
            Configurações
          </Text>

          <Text mb={2} sx={SECTION_LABEL_STYLE}>
            Acessibilidade
          </Text>
          <Label py={2}>
            <Checkbox
              checked={showFogGuides}
              onChange={(event) => setShowFogGuides(event.target.checked)}
            />
            Mostrar guias de névoa
          </Label>
          <Label py={2} sx={SLIDER_LABEL_STYLE}>
            <Text as="span" variant="body2" mb={1}>
              Opacidade ao editar névoa
            </Text>
            <Slider
              min={0}
              max={1}
              step={0.05}
              value={fogEditOpacity}
              onChange={(event) => setFogEditOpacity(parseFloat(event.target.value))}
              labelFunc={(value: number) => `${Math.round(value * 100)}%`}
            />
          </Label>
          <Label py={2} sx={SLIDER_LABEL_STYLE}>
            <Text as="span" variant="body2" mb={1}>
              Tamanho do rótulo do token
            </Text>
            <Slider
              min={1}
              max={3}
              step={0.5}
              value={labelSize}
              onChange={(event) => setLabelSize(parseFloat(event.target.value))}
              labelFunc={(value: number) => `${value}x`}
            />
          </Label>
          <Label py={2} sx={SLIDER_LABEL_STYLE}>
            <Text as="span" variant="body2" mb={1}>
              Sensibilidade do encaixe na grade
            </Text>
            <Slider
              min={0}
              max={0.5}
              step={0.05}
              value={snapSensitivity}
              onChange={(event) => setSnapSensitivity(parseFloat(event.target.value))}
              labelFunc={(value: number) => `${value * 2}`}
            />
          </Label>

          <Divider fill sx={{ my: 3 }} />

          <Flex sx={{ flexDirection: "column", gap: 2 }}>
            <Button
              variant="primary"
              disabled={databaseStatus !== "loaded"}
              onClick={() => setImportExportOpen(true)}
            >
              Importar / Exportar dados
            </Button>
            <Button variant="primary" disabled={!database} onClick={pruneUnusedAssetsAndReload}>
              Limpar cache
            </Button>
            <Button variant="primary" onClick={() => setMonsterArtModalOpen(true)}>
              Arte local de monstros
            </Button>
            <Button
              variant="danger"
              disabled={!database}
              onClick={() => setConfirmingErase(true)}
            >
              Apagar todo o conteúdo e reiniciar
            </Button>
          </Flex>

          {storageEstimate && (
            <Text variant="caption" mt={3} sx={{ display: "block", textAlign: "center" }}>
              Armazenamento usado: {prettyBytes(storageEstimate.usage as number)} de{" "}
              {prettyBytes(storageEstimate.quota as number)} ({storagePercentUsed}%)
            </Text>
          )}
          {busy && <LoadingOverlay bg="overlay" />}
        </Flex>
      </Box>
      <ConfirmModal
        isOpen={confirmingErase}
        onRequestClose={() => setConfirmingErase(false)}
        onConfirm={eraseEverythingAndReload}
        label="Apagar todo o conteúdo?"
        description="Isso remove todos os dados, incluindo mapas e tokens salvos."
        confirmText="Apagar"
      />
      <ImportExportModal
        isOpen={importExportOpen}
        onRequestClose={() => setImportExportOpen(false)}
      />
      <MonsterArtLocalModal
        isOpen={monsterArtModalOpen}
        onRequestClose={() => setMonsterArtModalOpen(false)}
      />
    </>
  );
}
