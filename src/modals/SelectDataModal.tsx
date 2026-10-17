import React, { useEffect, useState } from "react";
import { Box, Label, Flex, Button, Text, Checkbox } from "theme-ui";
import SimpleBar from "simplebar-react";

import Modal from "../components/Modal";
import LoadingOverlay from "../components/LoadingOverlay";
import Divider from "../components/Divider";

import { getDatabase } from "../database";

import { Map } from "../types/Map";
import { Group } from "../types/Group";
import { MapState } from "../types/MapState";
import { Token } from "../types/Token";
import { RequestCloseEventHandler } from "../types/Events";

/** One selectable row (a map or a token) in the picker list. */
export interface SelectData {
  name: string;
  id: string;
  type: "default" | "file";
  checked: boolean;
}

export type ConfirmDataEventHandler = (
  checkedMaps: SelectData[],
  checkedTokens: SelectData[],
  checkedMapGroups: Group[],
  checkedTokenGroups: Group[]
) => void;

interface SelectDataProps {
  isOpen: boolean;
  onRequestClose: RequestCloseEventHandler;
  onConfirm: ConfirmDataEventHandler;
  confirmText?: string;
  label?: string;
  databaseName?: string;
  filter?: (table: string, data: Map | MapState | Token, id: string) => boolean;
}

type ById = Record<string, SelectData>;
type ChangeEvent = React.ChangeEvent<HTMLInputElement>;

interface LoadedLibrary {
  mapsById: ById;
  mapGroups: Group[];
  tokenIdsByMapId: Record<string, Set<string>>;
  tokensById: ById;
  tokenGroups: Group[];
}

const EMPTY_LIBRARY: LoadedLibrary = {
  mapsById: {},
  mapGroups: [],
  tokenIdsByMapId: {},
  tokensById: {},
  tokenGroups: [],
};

/** Opens `databaseName` read-only, pulls every map/token/group row this
 * `filter` lets through, and closes it again — called once per time the
 * picker is opened on a (possibly freshly-populated) staging database. */
async function loadLibrary(
  databaseName: string,
  filter: NonNullable<SelectDataProps["filter"]>
): Promise<LoadedLibrary> {
  const db = getDatabase({ addons: [] }, databaseName);

  const mapsById: ById = {};
  await db
    .table("maps")
    .filter((map: Map) => filter("maps", map, map.id))
    .each((map: Map) => {
      mapsById[map.id] = { name: map.name, id: map.id, type: map.type, checked: true };
    });

  const tokenIdsByMapId: Record<string, Set<string>> = {};
  await db
    .table("states")
    .filter((state: MapState) => filter("states", state, state.mapId))
    .each((state: MapState) => {
      tokenIdsByMapId[state.mapId] = new Set(
        Object.values(state.tokens).map((tokenState) => tokenState.tokenId)
      );
    });

  const tokensById: ById = {};
  await db
    .table("tokens")
    .filter((token: Token) => filter("tokens", token, token.id))
    .each((token: Token) => {
      tokensById[token.id] = {
        name: token.name,
        id: token.id,
        type: token.type,
        checked: true,
      };
    });

  const mapGroups = (await db.table("groups").get("maps")).items;
  const tokenGroups = (await db.table("groups").get("tokens")).items;
  db.close();

  return { mapsById, mapGroups, tokenIdsByMapId, tokensById, tokenGroups };
}

/** How many currently-checked maps reference each token id — a token at
 * count > 0 must stay checked, since dropping it would leave one of
 * those maps pointing at nothing. */
function countMapUsagePerToken(
  mapsById: ById,
  tokenIdsByMapId: Record<string, Set<string>>
): Record<string, number> {
  const usage: Record<string, number> = {};
  for (const mapId in mapsById) {
    if (!mapsById[mapId].checked || !(mapId in tokenIdsByMapId)) {
      continue;
    }
    for (const tokenId of tokenIdsByMapId[mapId]) {
      usage[tokenId] = (usage[tokenId] ?? 0) + 1;
    }
  }
  return usage;
}

/** Walks `groups`, keeping only checked leaves (and whole groups with at
 * least one checked leaf, items trimmed to just those) — this is what
 * actually gets exported/imported alongside the flat checked lists. */
function pruneToChecked(groups: Group[], byId: ById): Group[] {
  const kept: Group[] = [];
  for (const group of groups) {
    if (group.type === "item") {
      if (byId[group.id]?.checked) {
        kept.push(group);
      }
      continue;
    }
    const items = group.items.filter((item) => byId[item.id]?.checked);
    if (items.length > 0) {
      kept.push({ ...group, items });
    }
  }
  return kept;
}

/**
 * One row of the generic checkbox tree below: either a leaf (a map or a
 * token) or a GroupContainer rendering its own children recursively. The
 * caller supplies everything that differs between the maps tree and the
 * tokens tree through `LeafConfig`.
 */
interface LeafConfig {
  byId: ById;
  isLeafPresent: (id: string) => boolean;
  isLeafChecked: (id: string) => boolean;
  onToggleLeaves: (event: ChangeEvent, ids: string[]) => void;
  renderLeafExtra?: (id: string) => React.ReactNode;
  isLeafDisabled?: (id: string) => boolean;
}

function GroupTree({ group, config }: { group: Group; config: LeafConfig }): JSX.Element | null {
  const { byId, isLeafPresent, isLeafChecked, onToggleLeaves, renderLeafExtra, isLeafDisabled } =
    config;

  if (group.type === "item") {
    const item = byId[group.id];
    if (!item) {
      return null;
    }
    return (
      <Box pl={4} my={1} key={item.id}>
        <Label sx={{ fontFamily: "body2" }}>
          <Checkbox
            checked={isLeafChecked(item.id)}
            disabled={isLeafDisabled?.(item.id)}
            onChange={(event: ChangeEvent) => onToggleLeaves(event, [item.id])}
          />
          {item.name}
        </Label>
        {renderLeafExtra?.(item.id)}
      </Box>
    );
  }

  const presentIds = group.items.map((item) => item.id).filter(isLeafPresent);
  if (presentIds.length === 0) {
    return null;
  }
  const groupChecked = presentIds.some(isLeafChecked);

  return (
    <Flex
      ml={4}
      key={group.id}
      sx={{ flexWrap: "wrap", borderRadius: "4px", flexDirection: "column", position: "relative" }}
    >
      <Label my={1} sx={{ fontFamily: "body2" }}>
        <Checkbox
          checked={groupChecked}
          onChange={(event: ChangeEvent) => onToggleLeaves(event, presentIds)}
        />
        {group.name}
      </Label>
      <Flex sx={{ flexWrap: "wrap", flexDirection: "column", position: "relative" }}>
        {group.items.map((child) => (
          <GroupTree key={child.id} group={child} config={config} />
        ))}
        <Box sx={{ position: "absolute", left: "2px", top: 0, height: "100%" }}>
          <Divider vertical fill />
        </Box>
      </Flex>
    </Flex>
  );
}

/**
 * Checkbox tree over a Dexie database's maps/tokens, grouped the same
 * way the library sidebar groups them (types/Group.ts). The import flow
 * points `databaseName` at a staging database DatabaseWorker's
 * `importData` just populated; the export flow leaves it at the default
 * live `ArtisanDB` — see ImportExportModal.tsx for both.
 *
 * A token referenced by at least one currently-checked map is
 * force-checked with its own checkbox disabled: exporting/importing that
 * map without the token would leave a dangling reference behind.
 */
export default function SelectDataModal({
  isOpen,
  onRequestClose,
  onConfirm,
  confirmText = "Confirmar",
  label = "Selecionar dados",
  databaseName = "ArtisanDB",
  filter = () => true,
}: SelectDataProps) {
  const [library, setLibrary] = useState<LoadedLibrary>(EMPTY_LIBRARY);
  const [mapsById, setMapsById] = useState<ById>({});
  const [tokensById, setTokensById] = useState<ById>({});
  const [isLoading, setIsLoading] = useState(false);

  const hasMaps = Object.keys(mapsById).length > 0;
  const hasTokens = Object.keys(tokensById).length > 0;

  useEffect(() => {
    if (!isOpen || !databaseName) {
      setLibrary(EMPTY_LIBRARY);
      setMapsById({});
      setTokensById({});
      return;
    }
    setIsLoading(true);
    loadLibrary(databaseName, filter).then((loaded) => {
      setLibrary(loaded);
      setMapsById(loaded.mapsById);
      setTokensById(loaded.tokensById);
      setIsLoading(false);
    });
  }, [isOpen, databaseName, filter]);

  const mapUsageByTokenId = countMapUsagePerToken(mapsById, library.tokenIdsByMapId);

  useEffect(() => {
    // Any token now in use gets force-checked — defaults are exempt, they
    // carry no asset that could go missing.
    setTokensById((current) => {
      const next = { ...current };
      let changed = false;
      for (const id in next) {
        if (id in mapUsageByTokenId && next[id].type !== "default" && !next[id].checked) {
          next[id] = { ...next[id], checked: true };
          changed = true;
        }
      }
      return changed ? next : current;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapUsageByTokenId]);

  function toggleMaps(event: ChangeEvent, ids: string[]) {
    const checked = event.target.checked;
    setMapsById((current) => {
      const next = { ...current };
      for (const id of ids) {
        next[id] = { ...next[id], checked };
      }
      return next;
    });

    if (checked) {
      return;
    }
    // Unchecking a map may free up tokens that were only force-checked
    // because THIS map referenced them.
    setTokensById((current) => {
      const remaining = { ...mapUsageByTokenId };
      const next = { ...current };
      for (const mapId of ids) {
        for (const tokenId of library.tokenIdsByMapId[mapId] ?? []) {
          if (remaining[tokenId] > 1) {
            remaining[tokenId] -= 1;
          } else if (remaining[tokenId] === 1) {
            remaining[tokenId] = 0;
            next[tokenId] = { ...next[tokenId], checked: false };
          }
        }
      }
      return next;
    });
  }

  function toggleTokens(event: ChangeEvent, ids: string[]) {
    const checked = event.target.checked;
    setTokensById((current) => {
      const next = { ...current };
      for (const id of ids) {
        // A token locked by map usage ignores a direct toggle — its
        // checkbox is already disabled, this is just belt-and-braces.
        if (!(id in mapUsageByTokenId) || next[id].type === "default") {
          next[id] = { ...next[id], checked };
        }
      }
      return next;
    });
  }

  function confirmSelection() {
    onConfirm(
      Object.values(mapsById).filter((map) => map.checked),
      Object.values(tokensById).filter((token) => token.checked),
      pruneToChecked(library.mapGroups, mapsById),
      pruneToChecked(library.tokenGroups, tokensById)
    );
  }

  const mapsConfig: LeafConfig = {
    byId: mapsById,
    isLeafPresent: (id) => id in mapsById,
    isLeafChecked: (id) => !!mapsById[id]?.checked,
    onToggleLeaves: toggleMaps,
  };

  // "Tokens" section header reads checked if either something
  // map-independent is checked, or every token is map-controlled
  // (nothing left for the header to toggle on its own).
  const allTokensEffectivelyChecked =
    Object.values(tokensById).some(
      (token) => !(token.id in mapUsageByTokenId) && token.checked
    ) || Object.values(tokensById).every((token) => token.id in mapUsageByTokenId);

  const tokensConfig: LeafConfig = {
    byId: tokensById,
    isLeafPresent: (id) => id in tokensById,
    isLeafChecked: (id) => !!tokensById[id]?.checked,
    isLeafDisabled: (id) =>
      tokensById[id]?.type !== "default" && id in mapUsageByTokenId,
    onToggleLeaves: toggleTokens,
    renderLeafExtra: (id) => {
      const usageCount = mapUsageByTokenId[id];
      if (!usageCount || tokensById[id]?.type === "default") {
        return null;
      }
      return (
        <Text as="p" variant="caption" ml={4}>
          Token usado em {usageCount} mapa
          {usageCount > 1 && "s"} selecionado
          {usageCount > 1 && "s"}
        </Text>
      );
    },
  };

  return (
    <Modal
      isOpen={isOpen}
      onRequestClose={onRequestClose}
      style={{ content: { maxWidth: "450px", width: "100%" } }}
    >
      <Box sx={{ flexDirection: "column", justifyContent: "center", width: "100%", flexGrow: 1 }} m={2}>
        <Text as="h2" variant="heading" sx={{ fontSize: 3 }} mb={2}>
          {label}
        </Text>
        {!hasMaps && !hasTokens && (
          <Text as="p" mb={2} variant="body2">
            Nenhum mapa ou token personalizado encontrado.
          </Text>
        )}
        <SimpleBar style={{ maxHeight: "300px" }}>
          <Flex p={2} bg="muted" sx={{ flexWrap: "wrap", borderRadius: "4px", flexDirection: "column" }}>
            {hasMaps && (
              <>
                <Flex>
                  <Label>
                    <Checkbox
                      checked={Object.values(mapsById).some((map) => map.checked)}
                      onChange={(event: ChangeEvent) =>
                        toggleMaps(event, Object.keys(mapsById))
                      }
                    />
                    Mapas
                  </Label>
                </Flex>
                {library.mapGroups.map((group) => (
                  <GroupTree key={group.id} group={group} config={mapsConfig} />
                ))}
              </>
            )}
            {hasMaps && hasTokens && <Divider fill />}
            {hasTokens && (
              <>
                <Label>
                  <Checkbox
                    checked={allTokensEffectivelyChecked}
                    onChange={(event: ChangeEvent) =>
                      toggleTokens(event, Object.keys(tokensById))
                    }
                  />
                  Tokens
                </Label>
                {library.tokenGroups.map((group) => (
                  <GroupTree key={group.id} group={group} config={tokensConfig} />
                ))}
              </>
            )}
          </Flex>
        </SimpleBar>
        <Flex py={2} sx={{ gap: 2 }}>
          <Button sx={{ flexGrow: 1 }} onClick={onRequestClose}>
            Cancelar
          </Button>
          <Button
            disabled={
              !Object.values(mapsById).some((map) => map.checked) &&
              !Object.values(tokensById).some((token) => token.checked)
            }
            sx={{ flexGrow: 1 }}
            onClick={confirmSelection}
          >
            {confirmText}
          </Button>
        </Flex>
        {isLoading && <LoadingOverlay bg="overlay" />}
      </Box>
    </Modal>
  );
}
