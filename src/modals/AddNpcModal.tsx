import { useEffect, useMemo, useState } from "react";
import { Box, Button, Flex, Input, Text } from "theme-ui";
import SimpleBar from "simplebar-react";

import Modal from "../components/Modal";
import NpcPickerRow from "../components/monster/NpcPickerRow";
import MonsterStatBlockModal from "./MonsterStatBlockModal";
import MonsterFormModal from "./MonsterFormModal";
import MonsterArtModal from "./MonsterArtModal";
import ConfirmModal from "./ConfirmModal";
import AddIcon from "../icons/AddIcon";

import { useAccount } from "../contexts/AccountContext";
import { useMapNpcs } from "../contexts/MapNpcsContext";

import { loadMonsterSummaries, loadMonstersByIndex } from "../5e/bestiary";
import { createMonsterSearch, searchMonsters } from "../5e/monsterSearch";
import { combineMonsterSummaries, isArtOnlyOverlay } from "../helpers/tableMonsters";
import { deleteTableMonsterLocally } from "../helpers/tablesSync";
import { useTable } from "../hooks/useTable";
import { useTableMonsters } from "../hooks/useTableMonsters";

import type { Monster, MonsterSummary } from "../types/Monster";
import type { TableMonster } from "../types/TableMonster";
import { RequestCloseEventHandler } from "../types/Events";

type AddNpcModalProps = {
  isOpen: boolean;
  onRequestClose: RequestCloseEventHandler;
  /** The Mesa whose homebrew creatures fill the Criações tab. */
  tableId: string;
  /** The map this modal's picks are added to (NpcRoster's own map). */
  mapId: string;
};

type Tab = "bestiary" | "creations";

/**
 * "Adicionar NPCs" — opened by right-clicking empty space in the NPCs tab
 * (components/party/NpcRoster.tsx), replacing the old right-hand
 * Tokens/Monstros panel's bare drag-from-bestiary flow with an explicit
 * "choose how many of which creature to put on THIS map" step, per the
 * reference modal the user provided (two tabs, a −/count/+ stepper per
 * row instead of a plain drag).
 *
 * Tab 1 "Bestiário" is the vendored SRD list (plus any per-Mesa art
 * overlay, same merge BestiaryPanel used) with a permanent first row to
 * create a homebrew creature from scratch. Tab 2 "Criações" is this
 * Mesa's homebrew/derived creatures — everything a GM already
 * built here, reusable across every map of the Mesa. Right-clicking a row
 * in either tab opens the exact same "Abrir ficha/Criar variação/Editar
 * imagens/Editar criatura" menu the old bestiary panel had.
 */
function AddNpcModal({
  isOpen,
  onRequestClose,
  tableId,
  mapId,
}: AddNpcModalProps) {
  const [tab, setTab] = useState<Tab>("bestiary");
  const [query, setQuery] = useState("");
  const [pending, setPending] = useState<Record<string, number>>({});

  const [srdSummaries, setSrdSummaries] = useState<MonsterSummary[]>([]);
  const [parents, setParents] = useState<Map<string, Monster>>(new Map());
  const [openIndex, setOpenIndex] = useState<string | null>(null);
  const [form, setForm] = useState<
    | false
    | { monster?: TableMonster; parent?: Monster; parentIndex?: string }
  >(false);
  const [artTarget, setArtTarget] = useState<
    false | { monster: Monster; overlay?: TableMonster }
  >(false);
  const [deletingMonster, setDeletingMonster] = useState<TableMonster | null>(
    null
  );

  const { session } = useAccount();
  const table = useTable(tableId);
  const tableMonsters = useTableMonsters(tableId);
  const { addMapNpcs } = useMapNpcs();

  const canManage = Boolean(
    session && table && table.ownerId === session.accountId
  );

  useEffect(() => {
    if (!isOpen) {
      return;
    }
    let cancelled = false;
    Promise.all([loadMonsterSummaries(), loadMonstersByIndex()]).then(
      ([loaded, byIndex]) => {
        if (!cancelled) {
          setSrdSummaries(loaded);
          setParents(byIndex);
        }
      }
    );
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setQuery("");
      setTab("bestiary");
      setPending({});
    }
  }, [isOpen]);

  const combined = useMemo(
    () => combineMonsterSummaries(srdSummaries, tableMonsters, parents),
    [srdSummaries, tableMonsters, parents]
  );
  const bestiarySummaries = useMemo(
    () => combined.filter((m) => m.source !== "table"),
    [combined]
  );
  const creationSummaries = useMemo(
    () => combined.filter((m) => m.source === "table"),
    [combined]
  );

  const activeSummaries = tab === "bestiary" ? bestiarySummaries : creationSummaries;
  const index = useMemo(() => createMonsterSearch(activeSummaries), [activeSummaries]);
  const results = useMemo(
    () => searchMonsters(index, activeSummaries, query),
    [index, activeSummaries, query]
  );

  // Grouping by creature type with a header only makes sense in the
  // default list (no search), since `searchMonsters` reorders by relevance
  // and a type header there would be incoherent with the result order.
  // `type` already comes from the SRD
  // ("humanoid", "beast", …) em inglês (mesma regra da stat block: dado é
  // inglês, só o chrome é traduzido) — capitalizado para header, sem
  // tradução por tipo porque o dataset não vendoriza um glossário.
  const isSearching = query.trim().length > 0;
  const groupedResults = useMemo(() => {
    if (isSearching) {
      return null;
    }
    const groups = new Map<string, MonsterSummary[]>();
    for (const monster of results) {
      const key = monster.type || "outro";
      const list = groups.get(key) || [];
      list.push(monster);
      groups.set(key, list);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [results, isSearching]);

  function countFor(monsterIndex: string): number {
    return pending[monsterIndex] || 0;
  }

  const totalPending = useMemo(
    () => Object.values(pending).reduce((sum, count) => sum + count, 0),
    [pending]
  );

  function handleIncrement(monster: MonsterSummary) {
    setPending((prev) => ({
      ...prev,
      [monster.index]: (prev[monster.index] || 0) + 1,
    }));
  }

  function handleDecrement(monster: MonsterSummary) {
    setPending((prev) => {
      const current = prev[monster.index] || 0;
      if (current <= 1) {
        const { [monster.index]: _removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [monster.index]: current - 1 };
    });
  }

  async function handleConfirm() {
    const entries = Object.entries(pending).filter(([, count]) => count > 0);
    await Promise.all(
      entries.map(([monsterIndex, count]) => addMapNpcs(mapId, monsterIndex, count))
    );
    onRequestClose();
  }

  function handleDerive(monster: MonsterSummary) {
    setForm({
      parent: parents.get(monster.index),
      parentIndex: monster.index,
    });
  }

  function handleEdit(monster: MonsterSummary) {
    const stored = tableMonsters.find((m) => m.id === monster.index);
    if (!stored) {
      return;
    }
    setForm({
      monster: stored,
      parent: stored.parentIndex ? parents.get(stored.parentIndex) : undefined,
    });
  }

  function handleEditArt(monster: MonsterSummary) {
    const srdMonster = parents.get(monster.index);
    if (!srdMonster) {
      return;
    }
    const overlay = tableMonsters.find(
      (m) => isArtOnlyOverlay(m) && m.parentIndex === monster.index
    );
    setArtTarget({ monster: srdMonster, overlay });
  }

  function handleDeleteRequest(monster: MonsterSummary) {
    const stored = tableMonsters.find((m) => m.id === monster.index);
    if (stored) {
      setDeletingMonster(stored);
    }
  }

  async function handleConfirmDelete() {
    if (!deletingMonster) {
      return;
    }
    await deleteTableMonsterLocally(deletingMonster.id, deletingMonster.tableId);
    setDeletingMonster(null);
  }

  return (
    <>
      <Modal
        isOpen={isOpen}
        onRequestClose={onRequestClose}
        style={{ content: { maxWidth: "480px", width: "100%" } }}
      >
      <Flex sx={{ flexDirection: "column", height: "70vh" }} m={2}>
        <Text as="h2" variant="heading" sx={{ fontSize: 3 }} mb={1}>
          Adicionar NPCs
        </Text>
        <Text as="p" variant="caption" mb={2}>
          Escolha quantas de quais criaturas adicionar a este mapa.
        </Text>
        <Flex
          sx={{
            justifyContent: "center",
            borderBottom: "1px solid",
            borderColor: "rgba(255, 255, 255, 0.06)",
            flexShrink: 0,
          }}
          mb={2}
        >
          <Button
            variant={tab === "bestiary" ? "tabActive" : "tab"}
            onClick={() => setTab("bestiary")}
            aria-pressed={tab === "bestiary"}
          >
            Bestiário
          </Button>
          <Button
            variant={tab === "creations" ? "tabActive" : "tab"}
            onClick={() => setTab("creations")}
            aria-pressed={tab === "creations"}
          >
            Criações
          </Button>
        </Flex>
        <Box pb={2}>
          <Input
            aria-label="Buscar criatura"
            placeholder="Buscar criatura"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            sx={{ borderRadius: "4px", fontSize: 0, py: 1 }}
          />
        </Box>
        <SimpleBar style={{ flexGrow: 1, height: "100%", minHeight: 0 }}>
          {tab === "bestiary" && (
            <Button
              variant="menuItem"
              onClick={() => setForm({})}
              sx={{ mb: 1 }}
            >
              <AddIcon />
              Criar criatura do zero
            </Button>
          )}
          {srdSummaries.length === 0 && (
            <Text as="p" variant="caption" px={2}>
              Carregando bestiário…
            </Text>
          )}
          {srdSummaries.length > 0 && results.length === 0 && (
            <Text as="p" variant="caption" px={2}>
              {tab === "bestiary"
                ? "Nenhuma criatura encontrada."
                : "Nenhuma criação ainda."}
            </Text>
          )}
          {groupedResults
            ? groupedResults.map(([type, monsters]) => (
                <Box key={type} mb={2}>
                  <Text
                    as="div"
                    variant="labelCaps"
                    sx={{ color: "gray", px: 2, py: 1 }}
                  >
                    {type}
                  </Text>
                  {monsters.map((monster) => (
                    <NpcPickerRow
                      key={monster.index}
                      monster={monster}
                      count={countFor(monster.index)}
                      onIncrement={handleIncrement}
                      onDecrement={handleDecrement}
                      onOpen={(opened) => setOpenIndex(opened.index)}
                      onDerive={
                        canManage && tab === "bestiary" ? handleDerive : undefined
                      }
                      onEdit={
                        canManage && tab === "creations" ? handleEdit : undefined
                      }
                      onEditArt={
                        canManage && tab === "bestiary" ? handleEditArt : undefined
                      }
                      onDelete={
                        canManage && tab === "creations"
                          ? handleDeleteRequest
                          : undefined
                      }
                    />
                  ))}
                </Box>
              ))
            : results.map((monster) => (
                <NpcPickerRow
                  key={monster.index}
                  monster={monster}
                  count={countFor(monster.index)}
                  onIncrement={handleIncrement}
                  onDecrement={handleDecrement}
                  onOpen={(opened) => setOpenIndex(opened.index)}
                  onDerive={
                    canManage && tab === "bestiary" ? handleDerive : undefined
                  }
                  onEdit={canManage && tab === "creations" ? handleEdit : undefined}
                  onEditArt={
                    canManage && tab === "bestiary" ? handleEditArt : undefined
                  }
                  onDelete={
                    canManage && tab === "creations"
                      ? handleDeleteRequest
                      : undefined
                  }
                />
              ))}
        </SimpleBar>
        <Button mt={2} onClick={handleConfirm} disabled={totalPending === 0}>
          Adicionar{totalPending > 0 ? ` (${totalPending})` : ""}
        </Button>
      </Flex>
      </Modal>
      <MonsterStatBlockModal
        isOpen={openIndex !== null}
        onRequestClose={() => setOpenIndex(null)}
        monsterIndex={openIndex}
        tableId={tableId}
      />
      {form !== false && (
        <MonsterFormModal
          isOpen
          onRequestClose={() => setForm(false)}
          tableId={tableId}
          monster={form.monster}
          parent={form.parent}
          parentIndex={form.parentIndex}
        />
      )}
      {artTarget !== false && (
        <MonsterArtModal
          isOpen
          onRequestClose={() => setArtTarget(false)}
          tableId={tableId}
          monster={artTarget.monster}
          overlay={artTarget.overlay}
        />
      )}
      <ConfirmModal
        isOpen={Boolean(deletingMonster)}
        onRequestClose={() => setDeletingMonster(null)}
        onConfirm={handleConfirmDelete}
        confirmText="Excluir"
        label="Excluir criatura"
        description={
          deletingMonster
            ? `Isso remove "${deletingMonster.name}" da Mesa para sempre.`
            : ""
        }
      />
    </>
  );
}

export default AddNpcModal;
