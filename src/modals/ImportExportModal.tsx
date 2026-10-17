import { useState, useRef, useEffect } from "react";
import { Box, Text, Button, Flex } from "theme-ui";
import { useToasts } from "react-toast-notifications";
import * as Comlink from "comlink";
import { saveAs } from "file-saver";
import { v4 as uuid } from "uuid";
import shortid from "shortid";

import ErrorBanner from "../components/banner/ErrorBanner";
import LoadingOverlay from "../components/LoadingOverlay";
import LoadingBar from "../components/LoadingBar";
import Modal from "../components/Modal";

import { useDatabase } from "../contexts/DatabaseContext";
import { useUserId } from "../contexts/UserIdContext";

import SelectDataModal, { SelectData } from "./SelectDataModal";

import { getDatabase } from "../database";
import type { Map, FileMap } from "../types/Map";
import type { MapState } from "../types/MapState";
import type { Token } from "../types/Token";
import type { Group } from "../types/Group";
import type { RequestCloseEventHandler } from "../types/Events";
import type { Asset } from "../types/Asset";

// Scratch database an uploaded `.artisan` file lands in before the user
// picks what to keep — DatabaseWorker's `importData` populates it,
// SelectDataModal browses it by this name.
const STAGING_DB_NAME = "ArtisanImportDB";

/** Every id a fresh import mints, and the lookup tables needed to rewrite
 * cross-references (a map state pointing at a token, a token pointing at
 * its own file asset) to the new ids instead of the staged ones. */
interface RemapTables {
  tokenIds: Map2<string>;
  mapIds: Map2<string>;
  assetIds: Map2<string>;
  /** Which map/token an asset id belonged to — so a missing asset can be
   * traced back to the one item it would otherwise corrupt. */
  assetOwner: Map2<{ kind: "map" | "token"; sourceId: string; sourceName: string; newId: string }>;
}
// Local alias: avoids a name clash with the imported `Map` (types/Map.ts)
// while keeping the lookup tables above readable as plain objects.
type Map2<T> = Record<string, T>;

function newRemapTables(): RemapTables {
  return { tokenIds: {}, mapIds: {}, assetIds: {}, assetOwner: {} };
}

/** Clones every checked token with a fresh id, rewriting its file/thumb
 * asset ids and recording everything `RemapTables` needs for later steps.
 * Default (non-file) tokens pass through untouched aside from ownership. */
function remapTokens(
  staged: Token[],
  ownerId: string,
  remap: RemapTables
): Token[] {
  return staged.map((token) => {
    const newId = uuid();
    remap.tokenIds[token.id] = newId;

    if (token.type === "default") {
      return { ...token, id: newId, owner: ownerId };
    }

    const newFileId = uuid();
    const newThumbnailId = uuid();
    remap.assetIds[token.file] = newFileId;
    remap.assetIds[token.thumbnail] = newThumbnailId;
    for (const oldAssetId of [token.file, token.thumbnail]) {
      remap.assetOwner[oldAssetId] = {
        kind: "token",
        sourceId: token.id,
        sourceName: token.name,
        newId,
      };
    }

    return {
      ...token,
      id: newId,
      owner: ownerId,
      file: newFileId,
      thumbnail: newThumbnailId,
    };
  });
}

/** Mirrors `remapTokens` for maps, additionally rewriting the placed
 * tokens recorded in each map's state (ids and ownership) and the
 * multi-resolution asset set a file-backed map may carry. */
async function remapMaps(
  staged: Map[],
  staging: ReturnType<typeof getDatabase>,
  ownerId: string,
  remap: RemapTables
): Promise<{ maps: Map[]; states: MapState[] }> {
  const maps: Map[] = [];
  const states: MapState[] = [];

  for (const map of staged) {
    const state: MapState = await staging.table("states").get(map.id);
    rewritePlacedTokens(state, map, ownerId, remap);

    const newId = uuid();
    remap.mapIds[map.id] = newId;

    if (map.type === "default") {
      maps.push({ ...map, id: newId, owner: ownerId });
    } else {
      maps.push(remapFileMap(map, newId, ownerId, remap));
    }
    states.push({ ...state, mapId: newId });
  }

  return { maps, states };
}

function rewritePlacedTokens(
  state: MapState,
  map: Map,
  ownerId: string,
  remap: RemapTables
) {
  for (const tokenState of Object.values(state.tokens)) {
    if (tokenState.tokenId in remap.tokenIds) {
      tokenState.tokenId = remap.tokenIds[tokenState.tokenId];
    }
    if (tokenState.type === "file" && tokenState.file in remap.assetIds) {
      tokenState.file = remap.assetIds[tokenState.file];
    }
    if (tokenState.owner === map.owner) {
      tokenState.owner = ownerId;
    }
  }
}

function remapFileMap(map: FileMap, newId: string, ownerId: string, remap: RemapTables): Map {
  const newFileId = uuid();
  const newThumbnailId = uuid();
  remap.assetIds[map.file] = newFileId;
  remap.assetIds[map.thumbnail] = newThumbnailId;
  for (const oldAssetId of [map.file, map.thumbnail]) {
    remap.assetOwner[oldAssetId] = {
      kind: "map",
      sourceId: map.id,
      sourceName: map.name,
      newId,
    };
  }

  const newResolutions: Record<string, string> = {};
  for (const [resolutionKey, oldAssetId] of Object.entries(map.resolutions)) {
    const newAssetId = uuid();
    newResolutions[resolutionKey] = newAssetId;
    remap.assetIds[oldAssetId] = newAssetId;
    remap.assetOwner[oldAssetId] = {
      kind: "map",
      sourceId: map.id,
      sourceName: map.name,
      newId,
    };
  }

  return {
    ...map,
    id: newId,
    owner: ownerId,
    file: newFileId,
    thumbnail: newThumbnailId,
    resolutions: newResolutions,
  };
}

/** Resolves every asset id `remap.assetIds` expects against the staging
 * database; anything NOT found there (a corrupt or partial export) is
 * reported back so its owning map/token can be dropped whole rather than
 * imported with a dangling reference. */
async function resolveAssets(
  staging: ReturnType<typeof getDatabase>,
  ownerId: string,
  remap: RemapTables
): Promise<{ assets: Asset[]; missingOwners: RemapTables["assetOwner"][string][] }> {
  const wantedIds = Object.keys(remap.assetIds);
  const staged: Asset[] | undefined = await staging.table("assets").bulkGet(wantedIds);
  const found = new Set((staged ?? []).filter(Boolean).map((a) => a!.id));

  const assets = (staged ?? [])
    .filter((asset): asset is Asset => !!asset)
    .map((asset) => ({ ...asset, id: remap.assetIds[asset.id], owner: ownerId }));

  const missingOwnersById: Map2<RemapTables["assetOwner"][string]> = {};
  for (const assetId of wantedIds) {
    if (found.has(assetId)) {
      continue;
    }
    const owner = remap.assetOwner[assetId];
    missingOwnersById[owner.sourceId] = owner;
  }

  return { assets, missingOwners: Object.values(missingOwnersById) };
}

/** Removes a map or token (plus its state, for a map) from the about-to-be
 * -written arrays, because one of its assets failed to resolve above. */
function dropOrphanedItems(
  maps: Map[],
  states: MapState[],
  tokens: Token[],
  missingOwners: RemapTables["assetOwner"][string][]
): { droppedMaps: number; droppedTokens: number } {
  let droppedMaps = 0;
  let droppedTokens = 0;
  for (const owner of missingOwners) {
    if (owner.kind === "map") {
      droppedMaps += spliceById(maps, owner.newId) ? 1 : 0;
      spliceById(states, owner.newId, "mapId");
    } else {
      droppedTokens += spliceById(tokens, owner.newId) ? 1 : 0;
    }
  }
  return { droppedMaps, droppedTokens };
}

function spliceById<T extends Record<string, any>>(
  list: T[],
  id: string,
  key: keyof T = "id" as keyof T
): boolean {
  const index = list.findIndex((item) => item[key] === id);
  if (index === -1) {
    return false;
  }
  list.splice(index, 1);
  return true;
}

/** New top-level groups for the maps/tokens this import kept, with every
 * member id rewritten through the relevant remap table. Un-grouped
 * (`"item"`) entries just get their own id swapped. */
function remapGroups(checkedGroups: Group[], idsByOldId: Map2<string>): Group[] {
  return checkedGroups.map((group) =>
    group.type === "item"
      ? { ...group, id: idsByOldId[group.id] }
      : {
          ...group,
          id: uuid(),
          items: group.items.map((item) => ({ ...item, id: idsByOldId[item.id] })),
        }
  );
}

async function prependToGroupTable(
  db: ReturnType<typeof getDatabase>,
  tableKey: "maps" | "tokens",
  newGroups: Group[]
) {
  if (newGroups.length === 0) {
    return;
  }
  const existing = await db.table("groups").get(tableKey);
  await db.table<Group>("groups").update(tableKey, {
    items: [...newGroups, ...existing.items],
  });
}

interface ImportExportModalProps {
  isOpen: boolean;
  onRequestClose: RequestCloseEventHandler;
}

export default function ImportExportModal({ isOpen, onRequestClose }: ImportExportModalProps) {
  const { worker } = useDatabase();
  const userId = useUserId();

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error>();

  const taskInFlightRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [importSelectorOpen, setImportSelectorOpen] = useState(false);
  const [exportSelectorOpen, setExportSelectorOpen] = useState(false);

  const { addToast } = useToasts();

  function announceCompletion(verb: string, mapCount: number, tokenCount: number) {
    const mapPhrase = `${mapCount} mapa${mapCount > 1 ? "s" : ""}`;
    const tokenPhrase = `${tokenCount} token${tokenCount > 1 ? "s" : ""}`;
    if (mapCount > 0 && tokenCount > 0) {
      addToast(`${verb} ${mapPhrase} e ${tokenPhrase}`);
    } else if (mapCount > 0) {
      addToast(`${verb} ${mapPhrase}`);
    } else if (tokenCount > 0) {
      addToast(`${verb} ${tokenPhrase}`);
    }
  }

  function announceSkipped(verb: string, itemNames: string[]) {
    const joined = itemNames.length <= 1 ? itemNames[0] ?? "" : itemNames.join(", ");
    addToast(
      <span>
        {verb} <b>{joined}</b>
      </span>,
      { appearance: "warning", autoDismiss: true }
    );
  }

  function openFileDialog() {
    fileInputRef.current?.click();
  }

  const loadingProgressRef = useRef(0);

  function trackDbProgress({
    completedRows,
    totalRows,
  }: {
    completedRows: number;
    totalRows: number;
  }) {
    loadingProgressRef.current = completedRows / totalRows;
  }

  async function stageUploadedFile(file: File) {
    setIsLoading(true);
    taskInFlightRef.current = true;
    try {
      await worker.importData(file, STAGING_DB_NAME, Comlink.proxy(trackDbProgress) as any);
      setIsLoading(false);
      setImportSelectorOpen(true);
      taskInFlightRef.current = false;
    } catch (e) {
      setIsLoading(false);
      taskInFlightRef.current = false;
      if (e instanceof Error) {
        if (e.message.startsWith("Max buffer length exceeded")) {
          setError(
            new Error(
              "Tamanho máximo de imagem excedido — verifique se seu banco de dados não tem uma imagem maior que 100MB"
            )
          );
        } else {
          console.error(e);
          setError(e);
        }
      }
    }
    // Clearing the input lets the same file be chosen twice in a row —
    // the browser otherwise treats an unchanged value as "nothing picked".
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  function openExportPicker() {
    setExportSelectorOpen(true);
  }

  useEffect(() => {
    function warnBeforeLeaving(event: BeforeUnloadEvent) {
      if (taskInFlightRef.current) {
        event.returnValue =
          "Database is still processing, are you sure you want to leave?";
      }
    }
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, []);

  function closeModal() {
    if (!isLoading) {
      onRequestClose();
    }
  }

  async function discardStagingDatabase() {
    const staging = getDatabase({ addons: [] }, STAGING_DB_NAME);
    await staging.delete();
    staging.close();
    setImportSelectorOpen(false);
  }

  async function mergeSelectedImport(
    checkedMaps: SelectData[],
    checkedTokens: SelectData[],
    checkedMapGroups: Group[],
    checkedTokenGroups: Group[]
  ) {
    setIsLoading(true);
    taskInFlightRef.current = true;
    setImportSelectorOpen(false);
    loadingProgressRef.current = 0;

    const staging = getDatabase({ addons: [] }, STAGING_DB_NAME);
    const db = getDatabase({});
    try {
      if (!userId) {
        throw new Error("Não foi possível determinar o usuário local");
      }
      const remap = newRemapTables();

      const stagedTokens = checkedTokens.length
        ? ((await staging.table("tokens").bulkGet(checkedTokens.map((t) => t.id))).filter(
            Boolean
          ) as Token[])
        : [];
      const tokens = remapTokens(stagedTokens, userId, remap);

      const stagedMapRows = checkedMaps.length
        ? ((await staging.table("maps").bulkGet(checkedMaps.map((m) => m.id))).filter(
            Boolean
          ) as Map[])
        : [];
      const { maps, states } = await remapMaps(stagedMapRows, staging, userId, remap);

      const { assets, missingOwners } = await resolveAssets(staging, userId, remap);
      const { droppedMaps, droppedTokens } = dropOrphanedItems(
        maps,
        states,
        tokens,
        missingOwners
      );
      if (missingOwners.length > 0) {
        announceSkipped(
          "Não foi possível importar",
          missingOwners.map((owner) => owner.sourceName)
        );
      }

      const newMapGroups = remapGroups(checkedMapGroups, remap.mapIds);
      const newTokenGroups = remapGroups(checkedTokenGroups, remap.tokenIds);

      await db.transaction(
        "rw",
        [
          db.table("tokens"),
          db.table("maps"),
          db.table("states"),
          db.table("assets"),
          db.table("groups"),
        ],
        async () => {
          if (tokens.length > 0) {
            await db.table<Token>("tokens").bulkAdd(tokens);
          }
          if (maps.length > 0) {
            await db.table<Map>("maps").bulkAdd(maps);
          }
          if (states.length > 0) {
            await db.table("states").bulkAdd(states);
          }
          if (assets.length > 0) {
            await db.table<Asset>("assets").bulkAdd(assets);
          }
          await prependToGroupTable(db, "maps", newMapGroups);
          await prependToGroupTable(db, "tokens", newTokenGroups);
        }
      );

      announceCompletion(
        "Importado(s)",
        checkedMaps.length - droppedMaps,
        checkedTokens.length - droppedTokens
      );
    } catch (e) {
      console.error(e);
      setError(new Error("Não foi possível importar os dados"));
    }
    await staging.delete();
    staging.close();
    setIsLoading(false);
    taskInFlightRef.current = false;
  }

  function onlyLibraryTables(table: string) {
    return table === "maps" || table === "tokens" || table === "states" || table === "groups";
  }

  async function closeExportPicker() {
    setExportSelectorOpen(false);
  }

  async function exportSelection(checkedMaps: SelectData[], checkedTokens: SelectData[]) {
    setExportSelectorOpen(false);
    setIsLoading(true);
    taskInFlightRef.current = true;

    try {
      const buffer = await worker.exportData(
        Comlink.proxy(trackDbProgress) as any,
        checkedMaps.map((map) => map.id),
        checkedTokens.map((token) => token.id)
      );
      saveAs(new Blob([buffer.buffer]), `${shortid.generate()}.artisan`);
      announceCompletion("Exportado(s)", checkedMaps.length, checkedTokens.length);
    } catch (e: unknown) {
      if (e instanceof Error) {
        console.error(e);
        setError(e);
      }
    }
    setIsLoading(false);
    taskInFlightRef.current = false;
  }

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={closeModal}
      allowClose={!isLoading}
      style={{ content: { maxWidth: "360px", width: "100%" } }}
    >
      <Flex sx={{ flexDirection: "column", flexGrow: 1 }} m={2}>
        <Box>
          <Text as="h2" variant="heading" sx={{ fontSize: 3 }} mb={2}>
            Importar / Exportar
          </Text>
          <Text as="p" mb={2} variant="body2">
            Selecione importar ou exportar, depois escolha os dados que deseja usar.
          </Text>
          <input
            onChange={(event) => event.target.files && stageUploadedFile(event.target.files[0])}
            type="file"
            accept=".artisan"
            style={{ display: "none" }}
            ref={fileInputRef}
          />
          <Flex sx={{ gap: 2 }}>
            <Button variant="primary" sx={{ flexGrow: 1 }} onClick={openFileDialog}>
              Importar
            </Button>
            <Button variant="primary" sx={{ flexGrow: 1 }} onClick={openExportPicker}>
              Exportar
            </Button>
          </Flex>
        </Box>
        {isLoading && (
          <Box sx={{ width: "100%", height: "100%", position: "absolute", top: 0, left: 0 }}>
            <LoadingOverlay bg="overlay" />
            <Box sx={{ zIndex: 3, position: "absolute", width: "100%" }}>
              <LoadingBar isLoading={isLoading} loadingProgressRef={loadingProgressRef} />
            </Box>
          </Box>
        )}
        <ErrorBanner error={error} onRequestClose={() => setError(undefined)} />
        <SelectDataModal
          isOpen={importSelectorOpen}
          onRequestClose={discardStagingDatabase}
          onConfirm={mergeSelectedImport}
          databaseName={STAGING_DB_NAME}
          confirmText="Importar"
          label="Selecione os dados para importar"
        />
        <SelectDataModal
          isOpen={exportSelectorOpen}
          onRequestClose={closeExportPicker}
          onConfirm={exportSelection}
          confirmText="Exportar"
          label="Selecione os dados para exportar"
          filter={onlyLibraryTables}
        />
      </Flex>
    </Modal>
  );
}

